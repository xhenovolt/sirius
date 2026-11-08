import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";

function readEnv(contents) {
  return Object.fromEntries(
    contents
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "")];
      }),
  );
}

const env = readEnv(await fs.readFile(".env.local", "utf8"));
const migrationsDir = path.join("database", "migrations");
const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();

async function checkStudentUidMigrationPreconditions(connection, file) {
  if (file === "013_password_reset_tenant.sql") {
    const [columns] = await connection.query("SHOW COLUMNS FROM password_reset_codes");
    const hasSchoolId = columns.some((column) => column.Field === "school_id");
    const [[orphaned]] = await connection.query(`
      SELECT COUNT(*) AS count
        FROM password_reset_codes p
        LEFT JOIN users u ON u.id = p.user_id
       WHERE u.id IS NULL
          OR u.school_id IS NULL
          ${hasSchoolId ? "OR (p.school_id IS NOT NULL AND p.school_id <> u.school_id)" : ""}
    `);
    if (Number(orphaned.count) > 0) {
      throw new Error(
        `Cannot apply ${file}: ${orphaned.count} password reset row(s) have no matching user school.`,
      );
    }
    return;
  }

  if (file === "006_student_core.sql") {
    const [columns] = await connection.query("SHOW COLUMNS FROM students");
    const columnNames = new Set(columns.map((column) => column.Field));
    const accountNumberColumn = columnNames.has("student_account_no")
      ? "student_account_no"
      : columnNames.has("admission_number") ? "admission_number" : null;
    if (!accountNumberColumn) throw new Error(`Cannot apply ${file}: no student account-number column exists.`);
    const [duplicates] = await connection.query(`
      SELECT school_id, \`${accountNumberColumn}\` AS account_number, COUNT(*) AS duplicate_count
        FROM students
       GROUP BY school_id, \`${accountNumberColumn}\`
      HAVING COUNT(*) > 1
       LIMIT 1
    `);
    if (duplicates.length) {
      const row = duplicates[0];
      throw new Error(
        `Cannot apply ${file}: duplicate imported student number ${JSON.stringify(row.account_number)} ` +
        `exists in school ${JSON.stringify(row.school_id)}.`,
      );
    }
    return;
  }
  if (file !== "005_school_scoped_student_uid.sql") return;

  const [duplicateAccounts] = await connection.query(`
    SELECT school_id, admission_number, COUNT(*) AS duplicate_count
      FROM students
     GROUP BY school_id, admission_number
    HAVING COUNT(*) > 1
     LIMIT 1
  `);
  if (duplicateAccounts.length) {
    const row = duplicateAccounts[0];
    throw new Error(
      `Cannot apply ${file}: duplicate admission_number ${JSON.stringify(row.admission_number)} ` +
      `exists in school ${JSON.stringify(row.school_id)}.`,
    );
  }

  const [duplicateSchoolUids] = await connection.query(`
    SELECT school_id, student_uid, COUNT(*) AS duplicate_count
      FROM students
     GROUP BY school_id, student_uid
    HAVING COUNT(*) > 1
     LIMIT 1
  `);
  if (duplicateSchoolUids.length) {
    const row = duplicateSchoolUids[0];
    throw new Error(
      `Cannot apply ${file}: duplicate student_uid ${JSON.stringify(row.student_uid)} ` +
      `exists in school ${JSON.stringify(row.school_id)}.`,
    );
  }
}

