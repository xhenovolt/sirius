import test from "node:test";
import assert from "node:assert/strict";

import { normalizeRow, validateRow } from "./imports.js";

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
    admission_number: "JIPRA-2026-001",
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

  assert.equal(row.admission_number, "A-1");
  assert.equal(row.first_name, "Brian");
  assert.equal(row.last_name, "Otieno");
  assert.equal(row.class_name, "Form 1");
});

test("normalizeRow prefers the first alias that carries a value", () => {
  const row = normalizeRow({ admission_number: "", admission: "A-2" });

  assert.equal(row.admission_number, "A-2");
});

test("validateRow requires the natural key and both names", () => {
  assert.deepEqual(validateRow({ admission_number: "", first_name: "", last_name: "" }), [
    "admission number is required",
    "first name is required",
    "last name is required",
  ]);
});

test("validateRow flags an admission number duplicated inside the same file", () => {
  const duplicates = new Set(["jipra-2026-001"]);

  assert.deepEqual(validateRow({ admission_number: "JIPRA-2026-001", first_name: "A", last_name: "B" }, duplicates), [
    "duplicate admission number in file",
  ]);
  assert.deepEqual(validateRow({ admission_number: "JIPRA-2026-002", first_name: "A", last_name: "B" }, duplicates), []);
});

test("validateRow rejects values wider than the student column", () => {
  const errors = validateRow({ admission_number: "A".repeat(65), first_name: "A", last_name: "B" });

  assert.deepEqual(errors, ["admission number is longer than 64 characters"]);
});
