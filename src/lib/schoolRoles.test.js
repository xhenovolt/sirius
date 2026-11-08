import test, { mock } from "node:test";
import assert from "node:assert/strict";

const calls = [];

mock.module("./dbTenant.js", {
  exports: {
    async queryTenant(schoolId, sql, params) {
      calls.push({ schoolId, sql, params });
      return [[]];
    },
    async withTenantTransaction(schoolId, work) {
      return work({
        async query(sql, params) {
          calls.push({ schoolId, sql, params });
          return [{ insertId: 55, affectedRows: 1 }];
        },
      });
    },
  },
});

const { createSchoolRole } = await import("./schoolRoles.js");

test("custom roles persist tenant-scoped permissions with a normalized slug", async () => {
  calls.length = 0;
  const result = await createSchoolRole("school-a", {
    name: "Library Staff",
    description: "Manages student library data",
    permissions: ["students.view", "students.manage", "students.view"],
  });

  assert.deepEqual(result, {
    ok: true,
    id: 55,
    slug: "library_staff",
    permissions: ["students.view", "students.manage"],
  });
  assert.ok(calls.every(({ schoolId }) => schoolId === "school-a"));
  assert.ok(calls.some(({ sql }) => /INSERT INTO roles/i.test(sql)));
  assert.ok(calls.some(({ sql, params }) => /INSERT INTO role_permissions/i.test(sql) && params[2] === "students.manage"));
});

test("custom role creation rejects reserved names and unknown permissions", async () => {
  calls.length = 0;
  const reserved = await createSchoolRole("school-a", { name: "Admin", permissions: [] });
  const unknown = await createSchoolRole("school-a", { name: "Custom", permissions: ["users.superpower"] });

  assert.equal(reserved.ok, false);
  assert.equal(unknown.ok, false);
  assert.equal(calls.length, 0);
});
