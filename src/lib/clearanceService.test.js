import test, { mock } from "node:test";
import assert from "node:assert/strict";

let attempts = 0;
let resolution;
const tenantCalls = [];
const scanEvents = [];
const fakeDb = {
  async query(sql, params = []) {
    if (/SELECT COUNT\(\*\) AS attempts/i.test(sql)) return [[{ attempts }]];
    if (/INSERT INTO scan_events/i.test(sql)) {
      scanEvents.push({ sql, params });
      return [{ insertId: scanEvents.length }];
    }
    throw new Error(`unexpected database query: ${sql}`);
  },
};

mock.module("./db.js", { exports: { getDb: () => fakeDb } });
mock.module("./dbTenant.js", {
  exports: {
    async queryTenant(schoolId, sql, params = []) {
      tenantCalls.push({ schoolId, sql, params });
      return [[]];
    },
    async queryTenantOne(schoolId, sql, params = []) {
      tenantCalls.push({ schoolId, sql, params });
      return {
        student_account_no: "A-10",
        first_name: "Mina",
        last_name: "Njoroge",
        full_name: "Mina Njoroge",
        gender: "Female",
        class_name: "P6",
        stream: "Blue",
        photo_url: null,
        parent_name: "Parent",
        parent_phone: "+256700000000",
        fee_balance: "0.00",
        data_as_of: new Date("2026-03-10T10:00:00.000Z"),
        school_name: "School",
        registered_school_name: "School",
        current_term: "Term 1",
      };
    },
  },
});
mock.module("./identity.js", {
  exports: {
    async resolveToken() {
      return resolution;
    },
  },
});

const { getVerificationResult } = await import("./clearance.js");

function reset() {
  attempts = 0;
  tenantCalls.length = 0;
  scanEvents.length = 0;
  resolution = {
    outcome: "resolved",
    identity: { id: 21, school_id: "school-a", student_id: 10 },
  };
}

test("public token lookup scopes student and clearance reads to the token's stored school", async () => {
  reset();
  const result = await getVerificationResult("a".repeat(43), { ipAddress: "192.0.2.1" });

  assert.equal(result.isFullRecord, false);
  assert.equal(result.student.clearance.verdict, "CLEARED");
  assert.equal("fee_balance" in result.student, false);
  assert.equal("parent_phone" in result.student, false);
  assert.ok(tenantCalls.length >= 3);
  assert.ok(tenantCalls.every((call) => call.schoolId === "school-a"));
  assert.equal(scanEvents.at(-1).params[3], "resolved");
});

test("only a same-school session receives the full record", async () => {
  reset();
  const foreign = await getVerificationResult("a".repeat(43), {
    session: { school_id: "school-b" },
    ipAddress: "192.0.2.2",
  });
  assert.equal("fee_balance" in foreign.student, false);

  reset();
  const local = await getVerificationResult("a".repeat(43), {
    session: { school_id: "school-a" },
    ipAddress: "192.0.2.3",
  });
  assert.equal(local.isFullRecord, true);
  assert.equal(local.student.fee_balance, "0.00");
  assert.equal(local.student.parent_name, "Parent");
});

test("invalid, unknown, and revoked token outcomes return the same empty public shape", async () => {
  const results = [];
  const loggedOutcomes = [];
  for (const outcome of ["invalid", "unknown", "revoked"]) {
    reset();
    resolution = { outcome, identity: outcome === "revoked" ? { id: 22, school_id: "school-a", student_id: 10 } : null };
    results.push(await getVerificationResult("b".repeat(43), { ipAddress: `192.0.2.${results.length + 4}` }));
    loggedOutcomes.push(scanEvents[0].params[3]);
  }
  assert.deepEqual(results.map(({ rateLimited, student, isFullRecord }) => ({ rateLimited, student, isFullRecord })), [
    { rateLimited: false, student: null, isFullRecord: false },
    { rateLimited: false, student: null, isFullRecord: false },
    { rateLimited: false, student: null, isFullRecord: false },
  ]);
  assert.deepEqual(loggedOutcomes, ["invalid", "unknown", "revoked"]);
});

test("public verification is rate limited before resolving a token", async () => {
  reset();
  attempts = 60;
  resolution = { outcome: "resolved", identity: null };
  const result = await getVerificationResult("c".repeat(43), { ipAddress: "192.0.2.10" });

  assert.equal(result.rateLimited, true);
  assert.equal(result.student, null);
  assert.equal(tenantCalls.length, 0);
  assert.equal(scanEvents[0].params[3], "rate_limited");
});
