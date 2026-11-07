import { getDb } from "./db.js";
import { queryTenant, queryTenantOne } from "./dbTenant.js";

export async function searchStudents(schoolId, search = "") {
  const value = String(search).trim();
  const pattern = `%${value}%`;
  const [rows] = await queryTenant(
    schoolId,
    `SELECT id, student_uid, admission_number, full_name, class_name, stream, photo_url, status
     FROM students
     WHERE school_id = ? AND status = 'active'
       AND (? = '' OR full_name LIKE ? OR admission_number LIKE ? OR student_uid LIKE ?)
     ORDER BY full_name ASC
     LIMIT 100`,
    [schoolId, value, pattern, pattern, pattern],
  );
  return rows;
}

export async function getStudentSummary(schoolId) {
  const [rows] = await queryTenant(
    schoolId,
    `SELECT COUNT(*) AS students,
            SUM(photo_url IS NULL OR photo_url = '') AS without_photos
       FROM students
      WHERE school_id = ? AND status = 'active'`,
    [schoolId],
  );
  return rows[0];
}

export async function getRecentImports(schoolId) {
  const [rows] = await queryTenant(
    schoolId,
    `SELECT file_name, imported_rows, created_at, status
       FROM import_batches
      WHERE school_id = ?
      ORDER BY created_at DESC
      LIMIT 3`,
    [schoolId],
  );
  return rows;
}

export async function getStudentByUid(schoolId, studentUid) {
  return queryTenantOne(
    schoolId,
    `SELECT s.*, sc.school_name AS registered_school_name
       FROM students s
       LEFT JOIN schools sc ON sc.school_id = s.school_id
      WHERE s.school_id = ? AND s.student_uid = ?
      LIMIT 1`,
    [schoolId, studentUid],
  );
}

export async function getStudentsForCards(schoolId) {
  const [rows] = await queryTenant(
    schoolId,
    `SELECT id, student_uid, admission_number, full_name, class_name, stream, photo_url
       FROM students
      WHERE school_id = ? AND status = 'active'
      ORDER BY full_name ASC
      LIMIT 500`,
    [schoolId],
  );
  return rows;
}

export async function getSchoolSettings(schoolId) {
  return queryTenantOne(
    schoolId,
    `SELECT school_id, school_name, school_code, address, contact_phone, contact_email, logo_url
       FROM schools
      WHERE school_id = ?
      LIMIT 1`,
    [schoolId],
  );
}

export async function getUsers(schoolId) {
  const [rows] = await queryTenant(
    schoolId,
    `SELECT u.id, u.email, u.phone, u.display_name, u.role, u.status, u.last_login_at, u.created_at,
            MAX(s.last_seen_at) AS last_seen_at,
            SUM(s.expires_at > CURRENT_TIMESTAMP
                AND s.last_seen_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 5 MINUTE)) AS active_sessions
       FROM users u
       LEFT JOIN sessions s ON s.user_id = u.id AND s.school_id = u.school_id
      WHERE u.school_id = ?
      GROUP BY u.id, u.email, u.phone, u.display_name, u.role, u.status, u.last_login_at, u.created_at
      ORDER BY u.created_at ASC`,
    [schoolId],
  );
  return rows;
}

export async function getPublicStudentByUid(studentUid) {
  const [rows] = await getDb().query(
    `SELECT s.student_uid, s.full_name, s.admission_number, s.class_name, s.stream, s.gender, s.photo_url,
            s.school_name, sc.school_name AS registered_school_name
       FROM students s
       LEFT JOIN schools sc ON sc.school_id = s.school_id
      WHERE s.student_uid = ?
      LIMIT 1`,
    [studentUid],
  );
  return rows[0] || null;
}