import { randomBytes } from "node:crypto";
import { assertTenantId, queryTenant, queryTenantOne, withTenantTransaction } from "./dbTenant.js";
import { listSchoolUsers } from "./schoolUsers.js";
import { checkCapacity } from "./entitlements.js";

export async function searchStudents(schoolId, search = "") {
  const value = String(search).trim();
  const pattern = `%${value}%`;
  const [rows] = await queryTenant(
    schoolId,
    `SELECT id, student_uid, student_account_no, full_name, class_name, stream, photo_url, status
     FROM students
     WHERE school_id = ? AND status = 'active'
       AND (? = '' OR full_name LIKE ? OR student_account_no LIKE ? OR student_uid LIKE ?)
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
    `SELECT id, student_uid, student_account_no, full_name, class_name, stream, photo_url
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
    `SELECT school_id, school_name, school_code, address, contact_phone, contact_email, logo_url, current_term
       FROM schools
      WHERE school_id = ?
      LIMIT 1`,
    [schoolId],
  );
}

export async function getUsers(schoolId) {
  return listSchoolUsers(schoolId);
}

const studentFields = {
  student_account_no: 64,
  first_name: 100,
  last_name: 100,
  gender: 32,
  class_name: 64,
  stream: 64,
  photo_url: 500,
  parent_name: 205,
  parent_phone: 32,
};

function normalizeMoney(value) {
  const [whole, fraction = ""] = String(value).split(".");
  return `${whole.replace(/^0+(?=\d)/, "")}.${fraction.padEnd(2, "0")}`;
}

export function validateStudentInput(input, { partial = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new StudentInputError("Student details must be an object.");
  }
  const cleaned = {};
  for (const [field, maxLength] of Object.entries(studentFields)) {
    if (partial && !Object.hasOwn(input, field)) continue;
    const value = input[field] == null ? "" : String(input[field]).trim();
    if (value.length > maxLength) throw new StudentInputError(`${field.replaceAll("_", " ")} is longer than ${maxLength} characters.`);
    cleaned[field] = value || null;
  }
  if ((!partial || Object.hasOwn(input, "first_name")) && !cleaned.first_name) {
    throw new StudentInputError("First name is required.");
  }
  if ((!partial || Object.hasOwn(input, "last_name")) && !cleaned.last_name) {
    throw new StudentInputError("Last name is required.");
  }
  if ((!partial || Object.hasOwn(input, "student_account_no")) && !cleaned.student_account_no) {
    throw new StudentInputError("Student account number is required.");
  }
  if (!partial || Object.hasOwn(input, "fee_balance")) {
    const value = input.fee_balance == null ? "0" : String(input.fee_balance).trim();
    if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(value)) {
      throw new StudentInputError("Fee balance must be a non-negative amount with up to two decimal places.");
    }
    cleaned.fee_balance = normalizeMoney(value);
  }
  return cleaned;
}

export class StudentInputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "StudentInputError";
    this.status = status;
  }
}

function newStudentUid() {
  return `SIRIUS-${randomBytes(16).toString("hex").toUpperCase()}`;
}

async function insertStudentAudit(scoped, { schoolId, session, request, action, studentUid, details }) {
  const forwarded = request?.headers?.get?.("x-forwarded-for");
  await scoped.query(
    `INSERT INTO audit_logs
      (school_id, user_id, actor_email, action, entity_type, entity_id, details, ip_address, user_agent)
     VALUES (?, ?, ?, ?, 'student', ?, ?, ?, ?)`,
    [
      schoolId,
      session?.id || null,
      session?.email || null,
      action,
      studentUid,
      JSON.stringify(details),
      (forwarded ? forwarded.split(",")[0].trim() : request?.headers?.get?.("x-real-ip"))?.slice(0, 64) || null,
      request?.headers?.get?.("user-agent")?.slice(0, 255) || null,
    ],
  );
}

