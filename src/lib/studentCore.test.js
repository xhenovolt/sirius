import test from "node:test";
import assert from "node:assert/strict";

import { StudentInputError, validateStudentInput } from "./students.js";

test("manual student creation requires the imported student number and names", () => {
  assert.throws(
    () => validateStudentInput({ first_name: "Amina", last_name: "Njoroge" }),
    (error) => error instanceof StudentInputError && /student account number is required/i.test(error.message),
  );
});

test("manual student data is trimmed and fee balance is normalized to two decimal places", () => {
  const student = validateStudentInput({
    student_account_no: " A-001 ",
    first_name: " Amina ",
    last_name: " Njoroge ",
    fee_balance: "120.5",
  });

  assert.equal(student.student_account_no, "A-001");
  assert.equal(student.first_name, "Amina");
  assert.equal(student.last_name, "Njoroge");
  assert.equal(student.fee_balance, "120.50");
});

test("fee balance validation rejects negative and over-precision values", () => {
  for (const feeBalance of ["-1.00", "1.234", "1e2"]) {
    assert.throws(
      () => validateStudentInput({
        student_account_no: "A-001",
        first_name: "Amina",
        last_name: "Njoroge",
        fee_balance: feeBalance,
      }),
      (error) => error instanceof StudentInputError && /fee balance must be/i.test(error.message),
    );
  }
});
