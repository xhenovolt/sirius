import test from "node:test";
import assert from "node:assert/strict";

import { shapeFullStudent, shapePublicStudent } from "./clearance.js";

const row = {
  student_account_no: "A-10",
  first_name: "Mina",
  last_name: "Njoroge",
  full_name: "Mina Njoroge",
  gender: "Female",
  class_name: "P6",
  stream: "Blue",
  photo_url: "https://example.test/photo.png",
  parent_name: "Parent",
  parent_phone: "+256700000000",
  fee_balance: "120.50",
  school_name: "School",
  registered_school_name: "School",
  data_as_of: "2026-03-10T10:00:00.000Z",
};

test("public verification exposes only the approved student fields and verdict", () => {
  const result = shapePublicStudent(row, { verdict: "NOT CLEARED", reason: "Private reason" });

  assert.deepEqual(Object.keys(result).sort(), [
    "class_name",
    "clearance",
    "data_as_of",
    "full_name",
    "photo_url",
    "school_name",
  ]);
  assert.deepEqual(result.clearance, { verdict: "NOT CLEARED" });
  assert.equal("fee_balance" in result, false);
  assert.equal("parent_name" in result, false);
  assert.equal("parent_phone" in result, false);
  assert.equal("stream" in result, false);
});

test("authenticated same-school verification can receive full student details", () => {
  const result = shapeFullStudent(row, { verdict: "ALLOWED", reason: "Allowance" });

  assert.equal(result.fee_balance, "120.50");
  assert.equal(result.parent_name, "Parent");
  assert.equal(result.parent_phone, "+256700000000");
  assert.equal(result.clearance.reason, "Allowance");
});
