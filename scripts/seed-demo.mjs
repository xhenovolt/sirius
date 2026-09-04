import fs from "node:fs/promises";
import mysql from "mysql2/promise";

function readEnv(contents) {
  return Object.fromEntries(contents.split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => { const separator = line.indexOf("="); return [line.slice(0, separator), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "")]; }));
}

const env = readEnv(await fs.readFile(".env.local", "utf8"));
const db = await mysql.createConnection({ host: env.TIDB_HOST, port: Number(env.TIDB_PORT || 4000), user: env.TIDB_USER, password: env.TIDB_PASSWORD, database: env.TIDB_DB, ssl: { minVersion: "TLSv1.2" } });
const students = [
  ["SIRIUS-JIPRA-ADM-0001", "ADM-0001", "Amina", "Nabirye", "Female", "S.2", "Blue", "Fictional Guardian", "+256700000001"],
  ["SIRIUS-JIPRA-ADM-0002", "ADM-0002", "Daniel", "Okello", "Male", "S.3", "Green", "Fictional Guardian", "+256700000002"],
  ["SIRIUS-JIPRA-ADM-0003", "ADM-0003", "Mariam", "Kato", "Female", "S.1", "Red", "Fictional Guardian", "+256700000003"],
];

try {
  const [batch] = await db.query("INSERT INTO import_batches (school_id, file_name, total_rows, valid_rows, imported_rows, status, completed_at) VALUES ('default', 'demo-students.xlsx', 3, 3, 3, 'completed', CURRENT_TIMESTAMP)");
  for (const student of students) await db.query(
    `INSERT INTO students (school_id, student_uid, admission_number, first_name, last_name, full_name, gender, class_name, stream, parent_name, parent_phone, school_name, import_batch_id)
     VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Jipra Secondary School', ?)
     ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), updated_at = CURRENT_TIMESTAMP`,
    [student[0], student[1], student[2], student[3], `${student[2]} ${student[3]}`, student[4], student[5], student[6], student[7], student[8], batch.insertId],
  );
  console.log("Demo students ready: 3 fictional records.");
} finally {
  await db.end();
}