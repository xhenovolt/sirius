import { getDb } from "./db";

export async function searchStudents(search = "") {
  const value = search.trim();
  const pattern = `%${value}%`;
  const [rows] = await getDb().query(
    `SELECT id, student_uid, admission_number, full_name, class_name, stream, photo_url, status
     FROM students
     WHERE status = 'active'
       AND (? = '' OR full_name LIKE ? OR admission_number LIKE ? OR student_uid LIKE ?)
     ORDER BY full_name ASC
     LIMIT 100`,
    [value, pattern, pattern, pattern],
  );

  return rows;
}

export async function getStudentSummary() {
  const [rows] = await getDb().query(
    `SELECT
       COUNT(*) AS students,
       SUM(photo_url IS NULL OR photo_url = '') AS without_photos
     FROM students
     WHERE status = 'active'`,
  );

  return rows[0];
}

export async function getRecentImports() {
  const [rows] = await getDb().query(
    `SELECT file_name, imported_rows, created_at, status
     FROM import_batches
     WHERE school_id = 'default'
     ORDER BY created_at DESC
     LIMIT 3`,
  );

  return rows;
}

export async function getStudentByUid(studentUid) {
  const [rows] = await getDb().query(
    `SELECT s.*, sc.school_name AS registered_school_name
     FROM students s
     LEFT JOIN schools sc ON sc.school_id = s.school_id
     WHERE s.student_uid = ?
     LIMIT 1`,
    [studentUid],
  );

  return rows[0] || null;
}

export async function getStudentsForCards() {
  const [rows] = await getDb().query(
    `SELECT id, student_uid, admission_number, full_name, class_name, stream, photo_url
     FROM students
     WHERE status = 'active'
     ORDER BY full_name ASC
     LIMIT 500`,
  );

  return rows;
}

export async function getSchoolSettings() {
  const [rows] = await getDb().query("SELECT school_id, school_name, school_code, address, contact_phone, contact_email, logo_url FROM schools WHERE school_id = 'default' LIMIT 1");
  return rows[0] || null;
}

export async function getUsers() {
  const [rows] = await getDb().query(
    `SELECT u.id, u.email, u.phone, u.display_name, u.role, u.status, u.last_login_at, u.created_at,
       MAX(s.last_seen_at) AS last_seen_at,
      SUM(s.expires_at > CURRENT_TIMESTAMP AND s.last_seen_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 5 MINUTE)) AS active_sessions
     FROM users u LEFT JOIN sessions s ON s.user_id = u.id
     GROUP BY u.id, u.email, u.phone, u.display_name, u.role, u.status, u.last_login_at, u.created_at
     ORDER BY u.created_at ASC`,
  );
  return rows;
}