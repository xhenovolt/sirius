import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeUgandaPhone,
  passwordResetPhoneLookupValues,
  uniquePasswordResetUser,
} from "./passwordResetIdentity.js";

test("password reset identity resolution refuses ambiguous users", () => {
  const firstUser = { id: 1, school_id: "school-a" };
  const secondUser = { id: 2, school_id: "school-b" };

  assert.equal(uniquePasswordResetUser([firstUser]), firstUser);
  assert.equal(uniquePasswordResetUser([]), null);
  assert.equal(uniquePasswordResetUser([firstUser, secondUser]), null);
});

test("password reset phone lookup accepts standard Uganda number formats", () => {
  assert.equal(normalizeUgandaPhone("0771 234 567"), "+256771234567");
  assert.equal(normalizeUgandaPhone("256771234567"), "+256771234567");
  assert.deepEqual(passwordResetPhoneLookupValues("+256 771-234-567"), [
    "256771234567",
    "0771234567",
  ]);
  assert.deepEqual(passwordResetPhoneLookupValues("not a phone"), []);
});
