/**
 * Control Center — ISOLATED authentication (Xhenvolt security domain).
 *
 * A completely separate boundary from school auth: its own tables
 * (control_users / control_sessions / control_audit_logs), its own cookie
 * (sirius_control), its own password hashing (node scrypt — no shared code
 * paths with school login). Nothing here reads or writes `users`, `sessions`
 * or any school-auth table, so a mistake in the Control Center can never break
 * school login.
 *
 * Session tokens: 48 random bytes (hex) in the cookie; only the SHA-256 of the
 * token is stored, so a database leak does not leak usable sessions.
 *
 * This module deliberately imports nothing from `next` so its pure parts
 * (hashing, token hashing, row shaping) stay unit-testable under `node --test`.
 * The server-component cookie reader lives in ./server-session.js.
 */
import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { query } from './db.js';
import { throttleDecision, recentFailures, recordLoginAttempt, clearFailures } from './login-guard.js';

const scrypt = promisify(_scrypt);

export const CONTROL_COOKIE = 'sirius_control';
const SESSION_HOURS = 12;

const parseJsonList = (v) => {
  if (v == null || v === '') return null;
  if (Array.isArray(v)) return v;
  try { const p = JSON.parse(String(v)); return Array.isArray(p) ? p : null; } catch { return null; }
};

/** Row (with permissions / school_scope / access_expires_at) → ControlUser. */
export function toControlUser(u) {
  const scope = parseJsonList(u.school_scope);
  return {
    id: Number(u.id), name: u.name, email: u.email, role: u.role, status: u.status,
    permissions: parseJsonList(u.permissions)?.map(String) ?? null,
    // Tenant ids in Sirius are opaque STRINGS, never numbers.
    schoolScope: scope ? scope.map(String).filter(Boolean) : null,
    accessExpiresAt: u.access_expires_at ? new Date(u.access_expires_at).toISOString() : null,
  };
}

/* ── password hashing (pure, exported for tests) ──────────────────────── */

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${key.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, salt, hex] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !hex) return false;
  const key = await scrypt(password, salt, 64);
  const expected = Buffer.from(hex, 'hex');
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export const hashToken = (token) => createHash('sha256').update(token).digest('hex');

/** PURE role gate: who may manage Control Center users / features. */
export function canManage(role) {
  return role === 'XHENVOLT_SUPER_ADMIN';
}

/* ── lifecycle ────────────────────────────────────────────────────────── */

export async function hasAnyControlUser() {
  const r = await query(`SELECT 1 FROM control_users LIMIT 1`);
  return r.length > 0;
}

export async function createControlUser(args) {
  if (!args.name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(args.email)) return { ok: false, reason: 'Valid name and email are required' };
  if ((args.password || '').length < 10) return { ok: false, reason: 'Password must be at least 10 characters' };
  const hash = await hashPassword(args.password);
  try {
    const res = await query(
      `INSERT INTO control_users (name, email, password_hash, role, created_by) VALUES (?, ?, ?, ?, ?)`,
      [args.name.trim(), args.email.toLowerCase().trim(), hash, args.role, args.createdBy ?? null],
    );
    return { ok: true, id: res.insertId };
  } catch (e) {
    return { ok: false, reason: /Duplicate/.test(e?.message) ? 'Email already registered' : 'Failed to create user' };
  }
}

export async function loginControl(email, password, ip, userAgent) {
  const normEmail = String(email || '').toLowerCase().trim();

  // Brute-force guard: block once too many recent failures pile up.
  const { failures, secondsSinceLast } = await recentFailures(normEmail);
  const gate = throttleDecision(failures, secondsSinceLast);
  if (gate.blocked) {
    await controlAudit(null, 'login_throttled', 'session', { email: normEmail, failures }, ip ?? null);
    return { ok: false, reason: `Too many attempts. Try again in ${gate.retryAfterSec}s.`, retryAfterSec: gate.retryAfterSec };
  }

  const rows = await query(
    `SELECT id, name, email, password_hash, role, status, permissions, school_scope, access_expires_at,
            (access_expires_at IS NOT NULL AND access_expires_at <= NOW()) AS expired
       FROM control_users WHERE email = ? LIMIT 1`,
    [normEmail],
  );
  const u = rows[0];
  // Constant-shape failure: verify against a dummy hash when no user found.
  const ok = u ? await verifyPassword(password, u.password_hash) : (await verifyPassword(password, 'scrypt$00$00'), false);
  if (!u || !ok || u.status !== 'active' || Number(u.expired) === 1) {
    await recordLoginAttempt(normEmail, ip ?? null, false);
    await controlAudit(null, 'login_failed', 'session', { email: normEmail }, ip ?? null);
    return u && ok && u.status !== 'active'
      ? { ok: false, reason: u.status === 'suspended' ? 'Your Control Center access is suspended' : 'Account is disabled' }
      : u && ok && Number(u.expired) === 1
        ? { ok: false, reason: 'Your Control Center access has expired' }
        : { ok: false, reason: 'Invalid email or password' };
  }

  await cleanupControlSessions();
  const token = randomBytes(48).toString('hex');
  await query(
    `INSERT INTO control_sessions (user_id, token_hash, ip, user_agent, expires_at, last_activity_at)
     VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR), NOW())`,
    [u.id, hashToken(token), ip ?? null, (userAgent || '').slice(0, 250) || null, SESSION_HOURS],
  );
  await query(`UPDATE control_users SET last_login = NOW() WHERE id = ?`, [u.id]);
  await recordLoginAttempt(normEmail, ip ?? null, true);
  await clearFailures(normEmail); // reset the counter on a good login
  await controlAudit(u.id, 'login', 'session', null, ip);
  return { ok: true, token, user: toControlUser(u) };
}

