import { randomBytes } from "node:crypto";
import { getDb } from "./db.js";
import { assertTenantId, queryTenant, queryTenantOne } from "./dbTenant.js";
import { checkCapacity } from "./entitlements.js";

const requiredFields = ["student_account_no", "first_name", "last_name"];

// Accepted spreadsheet header spellings per student column.
const fieldAliases = {
  student_account_no: ["student_account_no", "student account no", "student account number", "admission_number", "admission", "admission number", "Admission Number"],
  first_name: ["first_name", "firstName", "first name", "First Name"],
  last_name: ["last_name", "lastName", "last name", "Last Name"],
  gender: ["gender", "Gender"],
  class_name: ["class_name", "class", "class name", "Class"],
  stream: ["stream", "Stream"],
  photo_url: ["photo_url", "photo", "photo url", "Photo"],
  parent_name: ["parent_name", "parent", "parent name", "Parent Name"],
  parent_phone: ["parent_phone", "parentPhone", "parent phone", "Parent Phone"],
};

// Mirrors the column widths in database/schema.sql so an oversized value is
// caught during review instead of failing the commit.
const maxLengths = {
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
const fieldLabels = { student_account_no: "student account number" };

export const maxImportRows = 20000;
export const defaultPageSize = 50;
export const maxPageSize = 200;

const insertChunkSize = 500;

export class ImportError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "ImportError";
    this.status = status;
  }
}

