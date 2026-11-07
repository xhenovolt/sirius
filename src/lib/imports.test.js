import test from "node:test";
import assert from "node:assert/strict";

import { acceptedStudentChanges, normalizeRow, shapeImportRow, validateRow } from "./imports.js";

test("normalizeRow maps spreadsheet column names onto student fields", () => {
  const row = normalizeRow({
    admission_number: " JIPRA-2026-001 ",
    first_name: "Amina",
    last_name: "Njoroge",
    gender: "Female",
    class_name: "Form 2",
    parent_phone: "+254700000001",
  });

  assert.deepEqual(row, {
    student_account_no: "JIPRA-2026-001",
    first_name: "Amina",
    last_name: "Njoroge",
    gender: "Female",
    class_name: "Form 2",
    stream: "",
    photo_url: "",
    parent_name: "",
    parent_phone: "+254700000001",
  });
});

test("normalizeRow accepts human-readable headers", () => {
  const row = normalizeRow({ "Admission Number": "A-1", "First Name": "Brian", "Last Name": "Otieno", Class: "Form 1" });

  assert.equal(row.student_account_no, "A-1");
  assert.equal(row.first_name, "Brian");
  assert.equal(row.last_name, "Otieno");
  assert.equal(row.class_name, "Form 1");
});

test("normalizeRow prefers the first alias that carries a value", () => {
  const row = normalizeRow({ admission_number: "", admission: "A-2" });

  assert.equal(row.student_account_no, "A-2");
});

test("validateRow requires the natural key and both names", () => {
  assert.deepEqual(validateRow({ student_account_no: "", first_name: "", last_name: "" }), [
    "student account number is required",
    "first name is required",
    "last name is required",
  ]);
});

test("validateRow flags a student account number duplicated inside the same file", () => {
  const duplicates = new Set(["jipra-2026-001"]);

  assert.deepEqual(validateRow({ student_account_no: "JIPRA-2026-001", first_name: "A", last_name: "B" }, duplicates), [
    "duplicate student account number in file",
  ]);
  assert.deepEqual(validateRow({ student_account_no: "JIPRA-2026-002", first_name: "A", last_name: "B" }, duplicates), []);
});

test("validateRow rejects values wider than the student column", () => {
  const errors = validateRow({ student_account_no: "A".repeat(65), first_name: "A", last_name: "B" });

  assert.deepEqual(errors, ["student account number is longer than 64 characters"]);
});

test("import review classifies new, changed, unchanged, duplicate and invalid rows", () => {
  const row = {
    id: 1,
    row_number: 2,
    student_account_no: "A-1",
    full_name: "Amina Njoroge",
    extracted: { student_account_no: "A-1", first_name: "Amina", last_name: "Njoroge" },
    errors: [],
    status: "valid",
    review_decisions: null,
    existing_student_id: null,
  };
  assert.equal(shapeImportRow(row).diffType, "NEW");

  const existing = {
    ...row,
    existing_student_id: 7,
    existing_student_account_no: "A-1",
    existing_first_name: "Amina",
    existing_last_name: "Njoroge",
  };
  assert.equal(shapeImportRow(existing).diffType, "UNCHANGED");
  assert.equal(shapeImportRow({ ...existing, existing_first_name: "Amira" }).diffType, "CHANGED");
  assert.equal(shapeImportRow({ ...row, errors: ["duplicate student account number in file"], status: "invalid" }).diffType, "DUPLICATE");
  assert.equal(shapeImportRow({ ...row, errors: ["last name is required"], status: "invalid" }).diffType, "INVALID");
});

test("accepting one name change does not overwrite the rejected name in the full name", () => {
  const changes = acceptedStudentChanges(
    { first_name: "Amina", last_name: "Njoroge" },
    { first_name: "Amira", last_name: "Wanjiku" },
    ["first_name"],
  );

  assert.deepEqual(changes, { first_name: "Amira", full_name: "Amira Njoroge" });
});
