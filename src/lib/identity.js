import { randomBytes } from "node:crypto";
import { assertTenantId, queryTenant, withTenantTransaction } from "./dbTenant.js";
import { checkCapacity, getLimitState } from "./entitlements.js";

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

export async function findActiveIdentity(executor, schoolId, studentId, { lock = false } = {}) {
  const [rows] = await executor.query(
    `SELECT id, student_id, public_token, version, issued_at, revoked_at
     FROM qr_identities
     WHERE school_id = ? AND student_id = ? AND revoked_at IS NULL
     ORDER BY version DESC
     LIMIT 1${lock ? " FOR UPDATE" : ""}`,
    [schoolId, studentId],
  );
  return rows[0] || null;
}

// Issue-once semantics. A re-import or later card print reuses the active
// token instead of minting a new one.
export async function issueIdentityWithin(executor, schoolId, studentId) {
  const existing = await findActiveIdentity(executor, schoolId, studentId, { lock: true });
  if (existing) return existing;

  const [versionRows] = await executor.query(
    "SELECT COALESCE(MAX(version), 0) + 1 AS version FROM qr_identities WHERE school_id = ? AND student_id = ?",
    [schoolId, studentId],
  );
  const publicToken = generatePublicToken();
  const [result] = await executor.query(
    "INSERT INTO qr_identities (school_id, student_id, public_token, version) VALUES (?, ?, ?, ?)",
    [schoolId, studentId, publicToken, Number(versionRows[0].version)],
  );

  return { id: result.insertId, school_id: schoolId, student_id: studentId, public_token: publicToken, version: Number(versionRows[0].version), issued_at: null, revoked_at: null };
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
  assertTenantId(schoolId);
  const [students] = await queryTenant(
    schoolId,
    "SELECT id FROM students WHERE school_id = ? AND id = ? AND status = 'active' LIMIT 1",
    [schoolId, studentId],
  );
  if (!students.length) throw new IdentityError("Student not found.", 404);
  const identities = await issueIdentitiesForStudents(schoolId, [studentId]);
  const identity = identities[String(studentId)];
  if (!identity) {
    const over = await checkCapacity(schoolId, "cards");
    if (over) throw new IdentityError(over.body.error, over.status, over.body.code);
    throw new IdentityError("Unable to issue a card for this student.", 500);
  }
  return identity;
}

export async function issueIdentitiesForStudents(schoolId, studentIds) {
  assertTenantId(schoolId);
  const ids = [...new Set(studentIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (ids.length === 0) return {};
  const placeholders = ids.map(() => "?").join(", ");

  return withTenantTransaction(schoolId, async (scoped) => {
    const [schools] = await scoped.query(
      "SELECT school_id FROM schools WHERE school_id = ? FOR UPDATE",
      [schoolId],
    );
    if (!schools.length) throw new IdentityError("School not found.", 404);

    const [existing] = await scoped.query(
      `SELECT student_id, public_token, id, version, issued_at, revoked_at
         FROM qr_identities
        WHERE school_id = ? AND revoked_at IS NULL AND student_id IN (${placeholders})`,
      [schoolId, ...ids],
    );
    const identities = Object.fromEntries(existing.map((identity) => [
      String(identity.student_id),
      identity,
    ]));
    const missingIds = ids.filter((id) => !identities[String(id)]);
    if (missingIds.length === 0) return identities;

    const capacity = await getLimitState(schoolId, "cards");
    const canCreate = capacity.limit === null || capacity.used === null
      ? missingIds.length
      : Math.min(missingIds.length, Math.max(0, capacity.limit - capacity.used));
    const [students] = await scoped.query(
      `SELECT id FROM students
        WHERE school_id = ? AND status = 'active' AND id IN (${placeholders})
        FOR UPDATE`,
      [schoolId, ...missingIds],
    );
    const activeStudentIds = new Set(students.map((student) => Number(student.id)));
    let created = 0;
    for (const studentId of missingIds) {
      if (created >= canCreate) break;
      if (!activeStudentIds.has(studentId)) continue;
      const identity = await issueIdentityWithin(scoped, schoolId, studentId);
      identities[String(studentId)] = identity;
      created += 1;
    }
    return identities;
  });
}

// Distinguishes invalid / unknown / revoked internally so the caller can write
// an accurate scan audit row. The public response must stay identical for all
// three; the /v page returns the same public response for each.
export async function resolveToken(executor, publicToken) {
  if (!isTokenShaped(publicToken)) return { outcome: "invalid", identity: null };
  // Public verification has no session tenant. This exact-token lookup only
  // resolves the opaque capability to its stored tenant; student data is read
  // afterward through queryTenant using that stored school_id.
  const [rows] = await executor.query(
    "SELECT id, school_id, student_id, public_token, version, revoked_at FROM qr_identities WHERE public_token = ? LIMIT 1",
    [publicToken],
  );
  const identity = rows[0];
  if (!identity) return { outcome: "unknown", identity: null };
  if (identity.revoked_at) return { outcome: "revoked", identity };
  return { outcome: "resolved", identity };
}

export class AppBaseUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = "AppBaseUrlError";
    this.code = "APP_BASE_URL_INVALID";
  }
}

export function getAppBaseUrl(baseUrl = process.env.APP_BASE_URL, {
  production = process.env.NODE_ENV === "production",
} = {}) {
  if (typeof baseUrl !== "string" || !baseUrl.trim()) {
    throw new AppBaseUrlError("Set the public website URL in Control Center → Platform Settings.");
  }
  const value = baseUrl.trim();
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new AppBaseUrlError("Enter a valid website hostname, such as sirius.example.com.");
  }
  if (!["http:", "https:"].includes(url.protocol)
    || !url.hostname
    || url.username
    || url.password
    || url.pathname !== "/"
    || url.search
    || url.hash) {
    throw new AppBaseUrlError("Enter only a public website hostname; paths, credentials, query strings, and fragments are not allowed.");
  }
  const isLocalHost = url.hostname === "localhost"
    || url.hostname.endsWith(".localhost")
    || url.hostname === "127.0.0.1"
    || url.hostname === "[::1]";
  if (production && url.protocol !== "https:") {
    throw new AppBaseUrlError("The public website URL must use HTTPS in production.");
  }
  if (production && isLocalHost) {
    throw new AppBaseUrlError("A localhost URL cannot be used for production QR codes.");
  }
  return url.origin;
}

export function buildScanUrl(publicToken, baseUrl = process.env.APP_BASE_URL) {
  if (!isTokenShaped(publicToken)) throw new Error("Refusing to build a scan URL for a malformed token.");
  return `${getAppBaseUrl(baseUrl)}/v/${publicToken}`;
}