export async function logoutControl(token) {
  if (!token) return;
  await query(`UPDATE control_sessions SET revoked_at = NOW() WHERE token_hash = ?`, [hashToken(token)]).catch(() => {});
}

/** Core session lookup by raw token. Shared by routes and server components. */
export async function getControlSessionFromToken(token) {
  if (!token) return null;
  const rows = await query(
    `SELECT u.id, u.name, u.email, u.role, u.status, u.permissions, u.school_scope, u.access_expires_at
       FROM control_sessions s JOIN control_users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > NOW() AND s.revoked_at IS NULL AND u.status = 'active'
        AND (u.access_expires_at IS NULL OR u.access_expires_at > NOW()) LIMIT 1`,
    [hashToken(token)],
  );
  const u = rows[0];
  if (u) await query(`UPDATE control_sessions SET last_activity_at = NOW() WHERE token_hash = ?`, [hashToken(token)]).catch(() => {});
  return u ? toControlUser(u) : null;
}

/** Route-handler session lookup (Node Request with a `cookies` getter). */
export async function getControlSession(req) {
  return getControlSessionFromToken(req.cookies.get(CONTROL_COOKIE)?.value);
}

export async function listControlSessions(req, userId) {
  const currentToken = req.cookies.get(CONTROL_COOKIE)?.value;
  const rows = await query(
    `SELECT id, ip, user_agent, created_at, expires_at, last_activity_at, revoked_at,
            (token_hash = ?) AS is_current
       FROM control_sessions
      WHERE user_id = ? AND revoked_at IS NULL AND expires_at > NOW()
      ORDER BY last_activity_at DESC, created_at DESC`,
    [currentToken ? hashToken(currentToken) : '', userId],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    session_ref: hashToken(String(row.id)).slice(0, 12),
    ip: row.ip,
    user_agent: row.user_agent,
    created_at: row.created_at,
    expires_at: row.expires_at,
    last_activity_at: row.last_activity_at,
    is_current: Number(row.is_current) === 1,
  }));
}

export async function revokeControlSession(userId, sessionId, currentToken) {
  const result = await query(
    `UPDATE control_sessions SET revoked_at = NOW()
      WHERE id = ? AND user_id = ? AND revoked_at IS NULL
        AND token_hash <> ?`,
    [sessionId, userId, currentToken ? hashToken(currentToken) : ''],
  );
  return Number(result?.affectedRows || 0) > 0;
}

export async function revokeOtherControlSessions(userId, currentToken) {
  const result = await query(
    `UPDATE control_sessions SET revoked_at = NOW()
      WHERE user_id = ? AND revoked_at IS NULL AND token_hash <> ?`,
    [userId, hashToken(currentToken)],
  );
  return Number(result?.affectedRows || 0);
}

export async function revokeAllControlSessions(userId) {
  const result = await query(
    `UPDATE control_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL`,
    [userId],
  );
  return Number(result?.affectedRows || 0);
}

export async function cleanupControlSessions() {
  const result = await query(
    `DELETE FROM control_sessions WHERE expires_at <= NOW() OR revoked_at IS NOT NULL`,
  );
  return Number(result?.affectedRows || 0);
}

export const clientIp = (req) =>
  (req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || '').trim() || null;

/** Every Control Center action lands here — who, what, where, when. */
export async function controlAudit(userId, action, resource, metadata, ip) {
  try {
    await query(
      `INSERT INTO control_audit_logs (user_id, action, resource, metadata, ip) VALUES (?, ?, ?, ?, ?)`,
      [userId, action, resource ?? null, metadata ? JSON.stringify(metadata) : null, ip ?? null],
    );
  } catch { /* audit must never break the operation */ }
}
