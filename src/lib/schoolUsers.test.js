import test from "node:test";
import assert from "node:assert/strict";
import { schoolUserActionPolicy } from "./schoolUsers.js";

test("a user cannot delete their own school user record", () => {
  const result = schoolUserActionPolicy({
    action: "delete",
    actorId: 7,
    targetId: 7,
    targetIsAdmin: true,
    activeAdminCount: 2,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});

test("the last active school administrator cannot be demoted", () => {
  const result = schoolUserActionPolicy({
    action: "demote",
    actorId: 7,
    targetId: 9,
    targetRole: "admin",
    targetIsAdmin: true,
    activeAdminCount: 1,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
});

test("an administrator may be demoted when another active administrator remains", () => {
  const result = schoolUserActionPolicy({
    action: "demote",
    actorId: 7,
    targetId: 9,
    targetRole: "admin",
    targetIsAdmin: true,
    activeAdminCount: 2,
  });

  assert.deepEqual(result, { ok: true });
});

test("the last active administrator cannot be changed to a non-admin role", () => {
  const result = schoolUserActionPolicy({
    action: "set_role",
    actorId: 7,
    targetId: 9,
    targetRole: "admin",
    nextRole: "operator",
    targetIsAdmin: true,
    activeAdminCount: 1,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
});

test("only a school SuperAdmin can manage a SuperAdmin user", () => {
  const result = schoolUserActionPolicy({
    action: "delete",
    actorId: 7,
    targetId: 9,
    targetRole: "superadmin",
    targetIsSuperAdmin: true,
    targetIsAdmin: true,
    activeAdminCount: 2,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
});

test("only a school SuperAdmin can assign the SuperAdmin role", () => {
  const result = schoolUserActionPolicy({
    action: "set_role",
    actorId: 7,
    targetId: 9,
    targetRole: "operator",
    nextRole: "superadmin",
    targetIsAdmin: false,
    activeAdminCount: 1,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
});

test("school SuperAdmin can assign the Bursar role", () => {
  const result = schoolUserActionPolicy({
    action: "set_role",
    actorId: 7,
    targetId: 9,
    targetRole: "operator",
    nextRole: "bursar",
    actorIsSuperAdmin: true,
    targetIsAdmin: false,
    activeAdminCount: 1,
  });

  assert.deepEqual(result, { ok: true });
});
