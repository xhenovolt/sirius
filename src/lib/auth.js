import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { getDb } from "./db.js";
import { queryTenant, withTenantTransaction } from "./dbTenant.js";
import { recordAuditLog } from "./audit.js";
import { assignRole, createSchoolWithSuperAdmin, findRoleId, superAdminSlug } from "./tenancy.js";
import { checkCapacity } from "./entitlements.js";
import { getLoginFailureReason } from "./loginFailure.js";
import { assertSchoolPassword } from "./schoolPassword.js";
import { hasSchoolPermission } from "./schoolPermissions.js";
export { hasSchoolPermission };
import {
  normalizeUgandaPhone,
  passwordResetPhoneLookupValues,
  uniquePasswordResetUser,
} from "./passwordResetIdentity.js";

const cookieName = "sirius_session";
const sessionDays = 7;
const resetCodeMinutes = 10;
const heartbeatSeconds = 60;

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function newSessionToken() {
  return randomBytes(32).toString("hex");
}

/**
 * The tenant is read from the session row, which is written at login/signup and
 * never from client input. Superadmin is DERIVED from the user's active roles
 * in that school, so revoking a role revokes the privilege immediately.
 */
const sessionSelect = `
  SELECT u.id,
         u.email,
         u.display_name AS displayName,
         u.phone,
         u.school_id AS schoolId,
         u.must_change_password AS mustChangePassword,
         s.id AS sessionId,
         COALESCE((
           SELECT r.slug
           FROM user_roles ur
           JOIN roles r ON r.id = ur.role_id
           WHERE ur.user_id = u.id
             AND ur.school_id = u.school_id
             AND ur.is_active = 1
             AND r.is_active = 1
           ORDER BY CASE r.slug WHEN 'superadmin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END
           LIMIT 1
         ), u.role) AS roleSlug,
         EXISTS (
           SELECT 1
           FROM user_roles ur
           JOIN roles r ON r.id = ur.role_id
           WHERE ur.user_id = u.id
             AND ur.school_id = u.school_id
             AND ur.is_active = 1
             AND r.is_active = 1
             AND r.is_super_admin = 1
         ) AS isSuperAdmin,
         EXISTS (
           SELECT 1
           FROM user_roles ur
           JOIN roles r ON r.id = ur.role_id
           LEFT JOIN role_permissions rp
             ON rp.role_id = r.id AND rp.school_id = r.school_id
           WHERE ur.user_id = u.id
             AND ur.school_id = u.school_id
             AND ur.is_active = 1
             AND r.is_active = 1
             AND (r.slug IN ('superadmin', 'admin') OR rp.permission_key = 'users.manage')
         ) AS isSchoolAdmin,
         COALESCE((
           SELECT GROUP_CONCAT(DISTINCT rp.permission_key ORDER BY rp.permission_key SEPARATOR ',')
             FROM user_roles ur
             JOIN roles r ON r.id = ur.role_id AND r.school_id = ur.school_id
             JOIN role_permissions rp ON rp.role_id = r.id AND rp.school_id = r.school_id
            WHERE ur.user_id = u.id AND ur.school_id = u.school_id
              AND ur.is_active = 1 AND r.is_active = 1
         ), '') AS permissionList
  FROM sessions s
  JOIN users u ON u.id = s.user_id
  WHERE s.token_hash = ?
    AND s.school_id = u.school_id
    AND s.expires_at > CURRENT_TIMESTAMP
    AND s.is_active = 1
    AND u.status = 'active'
    AND u.deleted_at IS NULL
  LIMIT 1`;

function shapeSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    phone: row.phone,
    school_id: row.schoolId,
    mustChangePassword: Boolean(row.mustChangePassword),
    role: row.roleSlug,
    isSuperAdmin: Boolean(row.isSuperAdmin),
    isSchoolAdmin: Boolean(row.isSchoolAdmin),
    permissions: row.permissionList ? row.permissionList.split(",") : [],
  };
}