function clean(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function toJson(value) {
  return JSON.stringify(value ?? null);
}

function fromJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value; // mysql2 parses JSON columns already.
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** Maps one spreadsheet row onto student columns, honouring known header aliases. */
export function normalizeRow(row) {
  const normalized = {};
  for (const field of Object.keys(fieldAliases)) {
    let value = "";
    for (const alias of fieldAliases[field]) {
      const candidate = clean(row?.[alias]);
      if (candidate) {
        value = candidate;
        break;
      }
    }
    normalized[field] = value;
  }
  return normalized;
}

/** Returns the validation messages for one staged row. */
export function validateRow(extracted, duplicateAccountNumbers = new Set()) {
  const errors = requiredFields
    .filter((field) => !clean(extracted?.[field]))
    .map((field) => `${fieldLabels[field] || field.replaceAll("_", " ")} is required`);

  for (const [field, limit] of Object.entries(maxLengths)) {
    if (clean(extracted?.[field]).length > limit) errors.push(`${fieldLabels[field] || field.replaceAll("_", " ")} is longer than ${limit} characters`);
  }

  const key = clean(extracted?.student_account_no).toLowerCase();
  if (key && duplicateAccountNumbers.has(key)) errors.push("duplicate student account number in file");

  return errors;
}

function duplicateAccountNumbersFrom(values) {
  const counts = new Map();
  for (const value of values) {
    const key = clean(value).toLowerCase();
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
}

function shapeRow(row) {
  return {
    id: row.id,
    rowNumber: row.row_number,
    status: row.status,
    studentId: row.student_id,
    studentAccountNo: row.student_account_no || "",
    fullName: row.full_name || "",
    errors: fromJson(row.errors) || [],
    extracted: normalizeRow(fromJson(row.extracted) || {}),
  };
}

/**
 * Puts parsed spreadsheet rows into import_rows staging. Nothing here touches
 * students; the only writer of student data is commitImportBatch.
 */
export async function stageImport({ fileName, rows, schoolId }) {
  assertTenantId(schoolId);
  if (!Array.isArray(rows) || rows.length === 0) throw new ImportError("The spreadsheet did not contain any student rows.");
  if (rows.length > maxImportRows) throw new ImportError(`This file has ${rows.length} rows. Import at most ${maxImportRows} rows at a time.`);

  const extracted = rows.map(normalizeRow);
  const duplicates = duplicateAccountNumbersFrom(extracted.map((row) => row.student_account_no));
  const staged = extracted.map((data, index) => {
    const errors = validateRow(data, duplicates);
    return { rowNumber: index + 2, data, errors, status: errors.length ? "invalid" : "valid" };
  });
  const valid = staged.filter((row) => row.status === "valid").length;

  const connection = await getDb().getConnection();
  try {
    await connection.beginTransaction();
    const [batch] = await connection.query(
      `INSERT INTO import_batches (school_id, file_name, total_rows, valid_rows, invalid_rows, status)
       VALUES (?, ?, ?, ?, ?, 'preview')`,
      [schoolId, clean(fileName).slice(0, 255) || "import", staged.length, valid, staged.length - valid],
    );
    const batchId = batch.insertId;

    const values = staged.map((row) => [
      schoolId,
      batchId,
      row.rowNumber,
      row.data.student_account_no || null,
      `${row.data.first_name} ${row.data.last_name}`.trim() || null,
      toJson(row.data),
      toJson(row.errors),
      row.data.photo_url || null,
      row.status,
    ]);
    for (let index = 0; index < values.length; index += insertChunkSize) {
      await connection.query(
        "INSERT INTO import_rows (school_id, batch_id, `row_number`, student_account_no, full_name, extracted, errors, photo_ref, status) VALUES ?",
        [values.slice(index, index + insertChunkSize)],
      );
    }

    await connection.commit();
    return { batchId, fileName, total: staged.length, valid, invalid: staged.length - valid };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getImportBatch(batchId, schoolId) {
  const batch = await queryTenantOne(
    schoolId,
    `SELECT id, school_id, file_name, total_rows, valid_rows, invalid_rows, imported_rows, status, error_message, created_at, completed_at
     FROM import_batches WHERE id = ? AND school_id = ? LIMIT 1`,
    [batchId, schoolId],
  );
  if (!batch) return null;
  return {
    id: batch.id,
    schoolId: batch.school_id,
    fileName: batch.file_name,
    totalRows: batch.total_rows,
    validRows: batch.valid_rows,
    invalidRows: batch.invalid_rows,
    importedRows: batch.imported_rows,
    status: batch.status,
    errorMessage: batch.error_message,
    createdAt: batch.created_at,
    completedAt: batch.completed_at,
  };
}

export async function listImportRows(batchId, schoolId, { page = 1, pageSize = defaultPageSize, filter = "all" } = {}) {
  const size = Math.min(Math.max(Number(pageSize) || defaultPageSize, 1), maxPageSize);
  const statusFilter = filter === "invalid" ? "AND status = 'invalid'" : "";

  const [[counts]] = await queryTenant(
    schoolId,
    `SELECT COUNT(*) AS total FROM import_rows WHERE batch_id = ? AND school_id = ? ${statusFilter}`,
    [batchId, schoolId],
  );
  // Clamp to the last page: fixing rows shrinks the filtered list underneath the reviewer.
  const current = Math.min(Math.max(Number(page) || 1, 1), Math.max(1, Math.ceil(counts.total / size)));
  const [rows] = await queryTenant(
    schoolId,
    `SELECT id, \`row_number\`, student_account_no, full_name, extracted, errors, status, student_id
     FROM import_rows WHERE batch_id = ? AND school_id = ? ${statusFilter}
     ORDER BY \`row_number\` LIMIT ? OFFSET ?`,
    [batchId, schoolId, size, (current - 1) * size],
  );

  return { page: current, pageSize: size, total: counts.total, rows: rows.map(shapeRow) };
}

/**
 * Re-runs validation across the whole batch and stores the result. Duplicate
 * detection is batch-wide, so editing one row can flip the status of another;
 * every mismatched row is rewritten.
 */
async function revalidateBatch(executor, batchId, schoolId) {
  const [rows] = await executor.query(
    `SELECT id, student_account_no, extracted, errors, status FROM import_rows
     WHERE batch_id = ? AND school_id = ? AND status IN ('pending', 'valid', 'invalid')
     ORDER BY \`row_number\``,
    [batchId, schoolId],
  );
  const duplicates = duplicateAccountNumbersFrom(rows.map((row) => row.student_account_no));
  let valid = 0;

  for (const row of rows) {
    const errors = validateRow(normalizeRow(fromJson(row.extracted) || {}), duplicates);
    const status = errors.length ? "invalid" : "valid";
    if (status === "valid") valid += 1;
    if (status !== row.status || toJson(errors) !== toJson(fromJson(row.errors) || [])) {
      await executor.query("UPDATE import_rows SET errors = ?, status = ? WHERE id = ? AND school_id = ?", [toJson(errors), status, row.id, schoolId]);
    }
  }

  const summary = { total: rows.length, valid, invalid: rows.length - valid };
  await executor.query("UPDATE import_batches SET total_rows = ?, valid_rows = ?, invalid_rows = ? WHERE id = ? AND school_id = ?", [
    summary.total,
    summary.valid,
    summary.invalid,
    batchId,
    schoolId,
  ]);
  return summary;
}

/** Applies reviewed corrections to staged rows, then revalidates the batch. */
export async function updateImportRows(batchId, schoolId, updates) {
  assertTenantId(schoolId);
  if (!Array.isArray(updates) || updates.length === 0) throw new ImportError("No row changes were provided.");
  if (updates.length > maxPageSize) throw new ImportError(`Save at most ${maxPageSize} rows at a time.`);

  const connection = await getDb().getConnection();
  try {
    await connection.beginTransaction();
    const [batchRows] = await connection.query("SELECT id, status FROM import_batches WHERE id = ? AND school_id = ? FOR UPDATE", [batchId, schoolId]);
    const batch = batchRows[0];
    if (!batch) throw new ImportError("Import batch not found.", 404);
    if (batch.status === "completed") throw new ImportError("This import has already been committed.", 409);

    const [stagedRows] = await connection.query(
      "SELECT id FROM import_rows WHERE batch_id = ? AND school_id = ? AND status IN ('pending', 'valid', 'invalid')",
      [batchId, schoolId],
    );
    const editable = new Set(stagedRows.map((row) => row.id));

    for (const update of updates) {
      const id = Number(update?.id);
      if (!Number.isInteger(id) || !editable.has(id)) throw new ImportError("A reviewed row is no longer part of this import. Reload the page and try again.", 409);
      const data = normalizeRow(update);
      await connection.query(
        `UPDATE import_rows SET extracted = ?, student_account_no = ?, full_name = ?, photo_ref = ?
         WHERE id = ? AND batch_id = ? AND school_id = ?`,
        [toJson(data), data.student_account_no || null, `${data.first_name} ${data.last_name}`.trim() || null, data.photo_url || null, id, batchId, schoolId],
      );
    }

    const summary = await revalidateBatch(connection, batchId, schoolId);
    await connection.commit();
    return summary;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function makeUid() {
  return `SIRIUS-${randomBytes(16).toString("hex").toUpperCase()}`;
}

const upsertStudentSql = `
  INSERT INTO students
    (school_id, student_uid, student_account_no, first_name, last_name, full_name, gender, class_name, stream, photo_url, parent_name, parent_phone, school_name, card_extra, import_batch_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON DUPLICATE KEY UPDATE
    first_name = VALUES(first_name), last_name = VALUES(last_name), full_name = VALUES(full_name),
    gender = VALUES(gender), class_name = VALUES(class_name), stream = VALUES(stream),
    photo_url = VALUES(photo_url), parent_name = VALUES(parent_name), parent_phone = VALUES(parent_phone),
    school_name = VALUES(school_name), card_extra = VALUES(card_extra), version = version + 1,
    import_batch_id = VALUES(import_batch_id), updated_at = CURRENT_TIMESTAMP`;

/**
 * Commits one staged batch into students in a single transaction. Rows are
 * matched on the natural key (school_id, student_account_no) so a re-import
 * updates the existing record instead of creating a duplicate.
 */
export async function commitImportBatch(batchId, schoolId) {
  assertTenantId(schoolId);
  const connection = await getDb().getConnection();
  try {
    await connection.beginTransaction();
    const [batchRows] = await connection.query(
      "SELECT id, status FROM import_batches WHERE id = ? AND school_id = ? FOR UPDATE",
      [batchId, schoolId],
    );
    const batch = batchRows[0];
    if (!batch) throw new ImportError("Import batch not found.", 404);
    if (batch.status === "completed") throw new ImportError("This import has already been committed.", 409);

    const summary = await revalidateBatch(connection, batchId, schoolId);
    if (summary.valid === 0) throw new ImportError("There are no valid rows to import. Correct the flagged rows first.");

    const [stagedRows] = await connection.query(
      "SELECT id, extracted FROM import_rows WHERE batch_id = ? AND school_id = ? AND status = 'valid' ORDER BY `row_number`",
      [batchId, schoolId],
    );
    const rows = stagedRows.map((row) => ({ id: row.id, extracted: normalizeRow(fromJson(row.extracted) || {}) }));
    const [[school]] = await connection.query("SELECT school_name FROM schools WHERE school_id = ? LIMIT 1", [schoolId]);

    const accountNumbers = rows.map((row) => row.extracted.student_account_no);
    const existing = new Map();
    for (let index = 0; index < accountNumbers.length; index += insertChunkSize) {
      const [found] = await connection.query(
        "SELECT id, student_account_no FROM students WHERE school_id = ? AND student_account_no IN (?)",
        [schoolId, accountNumbers.slice(index, index + insertChunkSize)],
      );
      for (const student of found) existing.set(student.student_account_no.toLowerCase(), student.id);
    }

    // Only genuinely NEW learners consume the plan's learner allowance — a
    // re-import of rows the school already has is free. Counted on distinct
    // student account numbers, since the batch may repeat one.
    const newAccountNumbers = new Set();
    for (const row of rows) {
      const key = String(row.extracted.student_account_no).toLowerCase();
      if (!existing.has(key)) newAccountNumbers.add(key);
    }
    const over = await checkCapacity(schoolId, "learners", newAccountNumbers.size);
    if (over) throw new ImportError(over.body.error, over.status);

    let imported = 0;
    for (const row of rows) {
      const student = row.extracted;
      const [result] = await connection.query(upsertStudentSql, [
        schoolId,
        makeUid(),
        student.student_account_no,
        student.first_name,
        student.last_name,
        `${student.first_name} ${student.last_name}`.trim(),
        student.gender || null,
        student.class_name || null,
        student.stream || null,
        student.photo_url || null,
        student.parent_name || null,
        student.parent_phone || null,
        school?.school_name || null,
        toJson(student),
        batchId,
      ]);
      const studentId = existing.get(student.student_account_no.toLowerCase()) ?? result.insertId;
      await connection.query("UPDATE import_rows SET student_id = ?, status = 'committed' WHERE id = ? AND school_id = ?", [studentId, row.id, schoolId]);
      imported += 1;
    }

    await connection.query("UPDATE import_rows SET status = 'skipped' WHERE batch_id = ? AND school_id = ? AND status = 'invalid'", [batchId, schoolId]);
    await connection.query(
      "UPDATE import_batches SET imported_rows = ?, invalid_rows = ?, status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?",
      [imported, summary.invalid, batchId, schoolId],
    );
    await connection.commit();
    return { batchId, imported, skipped: summary.invalid };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
