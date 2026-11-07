import test, { mock } from "node:test";
import assert from "node:assert/strict";

// Two schools with one student each. The stub below answers queries the way a
// real tenant-filtered query would, and records every call so the test can
// assert which tenant was asked for.
const schools = {
  sch_a: [{ id: 1, school_id: "sch_a", student_uid: "SIRIUS-A-1", admission_number: "A-1", full_name: "Amina A", class_name: "Form 1", stream: "", photo_url: "", status: "active" }],
  sch_b: [{ id: 2, school_id: "sch_b", student_uid: "SIRIUS-B-1", admission_number: "B-1", full_name: "Brian B", class_name: "Form 2", stream: "", photo_url: "", status: "active" }],
};

const calls = [];
const fakeExecutor = {
  query(sql, params = []) {
    calls.push({ sql, params });
    if (/FROM students/i.test(sql)) {
      const schoolId = params[0];
      let rows = (schools[schoolId] || []).filter((row) => row.school_id === schoolId);
      if (/student_uid = \?/i.test(sql)) {
        const uid = params[params.length - 1];
        rows = rows.filter((row) => row.student_uid === uid);
      }
      return Promise.resolve([rows]);
    }
    return Promise.resolve([[]]);
  },
};

// Swap the real pool for the stub BEFORE the code under test is loaded, so
// every scoped query lands in the stub instead of TiDB. The imports below must
// stay dynamic: a static import would pull the real db.js in first.
mock.module("./db.js", { exports: { getDb: () => fakeExecutor } });

const { assertTenantId, assertTenantSafe, queryTenant } = await import("./dbTenant.js");
const { searchStudents, getStudentByUid } = await import("./students.js");

test("the tenant guard is fail-closed", () => {
  assert.throws(() => assertTenantSafe("SELECT * FROM students", "sch_a"), /UNSAFE QUERY/);
  assert.throws(() => assertTenantSafe("SELECT * FROM students WHERE school_id = ?", ""), /missing tenant id/);
  assert.throws(() => assertTenantId(undefined), /missing tenant id/);
  assert.doesNotThrow(() => assertTenantSafe("SELECT * FROM students WHERE school_id = ?", "sch_a"));
});

test("queryTenant rejects SQL without school_id before reaching the database", async () => {
  calls.length = 0;
  await assert.rejects(
    () => queryTenant("sch_a", "SELECT * FROM students"),
    /UNSAFE QUERY/,
  );
  assert.equal(calls.length, 0);
});

test("searchStudents returns only the calling school's rows", async () => {
  const rows = await searchStudents("sch_a", "");

  assert.equal(rows.length, 1);
  assert.equal(rows[0].school_id, "sch_a");
  assert.equal(rows[0].full_name, "Amina A");
});

test("searchStudents binds the tenant, not the search term, as the scope", async () => {
  calls.length = 0;
  await searchStudents("sch_b", "");

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /school_id = \?/);
  assert.equal(calls[0].params[0], "sch_b");
});

test("searchStudents never leaks another school's rows", async () => {
  const rows = await searchStudents("sch_b", "");

  assert.ok(rows.every((row) => row.school_id === "sch_b"));
  assert.ok(!rows.some((row) => row.student_uid === "SIRIUS-A-1"));
});

test("getStudentByUid will not resolve a student from another school", async () => {
  const mine = await getStudentByUid("sch_a", "SIRIUS-A-1");
  const theirs = await getStudentByUid("sch_a", "SIRIUS-B-1");

  assert.equal(mine.student_uid, "SIRIUS-A-1");
  assert.equal(theirs, null);
});

test("a missing tenant is rejected before any query runs", async () => {
  calls.length = 0;
  await assert.rejects(() => searchStudents(undefined, "Amina"), /missing tenant id/);
  assert.equal(calls.length, 0, "no SQL should have been sent without a tenant");
});
