import { randomBytes } from "node:crypto";
import { getDb } from "./db.js";
import { checkCapacity } from "./entitlements.js";

// 256 bits of entropy, comfortably above the 128-bit minimum. base64url encodes
// 32 bytes as 43 URL-safe characters.
const tokenBytes = 32;
const tokenPattern = /^[A-Za-z0-9_-]{22,86}$/;

export function generatePublicToken() {
  return randomBytes(tokenBytes).toString("base64url");
}

export function isTokenShaped(token) {
  return typeof token === "string" && tokenPattern.test(token);
}

export async function findActiveIdentity(executor, studentId, { lock = false } = {}) {
  const [rows] = await executor.query(
    `SELECT id, student_id, public_token, version, issued_at, revoked_at
     FROM qr_identities
     WHERE student_id = ? AND revoked_at IS NULL
     ORDER BY version DESC
     LIMIT 1${lock ? " FOR UPDATE" : ""}`,
    [studentId],
  );
  return rows[0] || null;
}

// Issue-once semantics. Run this inside the commit transaction so a re-import
// reuses the token the student already has instead of minting a new one.
export async function issueIdentityWithin(executor, studentId) {
  const existing = await findActiveIdentity(executor, studentId, { lock: true });
  if (existing) return existing;

  const [versionRows] = await executor.query(
    "SELECT COALESCE(MAX(version), 0) + 1 AS version FROM qr_identities WHERE student_id = ?",
    [studentId],
  );
  const publicToken = generatePublicToken();
  const [result] = await executor.query(
    "INSERT INTO qr_identities (student_id, public_token, version) VALUES (?, ?, ?)",
    [studentId, publicToken, Number(versionRows[0].version)],
  );

  return { id: result.insertId, student_id: studentId, public_token: publicToken, version: Number(versionRows[0].version), issued_at: null, revoked_at: null };
}

/** Raised when a card cannot be issued because the school's card limit is full. */
export class IdentityError extends Error {
  constructor(message, status = 400, code = null) {
    super(message);
    this.name = "IdentityError";
    this.status = status;
    this.code = code;
  }
}

export async function issueIdentity(studentId, { schoolId } = {}) {
  const db = getDb();
  // A card that already exists costs nothing, so only a NEW issue is metered.
  // This is the "how many cards before you must subscribe" rule for a school on
  // a free trial (limit = platform setting free_trial_card_limit).
  const [active] = await db.query(
    "SELECT 1 FROM qr_identities WHERE student_id = ? AND revoked_at IS NULL LIMIT 1",
    [studentId],
  );
  if (!active.length && schoolId) {
    const over = await checkCapacity(schoolId, "cards");
    if (over) throw new IdentityError(over.body.error, over.status, over.body.code);
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const identity = await issueIdentityWithin(connection, studentId);
    await connection.commit();
    return identity;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Distinguishes invalid / unknown / revoked internally so the caller can write
// an accurate scan audit row. The public response must stay identical for all
// three; that shaping happens in the /s route, not here.
export async function resolveToken(executor, publicToken) {
  if (!isTokenShaped(publicToken)) return { outcome: "invalid", identity: null };
  const [rows] = await executor.query(
    "SELECT id, student_id, public_token, version, revoked_at FROM qr_identities WHERE public_token = ? LIMIT 1",
    [publicToken],
  );
  const identity = rows[0];
  if (!identity) return { outcome: "unknown", identity: null };
  if (identity.revoked_at) return { outcome: "revoked", identity: null };
  return { outcome: "resolved", identity };
}

export function buildScanUrl(publicToken, baseUrl = process.env.APP_BASE_URL) {
  if (!baseUrl) throw new Error("APP_BASE_URL is not configured.");
  if (!isTokenShaped(publicToken)) throw new Error("Refusing to build a scan URL for a malformed token.");
  const host = baseUrl.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return `https://${host}/s/${publicToken}`;
}