/**
 * Throttled heartbeat: at most one write per session per minute, and no write
 * at all while the session was seen recently. This is what makes "online"
 * cheap and what "active" (account enabled) stays independent from.
 */
async function touchSession(sessionId, schoolId) {
  await queryTenant(
    schoolId,
    `UPDATE sessions
        SET last_seen_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND school_id = ?
        AND last_seen_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? SECOND)`,
    [sessionId, schoolId, heartbeatSeconds],
  );
}

async function setSessionCookie(token, expiresAt) {
  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

async function insertSession(userId, schoolId, token, request) {
  const expiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000);
  await queryTenant(
    schoolId,
    `INSERT INTO sessions (user_id, school_id, token_hash, expires_at, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      userId,
      schoolId,
      hashToken(token),
      expiresAt,
      clientIp(request),
      request?.headers?.get?.("user-agent")?.slice(0, 255) || null,
    ],
  );
  return expiresAt;
}

function clientIp(request) {
  const forwarded = request?.headers?.get?.("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim().slice(0, 64);
  return request?.headers?.get?.("x-real-ip")?.slice(0, 64) || null;
}

/**
 * Create a non-superadmin user inside an existing school. The tenant comes
 * from the caller's session, so a superadmin can only staff their own school.
 */
export async function createUser({ schoolId, email, password, displayName, phone = "", roleSlug = "operator", createdBy = null }) {
  await assertSchoolPassword(password);
  const normalizedPhone = normalizeUgandaPhone(phone);
  if (!normalizedPhone) {
    const error = new Error("A valid Uganda mobile number is required for password recovery.");
    error.code = "INVALID_USER_PHONE";
    throw error;
  }
  // One choke point for the `users` meter, so no create path can skip it.
  // A missing plan resolves to unlimited, so a brand-new school is never blocked.
  const over = await checkCapacity(schoolId, "users");
  if (over) {
    const error = new Error(over.body.error);
    error.status = over.status;
    error.code = over.body.code;
    error.limit = over.body.limit;
    throw error;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  // users.role is DEPRECATED and only kept for display; authorisation reads
  // user_roles. It is an ENUM('admin','operator'), so map anything non-operator
  // (admin, bursar, superadmin) to 'admin'.
  const legacyRole = roleSlug === "operator" ? "operator" : "admin";
  return withTenantTransaction(schoolId, async (scoped) => {
    const [result] = await scoped.query(
      `INSERT INTO users (school_id, email, phone, display_name, password_hash, role, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
      [schoolId, String(email).trim().toLowerCase(), normalizedPhone, displayName, passwordHash, legacyRole, createdBy],
    );
    const userId = result.insertId;
    const roleId = await findRoleId(scoped, schoolId, roleSlug);
    if (!roleId) throw new Error(`School role "${roleSlug}" is not configured.`);
    await assignRole(scoped, { userId, roleId, schoolId, assignedBy: createdBy });
    return { userId, roleId };
  });
}

export async function authenticate(email, password, request) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const [rows] = await getDb().query(
    `SELECT id, email, display_name, password_hash, school_id, status
       FROM users
      WHERE email = ? AND deleted_at IS NULL
      LIMIT 1`,
    [normalizedEmail],
  );
  const user = rows[0];
  if (!user) {
    console.warn("School sign-in rejected", { reason: "account_not_found" });
    return null;
  }
  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  const failureReason = getLoginFailureReason(user, passwordMatches);
  if (failureReason) {
    await recordAuditLog({
      session: { id: user.id, email: user.email, school_id: user.school_id },
      request,
      action: "login.failed",
      entityType: "user",
      entityId: String(user.id),
      details: { reason: failureReason },
    });
    return null;
  }

  const token = newSessionToken();
  const expiresAt = await insertSession(user.id, user.school_id, token, request);
  await queryTenant(
    user.school_id,
    "UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?",
    [user.id, user.school_id],
  );
  await setSessionCookie(token, expiresAt);

  const session = await getSession();
  return session || { id: user.id, email: user.email, displayName: user.display_name, school_id: user.school_id };
}

