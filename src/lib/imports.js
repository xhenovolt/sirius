import { getDb } from "./db";

const requiredFields = ["admission_number", "first_name", "last_name"];

function clean(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

export function normalizeRows(rows) {
  const seenAdmissions = new Set();

  return rows.map((row, index) => {
    const normalized = {
      rowNumber: index + 2,
      admission_number: clean(row.admission_number || row.admission || row["Admission Number"]),
      first_name: clean(row.first_name || row.firstName || row["First Name"]),
      last_name: clean(row.last_name || row.lastName || row["Last Name"]),
      gender: clean(row.gender || row["Gender"]),
      class_name: clean(row.class_name || row.class || row["Class"]),
      stream: clean(row.stream || row["Stream"]),
      photo_url: clean(row.photo_url || row.photo || row["Photo"]),
      parent_name: clean(row.parent_name || row.parent || row["Parent Name"]),
      parent_phone: clean(row.parent_phone || row.parentPhone || row["Parent Phone"]),
    };
    const errors = requiredFields.filter((field) => !normalized[field]).map((field) => `${field.replaceAll("_", " ")} is required`);
    const admissionKey = normalized.admission_number.toLowerCase();
    if (admissionKey && seenAdmissions.has(admissionKey)) errors.push("duplicate admission number in file");
    if (admissionKey) seenAdmissions.add(admissionKey);
    return { ...normalized, errors, valid: errors.length === 0 };
  });
}

function makeUid(admissionNumber) {
  const safeAdmission = admissionNumber.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `SIRIUS-DEFAULT-${safeAdmission}`.slice(0, 64);
}

export async function commitImport(fileName, rows) {
  const validRows = rows.filter((row) => row.valid);
  const db = getDb();
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    const [[school]] = await connection.query("SELECT school_name FROM schools WHERE school_id = 'default' LIMIT 1");
    const [batchResult] = await connection.query(
      `INSERT INTO import_batches (school_id, file_name, total_rows, valid_rows, invalid_rows, status)
       VALUES ('default', ?, ?, ?, ?, 'preview')`,
      [fileName, rows.length, validRows.length, rows.length - validRows.length],
    );

    for (const row of validRows) {
      await connection.query(
        `INSERT INTO students
          (school_id, student_uid, admission_number, first_name, last_name, full_name, gender, class_name, stream, photo_url, parent_name, parent_phone, school_name, import_batch_id)
          VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           first_name = VALUES(first_name), last_name = VALUES(last_name), full_name = VALUES(full_name), gender = VALUES(gender), class_name = VALUES(class_name), stream = VALUES(stream), photo_url = VALUES(photo_url), parent_name = VALUES(parent_name), parent_phone = VALUES(parent_phone), import_batch_id = VALUES(import_batch_id), updated_at = CURRENT_TIMESTAMP`,
        [makeUid(row.admission_number), row.admission_number, row.first_name, row.last_name, `${row.first_name} ${row.last_name}`, row.gender || null, row.class_name || null, row.stream || null, row.photo_url || null, row.parent_name || null, row.parent_phone || null, school?.school_name || null, batchResult.insertId],
      );
    }

    await connection.query(
      "UPDATE import_batches SET imported_rows = ?, status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?",
      [validRows.length, batchResult.insertId],
    );
    await connection.commit();
    return { imported: validRows.length, skipped: rows.length - validRows.length };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}