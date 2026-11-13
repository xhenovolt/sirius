import test, { mock } from "node:test";
import assert from "node:assert/strict";

const calls = [];
const student = {
  id: 8,
  student_uid: "student-8",
  student_account_no: "J-8",
  full_name: "Mina Sample",
  class_name: "S1",
  stream: "North",
  student_type: "DAY",
  fee_balance: "15000.00",
  photo_url: null,
  school_name: "Jinja Progressive Secondary School",
  contact_phone: "0700000000",
  logo_url: null,
  current_term: "3rd Term 2026",
};

mock.module("./dbTenant.js", {
  exports: {
    assertTenantId(schoolId) {
      if (!schoolId) throw new Error("missing school id");
    },
    async queryTenant(schoolId, sql, params) {
      calls.push({ schoolId, sql, params });
      if (/FROM students/i.test(sql)) return [[student]];
      if (/FROM clearance_allowances/i.test(sql)) {
        return [[{
          student_id: student.id,
          allowed_until: "2099-12-31",
          reason: "Test allowance",
          granted_by: 1,
          granted_at: "2026-11-01 09:00:00",
          revoked_at: null,
        }]];
      }
      if (/FROM clearance_threshold_rules/i.test(sql)) return [[]];
      throw new Error("unexpected query");
    },
    async queryTenantOne() {
      return null;
    },
    async withTenantTransaction() {
      throw new Error("unexpected transaction");
    },
  },
});

const { getStudentsForClearanceCards } = await import("./clearance.js");

test("card data carries the optional balance while all reads stay tenant-scoped", async () => {
  calls.length = 0;
  const cards = await getStudentsForClearanceCards("school-8");

  assert.equal(cards[0].fee_balance, "15000.00");
  assert.equal(cards[0].clearance_report_type, "temporary");
  assert.ok(calls.length === 3);
  assert.ok(calls.every(({ schoolId, sql }) => schoolId === "school-8" && /school_id/i.test(sql)));
});
