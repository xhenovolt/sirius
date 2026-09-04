import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { getDb } from "./db";

const cookieName = "sirius_session";
const sessionDays = 7;
const resetCodeMinutes = 10;

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createUser(email, password, displayName, phone, role = "operator") {
  const passwordHash = await bcrypt.hash(password, 12);
  const [result] = await getDb().query(
    "INSERT INTO users (school_id, email, phone, display_name, password_hash, role) VALUES ('default', ?, ?, ?, ?, ?)",
    [email.toLowerCase(), phone, displayName, passwordHash, role],
  );
  return result.insertId;
}

export async function authenticate(email, password) {
  const [rows] = await getDb().query("SELECT id, email, display_name, password_hash, role FROM users WHERE email = ? AND status = 'active' LIMIT 1", [email.toLowerCase()]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return null;

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000);
  await getDb().query("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)", [user.id, hashToken(token), expiresAt]);
  await getDb().query("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?", [user.id]);
  (await cookies()).set(cookieName, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt });
  return { id: user.id, email: user.email, displayName: user.display_name, role: user.role };
}

export async function getSession() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const [rows] = await getDb().query(
    `SELECT u.id, u.email, u.display_name AS displayName, u.role
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP AND u.status = 'active' LIMIT 1`,
    [hashToken(token)],
  );
  if (rows[0]) await getDb().query("UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = ?", [hashToken(token)]);
  return rows[0] || null;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token) await getDb().query("DELETE FROM sessions WHERE token_hash = ?", [hashToken(token)]);
  jar.delete(cookieName);
}

export async function cleanupAuthArtifacts() {
  await getDb().query("DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP");
  await getDb().query("DELETE FROM password_reset_codes WHERE expires_at <= CURRENT_TIMESTAMP OR used_at IS NOT NULL");
}

function normalizePhone(phone) {
  const value = String(phone || "").replace(/[\s()-]/g, "");
  if (/^07\d{8}$/.test(value)) return `+256${value.slice(1)}`;
  if (/^2567\d{8}$/.test(value)) return `+${value}`;
  if (/^\+2567\d{8}$/.test(value)) return value;
  return null;
}

function findIdentifier(identifier) {
  const value = String(identifier || "").trim().toLowerCase();
  return { value, phone: normalizePhone(value) || value };
}

async function sendSms(phone, message) {
  const username = process.env.AFRICASTALKING_USERNAME || process.env.AT_USERNAME;
  const apiKey = process.env.AFRICASTALKING_API_KEY || process.env.AT_API_KEY;
  if (!username || !apiKey) throw new Error("Africa's Talking SMS is not configured.");
  const body = new URLSearchParams({ username, to: phone, message });
  const response = await fetch("https://api.africastalking.com/version1/messaging", { method: "POST", headers: { apiKey, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!response.ok) throw new Error(`SMS provider returned ${response.status}`);
}

export async function signUp(email, password, displayName, phone) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) throw new Error("Use a valid Uganda mobile number.");
  return createUser(email, password, displayName, normalizedPhone);
}

export async function requestPasswordReset(identifier) {
  const { value, phone } = findIdentifier(identifier);
  const [rows] = await getDb().query("SELECT id, phone FROM users WHERE (email = ? OR phone = ?) AND status = 'active' LIMIT 1", [value, phone]);
  if (!rows[0]) return;
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await getDb().query("UPDATE password_reset_codes SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL", [rows[0].id]);
  await getDb().query("INSERT INTO password_reset_codes (user_id, code_hash, expires_at) VALUES (?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 10 MINUTE))", [rows[0].id, hashToken(code)]);
  await sendSms(rows[0].phone, `Sirius by Xhenvolt: your password reset code is ${code}. It expires in 10 minutes.`);
}

export async function resetPassword(identifier, code, password) {
  const { value, phone } = findIdentifier(identifier);
  const [users] = await getDb().query("SELECT id FROM users WHERE (email = ? OR phone = ?) AND status = 'active' LIMIT 1", [value, phone]);
  if (!users[0]) return false;
  const [codes] = await getDb().query("SELECT id, code_hash, attempts FROM password_reset_codes WHERE user_id = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP ORDER BY created_at DESC LIMIT 1", [users[0].id]);
  const reset = codes[0];
  if (!reset || reset.attempts >= 5) return false;
  await getDb().query("UPDATE password_reset_codes SET attempts = attempts + 1 WHERE id = ?", [reset.id]);
  if (hashToken(String(code).trim()) !== reset.code_hash) return false;
  const passwordHash = await bcrypt.hash(password, 12);
  await getDb().query("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [passwordHash, users[0].id]);
  await getDb().query("UPDATE password_reset_codes SET used_at = CURRENT_TIMESTAMP WHERE id = ?", [reset.id]);
  await getDb().query("DELETE FROM sessions WHERE user_id = ?", [users[0].id]);
  return true;
}

export async function requireAdmin() {
  const session = await getSession();
  return session?.role === "admin" ? session : null;
}

export async function terminateUserSessions(userId) {
  await getDb().query("DELETE FROM sessions WHERE user_id = ?", [userId]);
}