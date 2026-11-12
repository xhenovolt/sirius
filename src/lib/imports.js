import { createHash, randomBytes } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { assertTenantId, queryTenant, queryTenantOne, withTenantTransaction } from "./dbTenant.js";
import { checkCapacity } from "./entitlements.js";

const requiredFields = ["student_account_no", "first_name", "last_name"];

// Accepted spreadsheet header spellings per student column.
export const fieldAliases = {
  student_account_no: ["student_account_no", "student account no", "student account number", "student number", "learner number", "registration number", "registration no", "admission_number", "admission", "admission number", "Admission Number"],
  first_name: ["first_name", "firstName", "first name", "given name", "given_name", "First Name"],
  last_name: ["last_name", "lastName", "last name", "surname", "family name", "family_name", "Last Name"],
  gender: ["gender", "sex", "Gender"],
  class_name: ["class_name", "class", "class name", "grade", "year level", "Class"],
  stream: ["stream", "section", "house", "Stream"],
  student_type: ["student_type", "student type", "stdtype", "student category", "type"],
  photo_url: ["photo_url", "photo", "photo url", "profile photo", "image url", "Photo"],
  parent_name: ["parent_name", "parent", "parent name", "guardian name", "Parent Name"],
  parent_phone: ["parent_phone", "parentPhone", "parent phone", "guardian phone", "contact number", "Parent Phone"],
  fee_balance: ["fee_balance", "fee balance", "balance", "outstanding balance", "Outstanding Balance", "fees balance"],
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
  student_type: 32,
  photo_url: 500,
  parent_name: 205,
  parent_phone: 32,
};
const fieldLabels = { student_account_no: "student account number" };
const feeBalancePattern = /^\d{1,12}(?:\.\d{1,2})?$/;

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

