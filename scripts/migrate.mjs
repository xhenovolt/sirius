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