/** Signup = a new school and its first SuperAdmin, auto-activated. */
export async function signUpSchool({ schoolName, schoolCode = null, email, password, displayName, phone }, request) {
  const normalizedPhone = phone ? normalizeUgandaPhone(phone) : "";
  if (phone && !normalizedPhone) throw new Error("Use a valid Uganda mobile number.");

  const { schoolId, userId } = await createSchoolWithSuperAdmin({
    schoolName,
    schoolCode,
    email,
    password,
    displayName,
    phone: normalizedPhone,
  });

  const token = newSessionToken();
  const expiresAt = await insertSession(userId, schoolId, token, request);
  await setSessionCookie(token, expiresAt);
  return { schoolId, userId };
}

export async function getSession() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const [rows] = await getDb().query(sessionSelect, [hashToken(token)]);
  const session = shapeSession(rows[0]);
  if (!session) return null;
  await touchSession(rows[0].sessionId, session.school_id);
  return session;
}

export async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error("NOT_AUTHENTICATED");
  return session;
}

/**
 * A school superadmin — the only role allowed to create or remove staff for
 * the school. Returns null rather than throwing so routes can return 403.
 */
export async function requireSchoolAdmin() {
  const session = await getSession();
  return session && session.isSchoolAdmin ? session : null;
}

export async function requireSchoolPermission(permission) {
  const session = await getSession();
  return hasSchoolPermission(session, permission) ? session : null;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token) {
    const session = await getSession();
    if (session) {
      await queryTenant(
        session.school_id,
        "DELETE FROM sessions WHERE token_hash = ? AND school_id = ?",
        [hashToken(token), session.school_id],
      );
    }
  }
  jar.delete(cookieName);
}

export async function cleanupAuthArtifacts(schoolId) {
  await withTenantTransaction(schoolId, async (scoped) => {
    await scoped.query("DELETE FROM sessions WHERE school_id = ? AND expires_at <= CURRENT_TIMESTAMP", [schoolId]);
    await scoped.query(
      "DELETE FROM password_reset_codes WHERE school_id = ? AND (expires_at <= CURRENT_TIMESTAMP OR used_at IS NOT NULL)",
      [schoolId],
    );
  });
}

export async function terminateUserSessions(userId, schoolId) {
  await queryTenant(schoolId, "DELETE FROM sessions WHERE user_id = ? AND school_id = ?", [userId, schoolId]);
}

function findIdentifier(identifier) {
  const value = String(identifier || "").trim().toLowerCase();
  return { value, phone: normalizeUgandaPhone(value) };
}

async function findPasswordResetUser(value, phone) {
  const db = getDb();
  if (value.includes("@")) {
    const [rows] = await db.query(
      "SELECT id, phone, school_id FROM users WHERE email = ? AND status = 'active' AND deleted_at IS NULL LIMIT 2",
      [value],
    );
    return uniquePasswordResetUser(rows);
  }

  const phoneValues = passwordResetPhoneLookupValues(phone || value);
  if (!phoneValues.length) return null;
  const [rows] = await db.query(
    `SELECT id, phone, school_id
       FROM users
      WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), '.', '') IN (?, ?)
        AND status = 'active' AND deleted_at IS NULL
      LIMIT 2`,
    phoneValues,
  );
  return uniquePasswordResetUser(rows);
}