function normalizeFeeBalance(value) {
  const [whole, fraction = ""] = value.split(".");
  return `${whole.replace(/^0+(?=\d)/, "")}.${fraction.padEnd(2, "0")}`;
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
export function normalizeRow(row, mapping) {
  const normalized = {};
  for (const field of Object.keys(fieldAliases)) {
    let value = "";
    if (mapping && Object.hasOwn(mapping, field)) {
      value = mapping[field] ? clean(row?.[mapping[field]]) : "";
    } else {
      for (const alias of fieldAliases[field]) {
        const candidate = clean(row?.[alias]);
        if (candidate) {
          value = candidate;
          break;
        }
      }
    }
    if (field === "fee_balance" && value && feeBalancePattern.test(value)) {
      value = normalizeFeeBalance(value);
    }
    if (field === "student_type" && value) value = value.toUpperCase();
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
  const feeBalance = clean(extracted?.fee_balance);
  if (feeBalance && !feeBalancePattern.test(feeBalance)) {
    errors.push("fee balance must be a non-negative amount with up to two decimal places");
  }
  const studentType = clean(extracted?.student_type).toUpperCase();
  if (studentType && !["DAY", "BOARDING"].includes(studentType)) {
    errors.push("student type must be DAY or BOARDING");
  }

  const key = clean(extracted?.student_account_no).toLowerCase();
  if (key && duplicateAccountNumbers.has(key)) errors.push("duplicate student account number in file");

  return errors;
}

export function acceptedStudentChanges(current, proposed, acceptedFields) {
  const accepted = new Set(acceptedFields);
  const changedFields = Object.keys(fieldAliases).filter(
    (field) => accepted.has(field)
      && !(field === "fee_balance" && !clean(proposed[field]))
      && clean(current[field]) !== clean(proposed[field]),
  );
  const changes = Object.fromEntries(changedFields.map((field) => [field, proposed[field] || null]));
  if (changedFields.includes("first_name") || changedFields.includes("last_name")) {
    const firstName = changedFields.includes("first_name") ? proposed.first_name : current.first_name;
    const lastName = changedFields.includes("last_name") ? proposed.last_name : current.last_name;
    changes.full_name = `${firstName} ${lastName}`.trim();
  }
  return changes;
}

function duplicateAccountNumbersFrom(values) {
  const counts = new Map();
  for (const value of values) {
    const key = clean(value).toLowerCase();
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
}

export function shapeImportRow(row) {
  const extracted = normalizeRow(fromJson(row.extracted) || {});
  const errors = fromJson(row.errors) || [];
  const decisions = fromJson(row.review_decisions) || {};
  const current = row.existing_student_id == null ? null : {
    student_account_no: row.existing_student_account_no,
    first_name: row.existing_first_name,
    last_name: row.existing_last_name,
    gender: row.existing_gender,
    class_name: row.existing_class_name,
    stream: row.existing_stream,
    student_type: row.existing_student_type,
    photo_url: row.existing_photo_url,
    parent_name: row.existing_parent_name,
    parent_phone: row.existing_parent_phone,
    fee_balance: row.existing_fee_balance,
  };
  const differences = {};
  if (current) {
    for (const field of Object.keys(fieldAliases)) {
      if (field === "fee_balance" && !extracted[field]) continue;
      if (clean(current[field]) !== clean(extracted[field])) {
        differences[field] = { current: current[field] ?? "", proposed: extracted[field] };
      }
    }
  } else {
    for (const field of Object.keys(fieldAliases)) {
      if (field === "fee_balance" && !extracted[field]) continue;
      if (extracted[field]) differences[field] = { current: "", proposed: extracted[field] };
    }
  }
  const isDuplicate = errors.some((error) => error.includes("duplicate student account number"));
  const diffType = errors.length
    ? isDuplicate ? "DUPLICATE" : "INVALID"
    : !current ? "NEW"
      : Object.keys(differences).length ? "CHANGED" : "UNCHANGED";

  return {
    id: row.id,
    rowNumber: row.row_number,
    status: row.status,
    diffType,
    differences,
    reviewDecisions: decisions,
    studentId: row.student_id,
    studentAccountNo: row.student_account_no || "",
    fullName: row.full_name || "",
    errors,
    extracted,
  };
}

/**
 * Puts parsed spreadsheet rows into import_rows staging. Nothing here touches
 * students; the only writer of student data is commitImportBatch.
 */
export async function stageImport({ fileName, rows, schoolId, sourceFile, contentType, mapping, createdBy = null }) {
  assertTenantId(schoolId);
  if (!Buffer.isBuffer(sourceFile) || sourceFile.length === 0) {
    throw new ImportError("The original spreadsheet file is required.");
  }
  if (!Array.isArray(rows) || rows.length === 0) throw new ImportError("The spreadsheet did not contain any student rows.");
  if (rows.length > maxImportRows) throw new ImportError(`This file has ${rows.length} rows. Import at most ${maxImportRows} rows at a time.`);

  const extracted = rows.map((row) => normalizeRow(row, mapping));
  const duplicates = duplicateAccountNumbersFrom(extracted.map((row) => row.student_account_no));
  const staged = extracted.map((data, index) => {
    const errors = validateRow(data, duplicates);
    return { rowNumber: index + 2, data, errors, status: errors.length ? "invalid" : "valid" };
  });
  const valid = staged.filter((row) => row.status === "valid").length;

  return withTenantTransaction(schoolId, async (scoped) => {
    const [batch] = await scoped.query(
      `INSERT INTO import_batches (school_id, file_name, total_rows, valid_rows, invalid_rows, status)
       VALUES (?, ?, ?, ?, ?, 'preview')`,
      [schoolId, clean(fileName).slice(0, 255) || "import", staged.length, valid, staged.length - valid],
    );
    const batchId = batch.insertId;
    await scoped.query(
      `INSERT INTO import_batch_files (school_id, batch_id, file_name, content_type, sha256, file_data)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        schoolId,
        batchId,
        clean(fileName).slice(0, 255) || "import",
        clean(contentType).slice(0, 100) || "application/octet-stream",
        createHash("sha256").update(sourceFile).digest("hex"),
        sourceFile,
      ],
    );

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
      await scoped.query(
        "INSERT INTO import_rows (school_id, batch_id, `row_number`, student_account_no, full_name, extracted, errors, photo_ref, status) VALUES ?",
        [values.slice(index, index + insertChunkSize)],
      );
    }

    await saveBatchVersion(scoped, batchId, schoolId, 1, createdBy);
    return { batchId, fileName, total: staged.length, valid, invalid: staged.length - valid };
  });
}

async function saveBatchVersion(scoped, batchId, schoolId, versionNo, createdBy) {
  const [rows] = await scoped.query(
    `SELECT id, \`row_number\`, student_account_no, full_name, extracted, errors, status, student_id, review_decisions
       FROM import_rows
      WHERE batch_id = ? AND school_id = ?
      ORDER BY \`row_number\``,
    [batchId, schoolId],
  );
  const snapshot = gzipSync(Buffer.from(JSON.stringify(rows)));
  await scoped.query(
    `INSERT INTO import_batch_versions (school_id, batch_id, version_no, snapshot, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [schoolId, batchId, versionNo, snapshot, createdBy],
  );
  await scoped.query(
    "UPDATE import_batches SET current_version = ? WHERE id = ? AND school_id = ?",
    [versionNo, batchId, schoolId],
  );
}

export async function listImportVersions(batchId, schoolId) {
  const [rows] = await queryTenant(
    schoolId,
    `SELECT version_no, created_by, created_at
       FROM import_batch_versions
      WHERE batch_id = ? AND school_id = ?
      ORDER BY version_no DESC`,
    [batchId, schoolId],
  );
  return rows;
}

export async function getImportVersionRows(batchId, schoolId, versionNo) {
  const version = await queryTenantOne(
    schoolId,
    `SELECT snapshot FROM import_batch_versions
      WHERE batch_id = ? AND school_id = ? AND version_no = ?
      LIMIT 1`,
    [batchId, schoolId, versionNo],
  );
  if (!version) return null;
  return JSON.parse(gunzipSync(version.snapshot).toString("utf8"));
}

export async function getImportSourceFile(batchId, schoolId) {
  return queryTenantOne(
    schoolId,
    `SELECT file_name, content_type, sha256, file_data
       FROM import_batch_files
      WHERE batch_id = ? AND school_id = ?
      LIMIT 1`,
    [batchId, schoolId],
  );
}

export async function getImportBatch(batchId, schoolId) {
  const batch = await queryTenantOne(
    schoolId,
    `SELECT id, school_id, file_name, total_rows, valid_rows, invalid_rows, imported_rows, current_version, status, error_message, created_at, completed_at
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
    currentVersion: Number(batch.current_version || 1),
    errorMessage: batch.error_message,
    createdAt: batch.created_at,
    completedAt: batch.completed_at,
  };
}

export async function listImportBatches(schoolId) {
  const [rows] = await queryTenant(
    schoolId,
    `SELECT id, file_name, total_rows, valid_rows, invalid_rows, imported_rows,
            current_version, status, created_at, completed_at
       FROM import_batches
      WHERE school_id = ?
      ORDER BY created_at DESC
      LIMIT 50`,
    [schoolId],
  );
  return rows.map((row) => ({
    id: row.id,
    fileName: row.file_name,
    totalRows: row.total_rows,
    validRows: row.valid_rows,
    invalidRows: row.invalid_rows,
    importedRows: row.imported_rows,
    currentVersion: Number(row.current_version || 1),
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  }));
}

export async function listImportMappingTemplates(schoolId) {
  const [rows] = await queryTenant(
    schoolId,
    `SELECT id, template_name, mapping, updated_at
       FROM import_mapping_templates
      WHERE school_id = ?
      ORDER BY template_name ASC`,
    [schoolId],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.template_name,
    mapping: fromJson(row.mapping) || {},
    updatedAt: row.updated_at,
  }));
}

export async function saveImportMappingTemplate(schoolId, name, mapping, createdBy) {
  assertTenantId(schoolId);
  const templateName = clean(name);
  if (!templateName || templateName.length > 100) {
    throw new ImportError("Mapping template name must be between 1 and 100 characters.");
  }
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    throw new ImportError("A valid column mapping is required.");
  }
  const allowedFields = new Set(Object.keys(fieldAliases));
  const values = Object.entries(mapping);
  if (values.some(([field, header]) => !allowedFields.has(field) || typeof header !== "string")) {
    throw new ImportError("The mapping contains an unsupported field or source column.");
  }
  if (new Set(values.map(([, header]) => header).filter(Boolean)).size !== values.filter(([, header]) => header).length) {
    throw new ImportError("A source column can only be mapped once.");
  }
  if (requiredFields.some((field) => !mapping[field])) {
    throw new ImportError("Student account number, first name, and last name must be mapped.");
  }
  await queryTenant(
    schoolId,
    `INSERT INTO import_mapping_templates (school_id, template_name, mapping, created_by)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE mapping = VALUES(mapping), created_by = VALUES(created_by),
                             updated_at = CURRENT_TIMESTAMP`,
    [schoolId, templateName, toJson(mapping), createdBy || null],
  );
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
    `SELECT ir.id, ir.\`row_number\`, ir.student_account_no, ir.full_name, ir.extracted,
            ir.errors, ir.status, ir.student_id, ir.review_decisions,
            s.id AS existing_student_id, s.student_account_no AS existing_student_account_no,
            s.first_name AS existing_first_name, s.last_name AS existing_last_name,
            s.gender AS existing_gender, s.class_name AS existing_class_name,
            s.stream AS existing_stream, s.student_type AS existing_student_type,
            s.photo_url AS existing_photo_url,
            s.parent_name AS existing_parent_name, s.parent_phone AS existing_parent_phone,
            s.fee_balance AS existing_fee_balance
       FROM import_rows ir
       LEFT JOIN students s ON s.school_id = ir.school_id
                            AND s.student_account_no = ir.student_account_no
      WHERE ir.batch_id = ? AND ir.school_id = ? ${statusFilter.replaceAll("status", "ir.status")}
     ORDER BY \`row_number\` LIMIT ? OFFSET ?`,
    [batchId, schoolId, size, (current - 1) * size],
  );

  return { page: current, pageSize: size, total: counts.total, rows: rows.map(shapeImportRow) };
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
export async function updateImportRows(batchId, schoolId, updates, createdBy = null) {
  assertTenantId(schoolId);
  if (!Array.isArray(updates) || updates.length === 0) throw new ImportError("No row changes were provided.");
  if (updates.length > maxPageSize) throw new ImportError(`Save at most ${maxPageSize} rows at a time.`);

  return withTenantTransaction(schoolId, async (scoped) => {
    const [batchRows] = await scoped.query("SELECT id, status, current_version FROM import_batches WHERE id = ? AND school_id = ? FOR UPDATE", [batchId, schoolId]);
    const batch = batchRows[0];
    if (!batch) throw new ImportError("Import batch not found.", 404);
    if (batch.status === "completed") throw new ImportError("This import has already been committed.", 409);

    const [stagedRows] = await scoped.query(
      "SELECT id, review_decisions FROM import_rows WHERE batch_id = ? AND school_id = ? AND status IN ('pending', 'valid', 'invalid')",
      [batchId, schoolId],
    );
    const editable = new Map(stagedRows.map((row) => [Number(row.id), fromJson(row.review_decisions) || {}]));

    for (const update of updates) {
      const id = Number(update?.id);
      if (!Number.isInteger(id) || !editable.has(id)) throw new ImportError("A reviewed row is no longer part of this import. Reload the page and try again.", 409);
      const data = normalizeRow(update);
      const previousDecision = editable.get(id);
      const acceptedFields = Object.hasOwn(update, "acceptedFields")
        ? update.acceptedFields
        : previousDecision.acceptedFields || [];
      if (!Array.isArray(acceptedFields) || acceptedFields.some((field) => !Object.hasOwn(fieldAliases, field))) {
        throw new ImportError("The selected fields are not valid for this student row.");
      }
      const rowDecision = Object.hasOwn(update, "rowDecision")
        ? update.rowDecision
        : previousDecision.rowDecision || null;
      if (rowDecision !== null && !["accepted", "rejected"].includes(rowDecision)) {
        throw new ImportError("Choose whether to accept or reject this student row.");
      }
      const decisions = {
        acceptedFields: [...new Set(acceptedFields)],
        rowDecision,
      };
      await scoped.query(
        `UPDATE import_rows SET extracted = ?, student_account_no = ?, full_name = ?, photo_ref = ?, review_decisions = ?
         WHERE id = ? AND batch_id = ? AND school_id = ?`,
        [toJson(data), data.student_account_no || null, `${data.first_name} ${data.last_name}`.trim() || null, data.photo_url || null, toJson(decisions), id, batchId, schoolId],
      );
    }

    const summary = await revalidateBatch(scoped, batchId, schoolId);
    await saveBatchVersion(scoped, batchId, schoolId, Number(batch.current_version) + 1, createdBy);
    return summary;
  });
}

function makeUid() {
  return `SIRIUS-${randomBytes(16).toString("hex").toUpperCase()}`;
}

const insertStudentSql = `
  INSERT INTO students
    (school_id, student_uid, student_account_no, first_name, last_name, full_name, gender, class_name, stream, student_type, photo_url, parent_name, parent_phone, school_name, fee_balance, card_extra, import_batch_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const importRollbackFields = [
  "student_account_no",
  "first_name",
  "last_name",
  "full_name",
  "gender",
  "class_name",
  "stream",
  "student_type",
  "photo_url",
  "parent_name",
  "parent_phone",
  "school_name",
  "fee_balance",
  "card_extra",
  "import_batch_id",
  "status",
];

async function saveImportUndo(scoped, { schoolId, batchId, studentId, existedBefore, previousRecord, committedVersion }) {
  await scoped.query(
    `INSERT INTO import_batch_undo
      (school_id, batch_id, student_id, existed_before, previous_record, committed_version)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [schoolId, batchId, studentId, existedBefore ? 1 : 0, previousRecord ? toJson(previousRecord) : null, committedVersion],
  );
}

