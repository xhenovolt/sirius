import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_SCHOOL_PASSWORD_POLICY,
  parseSchoolPasswordPolicy,
  schoolPasswordPolicyError,
} from "./passwordPolicyRules.js";

test("school passwords default to a six-character minimum with no composition rules", () => {
  assert.equal(schoolPasswordPolicyError("123456"), null);
  assert.equal(schoolPasswordPolicyError("12345"), "Password must include at least 6 characters.");
});

test("school password policies can require selected character types", () => {
  const policy = {
    ...DEFAULT_SCHOOL_PASSWORD_POLICY,
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSymbol: true,
  };

  assert.equal(
    schoolPasswordPolicyError("abcdef", policy),
    "Password must include at least 8 characters, an uppercase letter, a number and a symbol.",
  );
  assert.equal(schoolPasswordPolicyError("Abcdef1!", policy), null);
});

test("policy parsing rejects unsupported lengths, missing flags, and unknown settings", () => {
  assert.equal(parseSchoolPasswordPolicy({ ...DEFAULT_SCHOOL_PASSWORD_POLICY, minLength: 5 }), null);
  assert.equal(parseSchoolPasswordPolicy({ minLength: 6 }), null);
  assert.equal(parseSchoolPasswordPolicy({ ...DEFAULT_SCHOOL_PASSWORD_POLICY, requireEmoji: true }), null);
  assert.deepEqual(parseSchoolPasswordPolicy(DEFAULT_SCHOOL_PASSWORD_POLICY), DEFAULT_SCHOOL_PASSWORD_POLICY);
});
