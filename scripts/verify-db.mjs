import fs from "node:fs/promises";
import mysql from "mysql2/promise";

function readEnvFile(contents) {
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

const env = readEnvFile(await fs.readFile(".env.local", "utf8"));
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
  await connection.query(await fs.readFile("database/schema.sql", "utf8"));
  await connection.query("ALTER TABLE schools ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500) NULL");
  await connection.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(32) NOT NULL DEFAULT ''");
  await connection.query("ALTER TABLE students ADD COLUMN IF NOT EXISTS import_batch_id BIGINT UNSIGNED NULL");
  const [indexes] = await connection.query("SHOW INDEX FROM students");
  if (!indexes.some((index) => index.Key_name === "students_import_batch_index")) {
    await connection.query("ALTER TABLE students ADD KEY students_import_batch_index (import_batch_id)");
  }

  const [constraints] = await connection.query(
    `SELECT CONSTRAINT_NAME AS name
     FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = 'students' AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    [env.TIDB_DB],
  );
  const constraintNames = new Set(constraints.map((constraint) => constraint.name));
  if (!constraintNames.has("students_school_fk")) {
    await connection.query(
      "ALTER TABLE students ADD CONSTRAINT students_school_fk FOREIGN KEY (school_id) REFERENCES schools (school_id)",
    );
  }
  if (!constraintNames.has("students_import_batch_fk")) {
    await connection.query(
      "ALTER TABLE students ADD CONSTRAINT students_import_batch_fk FOREIGN KEY (import_batch_id) REFERENCES import_batches (id)",
    );
  }

  const [rows] = await connection.query("SELECT COUNT(*) AS count FROM students");
  const [tables] = await connection.query(
    `SELECT TABLE_NAME AS name
     FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('schools', 'students', 'import_batches', 'users', 'sessions', 'password_reset_codes')
     ORDER BY TABLE_NAME`,
    [env.TIDB_DB],
  );
  console.log("TiDB connection: OK");
  console.log(`tables: ${tables.map((table) => table.name).join(", ")}`);
  console.log(`student rows: ${rows[0].count}`);
} finally {
  await connection.end();
}