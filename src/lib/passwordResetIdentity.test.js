import test from "node:test";
import assert from "node:assert/strict";

import { uniquePasswordResetUser } from "./passwordResetIdentity.js";

test("password reset identity resolution refuses ambiguous users", () => {
  const firstUser = { id: 1, school_id: "school-a" };
  const secondUser = { id: 2, school_id: "school-b" };

  assert.equal(uniquePasswordResetUser([firstUser]), firstUser);
  assert.equal(uniquePasswordResetUser([]), null);
  assert.equal(uniquePasswordResetUser([firstUser, secondUser]), null);
});