async function sendSms(phone, message) {
  const username = process.env.AFRICASTALKING_USERNAME || process.env.AT_USERNAME;
  const apiKey = process.env.AFRICASTALKING_API_KEY || process.env.AT_API_KEY;
  if (!username || !apiKey) throw new Error("Africa's Talking SMS is not configured.");
  const body = new URLSearchParams({ username, to: phone, message });
  const response = await fetch("https://api.africastalking.com/version1/messaging", {
    method: "POST",
    headers: { apiKey, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`SMS provider returned ${response.status}`);
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("SMS provider returned an unreadable response.");
  }
  const recipients = result?.SMSMessageData?.Recipients;
  if (!Array.isArray(recipients) || recipients.length === 0 || recipients.some((recipient) => recipient.status !== "Success")) {
    throw new Error("SMS provider did not confirm delivery.");
  }
}

/** Cryptographically random 6-digit code, compared in constant time. */
function generateResetCode() {
  return String(randomBytes(4).readUInt32BE(0) % 1000000).padStart(6, "0");
}

function codesMatch(supplied, storedHash) {
  const a = Buffer.from(hashToken(supplied));
  const b = Buffer.from(String(storedHash));
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function requestPasswordReset(identifier) {
  const { value, phone } = findIdentifier(identifier);
  const user = await findPasswordResetUser(value, phone);
  if (!user) return;
  const destination = normalizeUgandaPhone(user.phone);
  if (!destination) return;

  const code = generateResetCode();
  const resetCodeId = await withTenantTransaction(user.school_id, async (scoped) => {
    await scoped.query("SELECT id FROM users WHERE id = ? AND school_id = ? FOR UPDATE", [user.id, user.school_id]);
    const [recent] = await scoped.query(
      `SELECT id FROM password_reset_codes
        WHERE school_id = ? AND user_id = ? AND used_at IS NULL
          AND created_at > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 60 SECOND)
        LIMIT 1`,
      [user.school_id, user.id],
    );
    if (recent[0]) return false;
    await scoped.query(
      "UPDATE password_reset_codes SET used_at = CURRENT_TIMESTAMP WHERE school_id = ? AND user_id = ? AND used_at IS NULL",
      [user.school_id, user.id],
    );
    const [result] = await scoped.query(
      `INSERT INTO password_reset_codes (school_id, user_id, code_hash, expires_at)
       VALUES (?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? MINUTE))`,
      [user.school_id, user.id, hashToken(code), resetCodeMinutes],
    );
    return result.insertId;
  });
  if (!resetCodeId) return;
  try {
    await sendSms(destination, `Sirius by Xhenvolt: your password reset code is ${code}. It expires in ${resetCodeMinutes} minutes.`);
  } catch (error) {
    try {
      await queryTenant(
        user.school_id,
        "UPDATE password_reset_codes SET used_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND school_id = ? AND used_at IS NULL",
        [resetCodeId, user.id, user.school_id],
      );
    } catch (cleanupError) {
      console.error("Failed to invalidate undelivered password reset code", cleanupError);
    }
    throw error;
  }
}

export async function resetPassword(identifier, code, password) {
  await assertSchoolPassword(password);
  const { value, phone } = findIdentifier(identifier);
  const user = await findPasswordResetUser(value, phone);
  if (!user) return false;
  const passwordHash = await bcrypt.hash(password, 12);
  return withTenantTransaction(user.school_id, async (scoped) => {
    const [activeUsers] = await scoped.query(
      "SELECT id FROM users WHERE id = ? AND school_id = ? AND status = 'active' AND deleted_at IS NULL FOR UPDATE",
      [user.id, user.school_id],
    );
    if (!activeUsers[0]) return false;
    const [codes] = await scoped.query(
      `SELECT id, code_hash, attempts FROM password_reset_codes
        WHERE school_id = ? AND user_id = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [user.school_id, user.id],
    );
    const reset = codes[0];
    if (!reset || reset.attempts >= 5) return false;
    await scoped.query(
      "UPDATE password_reset_codes SET attempts = attempts + 1 WHERE id = ? AND school_id = ?",
      [reset.id, user.school_id],
    );
    if (!codesMatch(String(code).trim(), reset.code_hash)) return false;

    await scoped.query(
      "UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?",
      [passwordHash, user.id, user.school_id],
    );
    await scoped.query(
      "UPDATE password_reset_codes SET used_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?",
      [reset.id, user.school_id],
    );
    await scoped.query("DELETE FROM sessions WHERE user_id = ? AND school_id = ?", [user.id, user.school_id]);
    return true;
  });
}
