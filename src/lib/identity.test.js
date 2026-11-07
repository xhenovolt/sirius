import test from "node:test";
import assert from "node:assert/strict";
import {
  buildScanUrl,
  generatePublicToken,
  isTokenShaped,
  issueIdentityWithin,
  resolveToken,
} from "./identity.js";

// In-memory stand-in for a mysql2 executor, so the issue-once logic can be
// tested without a live database.
function createFakeExecutor() {
  const identities = [];
  return {
    identities,
    async query(sql, params = []) {
      if (sql.includes("COALESCE(MAX(version)")) {
        const mine = identities.filter((row) => row.student_id === params[0]);
        return [[{ version: mine.length ? Math.max(...mine.map((row) => row.version)) + 1 : 1 }]];
      }
      if (sql.includes("INSERT INTO qr_identities")) {
        const row = { id: identities.length + 1, student_id: params[0], public_token: params[1], version: params[2], revoked_at: null };
        identities.push(row);
        return [{ insertId: row.id }];
      }
      if (sql.includes("public_token = ?")) {
        return [identities.filter((row) => row.public_token === params[0]).slice(0, 1)];
      }
      if (sql.includes("revoked_at IS NULL")) {
        const mine = identities
          .filter((row) => row.student_id === params[0] && !row.revoked_at)
          .sort((a, b) => b.version - a.version);
        return [mine.slice(0, 1)];
      }
      throw new Error(`unexpected query: ${sql}`);
    },
  };
}

test("generatePublicToken produces 256-bit URL-safe tokens", () => {
  const token = generatePublicToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(isTokenShaped(token));
});

test("generatePublicToken does not repeat", () => {
  const tokens = new Set(Array.from({ length: 2000 }, () => generatePublicToken()));
  assert.equal(tokens.size, 2000);
});

test("isTokenShaped rejects malformed input", () => {
  for (const value of ["", null, undefined, 42, "short", "has spaces xxxxxxxxxxxxxxxxxxxx", "a".repeat(100), "token/with+chars=abcdefghijkl"]) {
    assert.equal(isTokenShaped(value), false, `expected ${String(value)} to be rejected`);
  }
});

test("issueIdentityWithin returns the same token on a second call", async () => {
  const executor = createFakeExecutor();
  const first = await issueIdentityWithin(executor, 7);
  const second = await issueIdentityWithin(executor, 7);
  assert.equal(first.public_token, second.public_token);
  assert.equal(first.id, second.id);
  assert.equal(executor.identities.length, 1);
});

test("issueIdentityWithin mints a new versioned token after revocation", async () => {
  const executor = createFakeExecutor();
  const original = await issueIdentityWithin(executor, 9);
  executor.identities[0].revoked_at = new Date();
  const replacement = await issueIdentityWithin(executor, 9);
  assert.notEqual(replacement.public_token, original.public_token);
  assert.equal(replacement.version, 2);
  assert.equal(executor.identities.length, 2);
});

test("issueIdentityWithin keeps tokens isolated per student", async () => {
  const executor = createFakeExecutor();
  const a = await issueIdentityWithin(executor, 1);
  const b = await issueIdentityWithin(executor, 2);
  assert.notEqual(a.public_token, b.public_token);
});

test("resolveToken classifies invalid, unknown, revoked and resolved", async () => {
  const executor = createFakeExecutor();
  assert.equal((await resolveToken(executor, "not a token")).outcome, "invalid");
  assert.equal((await resolveToken(executor, generatePublicToken())).outcome, "unknown");

  const identity = await issueIdentityWithin(executor, 5);
  const resolved = await resolveToken(executor, identity.public_token);
  assert.equal(resolved.outcome, "resolved");
  assert.equal(resolved.identity.student_id, 5);

  executor.identities[0].revoked_at = new Date();
  assert.equal((await resolveToken(executor, identity.public_token)).outcome, "revoked");
});

test("buildScanUrl emits an https /s/{token} URL", () => {
  const token = generatePublicToken();
  assert.equal(buildScanUrl(token, "sirius.example.com"), `https://sirius.example.com/s/${token}`);
  assert.equal(buildScanUrl(token, "https://sirius.example.com/"), `https://sirius.example.com/s/${token}`);
  assert.throws(() => buildScanUrl(token, ""), /APP_BASE_URL/);
  assert.throws(() => buildScanUrl("nope", "sirius.example.com"), /malformed token/);
});
