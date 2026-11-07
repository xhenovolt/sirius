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
    targetIsAdmin: true,
    activeAdminCount: 2,
  });

  assert.deepEqual(result, { ok: true });
});