/**
 * Commits one staged batch into students in a single transaction. Rows are
 * matched on the natural key (school_id, student_account_no) so a re-import
 * updates the existing record instead of creating a duplicate.
 */
export async function commitImportBatch(batchId, schoolId, session = null) {
  assertTenantId(schoolId);
  return withTenantTransaction(schoolId, async (scoped) => {
    const [batchRows] = await scoped.query(
      "SELECT id, status FROM import_batches WHERE id = ? AND school_id = ? FOR UPDATE",
      [batchId, schoolId],
    );
    const batch = batchRows[0];
    if (!batch) throw new ImportError("Import batch not found.", 404);
    if (batch.status === "completed") throw new ImportError("This import has already been committed.", 409);

    const summary = await revalidateBatch(scoped, batchId, schoolId);
    if (summary.valid === 0) throw new ImportError("There are no valid rows to import. Correct the flagged rows first.");

    const [stagedRows] = await scoped.query(
      "SELECT id, extracted, review_decisions FROM import_rows WHERE batch_id = ? AND school_id = ? AND status = 'valid' ORDER BY `row_number`",
      [batchId, schoolId],
    );
    const rows = stagedRows.map((row) => ({
      id: row.id,
      extracted: normalizeRow(fromJson(row.extracted) || {}),
      decisions: fromJson(row.review_decisions) || {},
    }));
    const [[school]] = await scoped.query("SELECT school_name FROM schools WHERE school_id = ? LIMIT 1", [schoolId]);

    const accountNumbers = rows.map((row) => row.extracted.student_account_no);
    const existing = new Map();
    for (let index = 0; index < accountNumbers.length; index += insertChunkSize) {
      const [found] = await scoped.query(
        `SELECT id, student_account_no, first_name, last_name, full_name, gender,
                class_name, stream, student_type, photo_url, parent_name, parent_phone, school_name,
                fee_balance, card_extra, import_batch_id, status, version
           FROM students
          WHERE school_id = ? AND student_account_no IN (?)
          FOR UPDATE`,
        [schoolId, accountNumbers.slice(index, index + insertChunkSize)],
      );
      for (const student of found) existing.set(student.student_account_no.toLowerCase(), student);
    }

    // Only genuinely NEW learners consume the plan's learner allowance — a
    // re-import of rows the school already has is free. Counted on distinct
    // student account numbers, since the batch may repeat one.
    const newAccountNumbers = new Set();
    for (const row of rows) {
      const key = String(row.extracted.student_account_no).toLowerCase();
      if (!existing.has(key) && (
        row.decisions.rowDecision === "accepted" ||
        requiredFields.every((field) => row.decisions.acceptedFields?.includes(field))
      )) newAccountNumbers.add(key);
    }
    const over = await checkCapacity(schoolId, "learners", newAccountNumbers.size);
    if (over) throw new ImportError(over.body.error, over.status);

    let imported = 0;
    let skipped = summary.invalid;
    for (const row of rows) {
      const student = row.extracted;
      const key = String(student.student_account_no).toLowerCase();
      const current = existing.get(key);
      const decisions = row.decisions;
      const acceptedFields = decisions.rowDecision === "accepted"
        ? Object.keys(fieldAliases)
        : decisions.acceptedFields || [];
      const newRowAccepted = decisions.rowDecision === "accepted" || requiredFields.every((field) => acceptedFields.includes(field));
      if (decisions.rowDecision === "rejected" || (!current && !newRowAccepted) || (current && acceptedFields.length === 0 && decisions.rowDecision !== "accepted")) {
        await scoped.query("UPDATE import_rows SET status = 'skipped' WHERE id = ? AND school_id = ?", [row.id, schoolId]);
        skipped += 1;
        continue;
      }

      let studentId;
      if (!current) {
        const acceptedData = Object.fromEntries(Object.keys(fieldAliases).map((field) => [
          field,
          acceptedFields.includes(field) ? student[field] : "",
        ]));
        const [result] = await scoped.query(insertStudentSql, [
          schoolId,
          makeUid(),
          acceptedData.student_account_no,
          acceptedData.first_name,
          acceptedData.last_name,
          `${acceptedData.first_name} ${acceptedData.last_name}`.trim(),
          acceptedData.gender || null,
          acceptedData.class_name || null,
          acceptedData.stream || null,
          acceptedData.student_type || null,
          acceptedData.photo_url || null,
          acceptedData.parent_name || null,
          acceptedData.parent_phone || null,
          school?.school_name || null,
          acceptedData.fee_balance || "0.00",
          toJson(acceptedData),
          batchId,
        ]);
        studentId = result.insertId;
        await scoped.query(
          `INSERT INTO fee_balance_history
            (school_id, student_id, previous_balance, new_balance, changed_by, source)
           VALUES (?, ?, 0, ?, ?, 'import')`,
          [schoolId, studentId, acceptedData.fee_balance || "0.00", session?.id || null],
        );
        await saveImportUndo(scoped, {
          schoolId,
          batchId,
          studentId,
          existedBefore: false,
          previousRecord: null,
          committedVersion: 1,
        });
      } else {
        studentId = current.id;
        const previousRecord = Object.fromEntries(importRollbackFields.map((field) => [field, current[field]]));
        const changes = acceptedStudentChanges(current, student, acceptedFields);
        const changedFields = Object.keys(changes).filter((field) => field !== "full_name");
        const committedVersion = Number(current.version) + (changedFields.length > 0 ? 1 : 0);
        await saveImportUndo(scoped, {
          schoolId,
          batchId,
          studentId,
          existedBefore: true,
          previousRecord,
          committedVersion,
        });
        if (changedFields.length > 0) {
          const assignments = changedFields.map((field) => `\`${field}\` = ?`);
          const values = changedFields.map((field) => changes[field]);
          if (Object.hasOwn(changes, "full_name")) {
            assignments.push("full_name = ?");
            values.push(changes.full_name);
          }
          const extras = { ...(fromJson(current.card_extra) || {}) };
          for (const field of changedFields) extras[field] = student[field];
          assignments.push("card_extra = ?", "import_batch_id = ?", "version = version + 1", "updated_at = CURRENT_TIMESTAMP");
          values.push(toJson(extras), batchId, current.id, schoolId);
          await scoped.query(
            `UPDATE students SET ${assignments.join(", ")} WHERE id = ? AND school_id = ?`,
            values,
          );
          if (Object.hasOwn(changes, "fee_balance")) {
            await scoped.query(
              `INSERT INTO fee_balance_history
                (school_id, student_id, previous_balance, new_balance, changed_by, source)
               VALUES (?, ?, ?, ?, ?, 'import')`,
              [schoolId, studentId, current.fee_balance, changes.fee_balance, session?.id || null],
            );
          }
        }
      }
      await scoped.query("UPDATE import_rows SET student_id = ?, status = 'committed' WHERE id = ? AND school_id = ?", [studentId, row.id, schoolId]);
      imported += 1;
    }

    await scoped.query("UPDATE import_rows SET status = 'skipped' WHERE batch_id = ? AND school_id = ? AND status = 'invalid'", [batchId, schoolId]);
    await scoped.query(
      "UPDATE import_batches SET imported_rows = ?, invalid_rows = ?, status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?",
      [imported, summary.invalid, batchId, schoolId],
    );
    return { batchId, imported, skipped };
  });
}

