import test from "node:test";
import assert from "node:assert/strict";

import { computeClearance, kampalaDate } from "./clearance.js";

test("clearance dates use Africa/Kampala rather than the server's UTC date", () => {
  assert.equal(kampalaDate(new Date("2026-03-10T22:30:00.000Z")), "2026-03-11");
});

test("an active allowance takes precedence over thresholds and balance", () => {
  const clearance = computeClearance({
    balance: "350.00",
    currentDate: "2026-03-10",
    allowance: {
      allowed_until: "2026-03-10",
      reason: "Exam support",
      granted_by: 7,
      granted_at: "2026-03-01 09:00:00",
    },
    rules: [{ threshold: "500.00" }],
  });

  assert.equal(clearance.verdict, "ALLOWED");
  assert.equal(clearance.basis, "allowance");
  assert.equal(clearance.allowedUntil, "2026-03-10");
  assert.equal(clearance.reason, "Exam support");
});

test("threshold rules honor balance precision, class, term, and expiry", () => {
  const base = {
    balance: "80.10",
    currentDate: "2026-03-10",
    className: "P6",
    currentTerm: "Term 1",
  };
  const rule = { threshold: "80.10", class_name: "P6", term: "Term 1", expires_at: "2026-03-10" };
  assert.equal(computeClearance({ ...base, rules: [rule] }).basis, "threshold");
  assert.equal(computeClearance({ ...base, rules: [{ ...rule, threshold: "80.09" }] }).verdict, "NOT CLEARED");
  assert.equal(computeClearance({ ...base, rules: [{ ...rule, class_name: "P5" }] }).verdict, "NOT CLEARED");
  assert.equal(computeClearance({ ...base, rules: [{ ...rule, term: "Term 2" }] }).verdict, "NOT CLEARED");
  assert.equal(computeClearance({ ...base, rules: [{ ...rule, expires_at: "2026-03-09" }] }).verdict, "NOT CLEARED");
});

test("zero balance clears only after allowance and threshold rules are considered", () => {
  assert.equal(computeClearance({ balance: "0.00", currentDate: "2026-03-10" }).verdict, "CLEARED");
  assert.equal(computeClearance({
    balance: "0.00",
    currentDate: "2026-03-10",
    rules: [{ threshold: "0.00" }],
  }).basis, "threshold");
  assert.equal(computeClearance({ balance: "0.01", currentDate: "2026-03-10" }).verdict, "NOT CLEARED");
});