async function applyMigration(connection, file) {
  if (file === "013_password_reset_tenant.sql") {
    await connection.query(await fs.readFile(path.join(migrationsDir, file), "utf8"));
    const [indexes] = await connection.query("SHOW INDEX FROM password_reset_codes");
    if (!indexes.some((index) => index.Key_name === "password_reset_school_user_index")) {
      await connection.query(
        "ALTER TABLE password_reset_codes ADD KEY password_reset_school_user_index (school_id, user_id, created_at)",
      );
    }
    const [constraints] = await connection.query(`
      SELECT constraint_name
        FROM information_schema.table_constraints
       WHERE table_schema = DATABASE()
         AND table_name = 'password_reset_codes'
         AND constraint_name = 'password_reset_school_fk'
    `);
    if (!constraints.length) {
      await connection.query(
        "ALTER TABLE password_reset_codes ADD CONSTRAINT password_reset_school_fk FOREIGN KEY (school_id) REFERENCES schools (school_id)",
      );
    }
    return;
  }

  if (file === "006_student_core.sql") {
    const [studentColumns] = await connection.query("SHOW COLUMNS FROM students");
    const studentColumnNames = new Set(studentColumns.map((column) => column.Field));
    const [studentIndexes] = await connection.query("SHOW INDEX FROM students");
    const studentIndexNames = new Set(studentIndexes.map((index) => index.Key_name));

    if (studentColumnNames.has("admission_number")) {
      if (studentIndexNames.has("students_school_admission_unique")) {
        await connection.query("ALTER TABLE students DROP INDEX students_school_admission_unique");
      }
      await connection.query(
        "ALTER TABLE students CHANGE COLUMN admission_number student_account_no VARCHAR(64) NOT NULL",
      );
    }
    if (!studentIndexNames.has("students_school_account_unique")) {
      await connection.query(
        "ALTER TABLE students ADD UNIQUE KEY students_school_account_unique (school_id, student_account_no)",
      );
    }

    const [stagingColumns] = await connection.query("SHOW COLUMNS FROM import_rows");
    const stagingColumnNames = new Set(stagingColumns.map((column) => column.Field));
    if (stagingColumnNames.has("admission_number")) {
      await connection.query(
        "ALTER TABLE import_rows CHANGE COLUMN admission_number student_account_no VARCHAR(64) NULL",
      );
    }
    if (!studentColumnNames.has("fee_balance")) {
      await connection.query(
        "ALTER TABLE students ADD COLUMN fee_balance DECIMAL(14, 2) NOT NULL DEFAULT 0",
      );
    }
    if (!studentColumnNames.has("version")) {
      await connection.query(
        "ALTER TABLE students ADD COLUMN version BIGINT UNSIGNED NOT NULL DEFAULT 1",
      );
    }
    return connection.query(await fs.readFile(path.join(migrationsDir, file), "utf8"));
  }
  if (file !== "005_school_scoped_student_uid.sql") {
    return connection.query(await fs.readFile(path.join(migrationsDir, file), "utf8"));
  }

  const [indexes] = await connection.query("SHOW INDEX FROM students");
  const names = new Set(indexes.map((index) => index.Key_name));
  if (!names.has("students_school_uid_unique")) {
    await connection.query(
      "ALTER TABLE students ADD UNIQUE KEY students_school_uid_unique (school_id, student_uid)",
    );
    names.add("students_school_uid_unique");
  }
  if (names.has("students_uid_unique")) {
    await connection.query("ALTER TABLE students DROP INDEX students_uid_unique");
  }
}

const connection = await mysql.createConnection({
  host: env.TIDB_HOST,
  port: Number(env.TIDB_PORT || 4000),
  user: env.TIDB_USER,
  password: env.TIDB_PASSWORD,
  database: env.TIDB_DB,
  ssl: { minVersion: "TLSv1.2" },
  multipleStatements: true,
});

try {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (name)
    )
  `);

  const [applied] = await connection.query("SELECT name FROM schema_migrations");
  const appliedNames = new Set(applied.map((row) => row.name));

  let count = 0;
  for (const file of files) {
    if (appliedNames.has(file)) {
      console.log(`skip    ${file}`);
      continue;
    }
    await checkStudentUidMigrationPreconditions(connection, file);
    await applyMigration(connection, file);
    await connection.query("INSERT INTO schema_migrations (name) VALUES (?)", [file]);
    console.log(`applied ${file}`);
    count += 1;
  }

  console.log(count ? `${count} migration(s) applied.` : "Database is up to date.");
} finally {
  await connection.end();
}