export async function rollbackImportBatch(batchId, schoolId, session, request) {
  assertTenantId(schoolId);
  return withTenantTransaction(schoolId, async (scoped) => {
    const [batchRows] = await scoped.query(
      "SELECT id, status, current_version FROM import_batches WHERE id = ? AND school_id = ? FOR UPDATE",
      [batchId, schoolId],
    );
    const batch = batchRows[0];
    if (!batch) throw new ImportError("Import batch not found.", 404);
    if (batch.status !== "completed") {
      throw new ImportError(batch.status === "rolled_back" ? "This import has already been rolled back." : "Only a committed import can be rolled back.", 409);
    }

    const [versionRows] = await scoped.query(
      `SELECT snapshot FROM import_batch_versions
        WHERE batch_id = ? AND school_id = ? AND version_no = ?
        LIMIT 1`,
      [batchId, schoolId, batch.current_version],
    );
    if (!versionRows[0]) throw new ImportError("The committed import has no review snapshot; rollback is unavailable.", 409);
    const stagedSnapshot = JSON.parse(gunzipSync(versionRows[0].snapshot).toString("utf8"));

    const [undoRows] = await scoped.query(
      `SELECT student_id, existed_before, previous_record, committed_version
         FROM import_batch_undo
        WHERE batch_id = ? AND school_id = ?
        ORDER BY id`,
      [batchId, schoolId],
    );
    let restored = 0;
    let removed = 0;
    for (const undo of undoRows) {
      const [currentRows] = await scoped.query(
        "SELECT version, fee_balance FROM students WHERE id = ? AND school_id = ? FOR UPDATE",
        [undo.student_id, schoolId],
      );
      const current = currentRows[0];
      if (!current || Number(current.version) !== Number(undo.committed_version)) {
        throw new ImportError("A student changed after this import. Resolve those changes before rolling back.", 409);
      }

      if (undo.existed_before) {
        const previous = fromJson(undo.previous_record);
        if (!previous) throw new ImportError("Import rollback data is incomplete.", 409);
        const assignments = importRollbackFields.map((field) => `\`${field}\` = ?`);
        assignments.push("version = version + 1", "updated_at = CURRENT_TIMESTAMP");
        await scoped.query(
          `UPDATE students SET ${assignments.join(", ")} WHERE id = ? AND school_id = ?`,
          [
            ...importRollbackFields.map((field) => field === "card_extra" && previous[field] != null
              ? toJson(previous[field])
              : previous[field] ?? null),
            undo.student_id,
            schoolId,
          ],
        );
        if (String(current.fee_balance) !== String(previous.fee_balance)) {
          await scoped.query(
            `INSERT INTO fee_balance_history
              (school_id, student_id, previous_balance, new_balance, changed_by, source)
             VALUES (?, ?, ?, ?, ?, 'import_rollback')`,
            [schoolId, undo.student_id, current.fee_balance, previous.fee_balance, session?.id || null],
          );
        }
        restored += 1;
      } else {
        const [[identity]] = await scoped.query(
          "SELECT id FROM qr_identities WHERE student_id = ? AND school_id = ? LIMIT 1",
          [undo.student_id, schoolId],
        );
        if (identity) throw new ImportError("A student from this import already has a QR identity and cannot be removed by rollback.", 409);
        await scoped.query(
          "DELETE FROM students WHERE id = ? AND school_id = ? AND version = ?",
          [undo.student_id, schoolId, undo.committed_version],
        );
        removed += 1;
      }
    }

    for (const row of stagedSnapshot) {
      await scoped.query(
        "UPDATE import_rows SET status = ?, student_id = ? WHERE id = ? AND batch_id = ? AND school_id = ?",
        [row.status, row.student_id ?? null, row.id, batchId, schoolId],
      );
    }
    await scoped.query(
      "UPDATE import_batches SET status = 'rolled_back', imported_rows = 0 WHERE id = ? AND school_id = ?",
      [batchId, schoolId],
    );
    await scoped.query(
      `INSERT INTO audit_logs
        (school_id, user_id, actor_email, action, entity_type, entity_id, details,
         ip_address, user_agent)
       VALUES (?, ?, ?, 'import.rolled_back', 'import_batch', ?, ?, ?, ?)`,
      [
        schoolId,
        session?.id || null,
        session?.email || null,
        String(batchId),
        toJson({ restored, removed }),
        request?.headers?.get?.("x-real-ip") || null,
        request?.headers?.get?.("user-agent")?.slice(0, 255) || null,
      ],
    );
    return { batchId, restored, removed };
  });
}
