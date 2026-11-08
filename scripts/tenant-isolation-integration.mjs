import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const confirmation = "I_CONFIRM_THIS_IS_A_DISPOSABLE_TEST_DATABASE";

function parseEnv(contents) {
  return Object.fromEntries(
    contents
      .split(/\r?\n/)
      .filter((line) => line && !line.trimStart().startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [
          line.slice(0, separator).trim(),
          line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, ""),
        ];
      }),
  );
}

async function readOptionalEnv(file) {
  try {
    return parseEnv(await fs.readFile(path.join(root, file), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

function targetKey(host, port, database) {
  return `${String(host).toLowerCase()}:${Number(port || 4000)}/${String(database).toLowerCase()}`;
}

function assertTestTarget(testEnv, productionEnv) {
  const required = ["TIDB_TEST_HOST", "TIDB_TEST_USER", "TIDB_TEST_PASSWORD", "TIDB_TEST_DB"];
  const missing = required.filter((key) => !testEnv[key]);
  if (missing.length) {
    throw new Error(`Configure ${missing.join(", ")} in .env.test.local before running integration tests.`);
  }
  if (testEnv.SIRIUS_TEST_DATABASE_CONFIRM !== confirmation) {
    throw new Error(`Set SIRIUS_TEST_DATABASE_CONFIRM=${confirmation} in .env.test.local to authorize disposable fixtures.`);
  }
  if (!/(?:_test|_integration|_ci)$/i.test(testEnv.TIDB_TEST_DB)) {
    throw new Error("TIDB_TEST_DB must end in _test, _integration, or _ci.");
  }
  if (
    productionEnv.TIDB_HOST
    && productionEnv.TIDB_DB
    && targetKey(testEnv.TIDB_TEST_HOST, testEnv.TIDB_TEST_PORT, testEnv.TIDB_TEST_DB)
      === targetKey(productionEnv.TIDB_HOST, productionEnv.TIDB_PORT, productionEnv.TIDB_DB)
  ) {
    throw new Error("The integration-test database matches .env.local; refusing to write fixtures.");
  }
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function testSchoolId() {
  return `sirius_it_${randomBytes(12).toString("hex")}`;
}

async function removeFixtures(connection, schoolIds) {
  if (schoolIds.length === 0) return;
  const placeholders = schoolIds.map(() => "?").join(", ");
  const scopedTables = [
    "scan_events",
    "qr_identities",
    "student_photos",
    "clearance_allowances",
    "clearance_threshold_rules",
    "fee_balance_history",
    "import_batch_undo",
    "import_rows",
    "import_batch_files",
    "import_batch_versions",
    "import_mapping_templates",
    "card_templates",
    "sessions",
    "password_reset_codes",
    "audit_logs",
    "user_roles",
    "students",
    "import_batches",
    "users",
    "roles",
  ];
  for (const table of scopedTables) {
    await connection.query(
      `DELETE FROM \`${table}\` WHERE school_id IN (${placeholders})`,
      schoolIds,
    );
  }
  await connection.query(
    `DELETE FROM schools WHERE school_id IN (${placeholders})`,
    schoolIds,
  );
}

async function verifyAppliedMigrations(connection) {
  const migrationsDir = path.join(root, "database", "migrations");
  const expected = (await fs.readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const [rows] = await connection.query("SELECT name FROM schema_migrations");
  const applied = new Set(rows.map((row) => row.name));
  const missing = expected.filter((name) => !applied.has(name));
  if (missing.length) {
    throw new Error(`The test database is missing migrations: ${missing.join(", ")}. Apply them to the test database first.`);
  }
}

async function main() {
  const [testEnv, productionEnv] = await Promise.all([
    readOptionalEnv(".env.test.local"),
    readOptionalEnv(".env.local"),
  ]);
  assertTestTarget(testEnv, productionEnv);

  process.env.TIDB_HOST = testEnv.TIDB_TEST_HOST;
  process.env.TIDB_PORT = testEnv.TIDB_TEST_PORT || "4000";
  process.env.TIDB_USER = testEnv.TIDB_TEST_USER;
  process.env.TIDB_PASSWORD = testEnv.TIDB_TEST_PASSWORD;
  process.env.TIDB_DB = testEnv.TIDB_TEST_DB;

  const connection = await mysql.createConnection({
    host: process.env.TIDB_HOST,
    port: Number(process.env.TIDB_PORT),
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DB,
    ssl: { minVersion: "TLSv1.2" },
    multipleStatements: false,
  });
  let appDb;
  const schoolIds = [testSchoolId(), testSchoolId()];
  const createdSchoolIds = [];
  let failure;

  try {
    const [[databaseInfo]] = await connection.query("SELECT DATABASE() AS selected_database");
    if (databaseInfo.selected_database !== process.env.TIDB_TEST_DB) {
      throw new Error("Connected database does not match TIDB_TEST_DB; refusing to write fixtures.");
    }
    await verifyAppliedMigrations(connection);

    const [{ seedSchoolRoles }, { createStudent, getStudentByUid, getStudentsForCards }, { createUser }] = await Promise.all([
      import("../src/lib/tenancy.js"),
      import("../src/lib/students.js"),
      import("../src/lib/auth.js"),
    ]);
    appDb = (await import("../src/lib/db.js")).getDb();
    const imports = await import("../src/lib/imports.js");
    const { issueIdentitiesForStudents, issueIdentity, IdentityError } = await import("../src/lib/identity.js");
    const { performSchoolUserAction } = await import("../src/lib/schoolUsers.js");
    const { listAuditLogs, recordAuditLog } = await import("../src/lib/audit.js");

    for (const [index, schoolId] of schoolIds.entries()) {
      await connection.query(
        "INSERT INTO schools (school_id, school_name, status) VALUES (?, ?, 'active')",
        [schoolId, `Isolation Test School ${index + 1}`],
      );
      createdSchoolIds.push(schoolId);
      await seedSchoolRoles(connection, schoolId);
    }
    pass("created two isolated test schools with school-specific roles");

    const [schoolA, schoolB] = schoolIds;
    const userAResult = await createUser({
      schoolId: schoolA,
      email: `${schoolA}@example.invalid`,
      password: "Disposable-Test-Password-01",
      displayName: "Isolation Admin A",
      roleSlug: "operator",
    });
    const userBResult = await createUser({
      schoolId: schoolB,
      email: `${schoolB}@example.invalid`,
      password: "Disposable-Test-Password-02",
      displayName: "Isolation Admin B",
      roleSlug: "operator",
    });
    const sessionA = { id: userAResult.userId, email: `${schoolA}@example.invalid`, school_id: schoolA };
    const sessionB = { id: userBResult.userId, email: `${schoolB}@example.invalid`, school_id: schoolB };
    const accountNumber = `SHARED-${randomBytes(4).toString("hex")}`;
    const studentA = await createStudent(schoolA, {
      student_account_no: accountNumber,
      first_name: "Student",
      last_name: "A",
      fee_balance: "10.00",
    }, sessionA);
    const studentB = await createStudent(schoolB, {
      student_account_no: accountNumber,
      first_name: "Student",
      last_name: "B",
      fee_balance: "20.00",
    }, sessionB);
    assert.notEqual(studentA.studentUid, studentB.studentUid);
    assert.equal((await getStudentByUid(schoolA, studentB.studentUid)), null);
    assert.equal((await getStudentByUid(schoolB, studentA.studentUid)), null);
    assert.deepEqual((await getStudentsForCards(schoolA)).map((row) => row.student_uid), [studentA.studentUid]);
    await assert.rejects(
      createStudent(schoolA, {
        student_account_no: accountNumber,
        first_name: "Duplicate",
        last_name: "A",
      }, sessionA),
      (error) => error.code === "ER_DUP_ENTRY",
    );
    pass("same student number is allowed across schools; student reads, card lists, and uniqueness stay school-scoped");

    const [identitiesB] = await Promise.all([
      issueIdentity(studentB.id, { schoolId: schoolB }),
    ]);
    assert.equal(Object.keys(await issueIdentitiesForStudents(schoolA, [studentB.id])).length, 0);
    await assert.rejects(
      issueIdentity(studentB.id, { schoolId: schoolA }),
      (error) => error instanceof IdentityError && error.status === 404,
    );
    assert.equal(identitiesB.school_id, schoolB);
    pass("card issuance cannot resolve or create an identity for another school's student");

    const userLists = await Promise.all([
      (await import("../src/lib/students.js")).getUsers(schoolA),
      (await import("../src/lib/students.js")).getUsers(schoolB),
    ]);
    assert.deepEqual(userLists[0].map((row) => row.email), [sessionA.email]);
    assert.deepEqual(userLists[1].map((row) => row.email), [sessionB.email]);
    const foreignDelete = await performSchoolUserAction({
      schoolId: schoolA,
      actorId: userAResult.userId,
      userId: userBResult.userId,
      action: "delete",
    });
    assert.equal(foreignDelete.ok, false);
    assert.equal(foreignDelete.status, 404);
    assert.equal((await (await import("../src/lib/students.js")).getUsers(schoolB)).length, 1);
    pass("user listing and soft deletion are scoped to the authenticated school");

    const templateA = { student_account_no: "Account", first_name: "First", last_name: "Last" };
    await imports.saveImportMappingTemplate(schoolA, `template-${schoolA}`, templateA, userAResult.userId);
    await imports.saveImportMappingTemplate(schoolB, `template-${schoolB}`, templateA, userBResult.userId);
    assert.equal((await imports.listImportMappingTemplates(schoolA)).some((row) => row.name === `template-${schoolB}`), false);
    pass("saved import mappings are isolated by school");

    const staged = await imports.stageImport({
      fileName: "isolation.csv",
      rows: [{
        student_account_no: accountNumber,
        first_name: "Updated A",
        last_name: "A",
        fee_balance: "35.25",
      }],
      schoolId: schoolA,
      sourceFile: Buffer.from("student_account_no,first_name,last_name,fee_balance"),
      contentType: "text/csv",
      createdBy: userAResult.userId,
    });
    assert.ok(await imports.getImportSourceFile(staged.batchId, schoolA));
    assert.equal(await imports.getImportSourceFile(staged.batchId, schoolB), null);
    assert.equal(await imports.getImportBatch(staged.batchId, schoolB), null);
    assert.equal((await imports.getImportVersionRows(staged.batchId, schoolB, 1)), null);
    assert.equal((await imports.listImportRows(staged.batchId, schoolB)).total, 0);
    await assert.rejects(
      imports.commitImportBatch(staged.batchId, schoolB, sessionB),
      (error) => error.status === 404,
    );
    const review = await imports.listImportRows(staged.batchId, schoolA);
    assert.equal(review.total, 1);
    await imports.updateImportRows(staged.batchId, schoolA, [{
      ...review.rows[0].extracted,
      id: review.rows[0].id,
      acceptedFields: ["first_name", "fee_balance"],
    }], userAResult.userId);
    await imports.commitImportBatch(staged.batchId, schoolA, sessionA);
    assert.equal((await getStudentByUid(schoolA, studentA.studentUid)).first_name, "Updated A");
    assert.equal((await getStudentByUid(schoolA, studentA.studentUid)).fee_balance, "35.25");
    assert.equal((await getStudentByUid(schoolB, studentB.studentUid)).first_name, "Student");
    assert.equal((await getStudentByUid(schoolB, studentB.studentUid)).fee_balance, "20.00");
    const [historyA] = await connection.query(
      "SELECT source FROM fee_balance_history WHERE school_id = ? AND student_id = ? ORDER BY id DESC LIMIT 1",
      [schoolA, studentA.id],
    );
    assert.equal(historyA[0].source, "import");
    pass("import source/version reads and commits are isolated; an accepted balance is historically recorded");

    const rollback = await imports.rollbackImportBatch(staged.batchId, schoolA, sessionA);
    assert.equal(rollback.restored, 1);
    assert.equal((await getStudentByUid(schoolA, studentA.studentUid)).first_name, "Student");
    assert.equal((await getStudentByUid(schoolA, studentA.studentUid)).fee_balance, "10.00");
    assert.equal((await getStudentByUid(schoolB, studentB.studentUid)).fee_balance, "20.00");
    const [historyRollback] = await connection.query(
      "SELECT source FROM fee_balance_history WHERE school_id = ? AND student_id = ? ORDER BY id DESC LIMIT 1",
      [schoolA, studentA.id],
    );
    assert.equal(historyRollback[0].source, "import_rollback");
    pass("tenant-scoped import rollback restores only the owner's student and records the balance reversal");

    await recordAuditLog({ session: sessionA, action: "integration.school_a", entityType: "test" });
    await recordAuditLog({ session: sessionB, action: "integration.school_b", entityType: "test" });
    const [auditA, auditB] = await Promise.all([listAuditLogs(schoolA), listAuditLogs(schoolB)]);
    assert.ok(auditA.some((row) => row.action === "integration.school_a"));
    assert.equal(auditA.some((row) => row.action === "integration.school_b"), false);
    assert.ok(auditB.some((row) => row.action === "integration.school_b"));
    assert.equal(auditB.some((row) => row.action === "integration.school_a"), false);
    pass("audit reads return only the calling school's events");

  } catch (error) {
    failure = error;
  } finally {
    try {
      await removeFixtures(connection, createdSchoolIds);
    } catch (error) {
      failure ||= error;
      console.error("Could not fully remove the uniquely named integration fixtures.");
    }
    if (appDb) await appDb.end();
    await connection.end();
  }

  if (failure) throw failure;
  console.log("Real-TiDB tenant isolation checks passed.");
}

await main();
