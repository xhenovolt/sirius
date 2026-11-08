import test, { mock } from "node:test";
import assert from "node:assert/strict";

const calls = [];
const target = {
  id: 9,
  status: "active",
  deleted_at: null,
  role_slug: "operator",
  is_superadmin: 0,
  is_admin: 0,
};

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
          if (/SELECT school_id FROM schools/i.test(sql)) return [[{ school_id: schoolId }]];
          if (/SELECT u\.id, u\.status, u\.deleted_at/i.test(sql)) return [[target]];
          if (/SELECT COUNT\(DISTINCT u\.id\)/i.test(sql)) return [[{ count: 2 }]];
          if (/SELECT id FROM roles/i.test(sql)) return [[{ id: 44 }]];
          return [{ affectedRows: 1 }];
        },
      });
    },
  },
});

const { listSchoolUsers, performSchoolUserAction } = await import("./schoolUsers.js");

test("school user lists exclude any retained legacy soft-deleted accounts", async () => {
  calls.length = 0;
  await listSchoolUsers("school-a");

  assert.match(calls[0].sql, /u\.deleted_at IS NULL/);
  assert.deepEqual(calls[0].params, ["school-a"]);
});

test("SuperAdmin can assign any seeded school role to another user", async () => {
  calls.length = 0;
  const result = await performSchoolUserAction({
    schoolId: "school-a",
    actorId: 7,
    actorIsSuperAdmin: true,
    userId: 9,
    action: "set_role",
    values: { role: "superadmin" },
  });

  assert.deepEqual(result, { ok: true });
  assert.ok(calls.some(({ sql, params }) => /INSERT INTO user_roles/i.test(sql) && params[1] === 44));
  assert.ok(calls.some(({ sql, params }) => /UPDATE users SET role/i.test(sql) && params[0] === "admin"));
});

test("deleting a user physically removes the account within its tenant", async () => {
  calls.length = 0;
  const result = await performSchoolUserAction({
    schoolId: "school-a",
    actorId: 7,
    actorIsSuperAdmin: true,
    userId: 9,
    action: "delete",
  });

  assert.deepEqual(result, { ok: true });
  const deletion = calls.find(({ sql }) => /DELETE FROM users/i.test(sql));
  assert.ok(deletion);
  assert.match(deletion.sql, /WHERE id = \? AND school_id = \?/i);
  assert.deepEqual(deletion.params, [9, "school-a"]);
  assert.equal(calls.some(({ sql }) => /UPDATE users SET deleted_at/i.test(sql)), false);
  assert.equal(calls.some(({ sql }) => /UPDATE sessions SET is_active = 0/i.test(sql)), false);
});