export async function createStudent(schoolId, input, session, request) {
  assertTenantId(schoolId);
  const student = validateStudentInput(input);
  const over = await checkCapacity(schoolId, "learners", 1);
  if (over) throw new StudentInputError(over.body.error, over.status);
  const fullName = `${student.first_name} ${student.last_name}`.trim();
  const uid = newStudentUid();
  return withTenantTransaction(schoolId, async (scoped) => {
    const [[school]] = await scoped.query(
      "SELECT school_name FROM schools WHERE school_id = ? LIMIT 1",
      [schoolId],
    );
    if (!school) throw new StudentInputError("School not found.", 404);
    const [result] = await scoped.query(
      `INSERT INTO students
        (school_id, student_uid, student_account_no, first_name, last_name, full_name,
         gender, class_name, stream, photo_url, parent_name, parent_phone, school_name, fee_balance)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        schoolId, uid, student.student_account_no, student.first_name, student.last_name, fullName,
        student.gender, student.class_name, student.stream, student.photo_url, student.parent_name,
        student.parent_phone, school.school_name, student.fee_balance,
      ],
    );
    await scoped.query(
      `INSERT INTO fee_balance_history
        (school_id, student_id, previous_balance, new_balance, changed_by, source)
       VALUES (?, ?, 0, ?, ?, 'manual')`,
      [schoolId, result.insertId, student.fee_balance, session?.id || null],
    );
    await insertStudentAudit(scoped, {
      schoolId,
      session,
      request,
      action: "student.created",
      studentUid: uid,
      details: { studentAccountNo: student.student_account_no },
    });
    return { id: result.insertId, studentUid: uid };
  });
}

export async function updateStudent(schoolId, studentUid, input, expectedVersion, session, request) {
  assertTenantId(schoolId);
  const student = validateStudentInput(input, { partial: true });
  if (!Number.isSafeInteger(Number(expectedVersion)) || Number(expectedVersion) < 1) {
    throw new StudentInputError("A valid student version is required.");
  }
  if (Object.keys(student).length === 0) throw new StudentInputError("No student changes were provided.");

  return withTenantTransaction(schoolId, async (scoped) => {
    const [rows] = await scoped.query(
      `SELECT id, first_name, last_name, fee_balance, version
         FROM students
        WHERE school_id = ? AND student_uid = ?
        FOR UPDATE`,
      [schoolId, studentUid],
    );
    const current = rows[0];
    if (!current) throw new StudentInputError("Student not found.", 404);
    if (Number(current.version) !== Number(expectedVersion)) {
      throw new StudentInputError("This student record changed since it was loaded. Reload before saving.", 409);
    }

    const fields = Object.keys(student);
    const nextFirstName = student.first_name ?? current.first_name;
    const nextLastName = student.last_name ?? current.last_name;
    const values = fields.map((field) => student[field]);
    if (fields.includes("first_name") || fields.includes("last_name")) {
      fields.push("full_name");
      values.push(`${nextFirstName} ${nextLastName}`.trim());
    }
    const assignments = fields.map((field) => `\`${field}\` = ?`);
    assignments.push("version = version + 1");
    values.push(current.id, schoolId, Number(expectedVersion));
    const [result] = await scoped.query(
      `UPDATE students SET ${assignments.join(", ")}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND school_id = ? AND version = ?`,
      values,
    );
    if (result.affectedRows !== 1) {
      throw new StudentInputError("This student record changed since it was loaded. Reload before saving.", 409);
    }

    if (Object.hasOwn(student, "fee_balance") && normalizeMoney(current.fee_balance) !== student.fee_balance) {
      await scoped.query(
        `INSERT INTO fee_balance_history
          (school_id, student_id, previous_balance, new_balance, changed_by, source)
         VALUES (?, ?, ?, ?, ?, 'manual')`,
        [schoolId, current.id, current.fee_balance, student.fee_balance, session?.id || null],
      );
    }
    await insertStudentAudit(scoped, {
      schoolId,
      session,
      request,
      action: "student.updated",
      studentUid,
      details: { fields: Object.keys(student) },
    });
    return { studentUid, version: Number(expectedVersion) + 1 };
  });
}

export async function updateStudentPhoto(schoolId, studentUid, photoUrl, session, request) {
  assertTenantId(schoolId);
  return withTenantTransaction(schoolId, async (scoped) => {
    const [result] = await scoped.query(
      `UPDATE students
          SET photo_url = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
        WHERE student_uid = ? AND school_id = ?`,
      [photoUrl, studentUid, schoolId],
    );
    if (result.affectedRows !== 1) return false;
    await insertStudentAudit(scoped, {
      schoolId,
      session,
      request,
      action: "student.photo_updated",
      studentUid,
      details: {},
    });
    return true;
  });
}
