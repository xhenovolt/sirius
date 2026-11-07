import bcrypt from "bcryptjs";
import fs from "node:fs";
import { getDb } from "../src/lib/db.js";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const separator = line.indexOf("=");
  const name = line.slice(0, separator);
  if (!process.env[name]) process.env[name] = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
}

const email = process.env.SIRIUS_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.SIRIUS_ADMIN_PASSWORD;
if (!email || !password || password.length < 12) throw new Error("Set SIRIUS_ADMIN_EMAIL and SIRIUS_ADMIN_PASSWORD (minimum 12 characters).");

const passwordHash = await bcrypt.hash(password, 12);
const db = getDb();
const [roleRows] = await db.query("SELECT id FROM roles WHERE school_id = 'default' AND slug = 'superadmin' LIMIT 1");
const superAdminRoleId = roleRows[0]?.id;
if (!superAdminRoleId) throw new Error("The default school's superadmin role is missing. Run `npm run migrate` first.");

const [existing] = await db.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
let userId;
if (existing[0]) {
  userId = existing[0].id;
  await db.query("UPDATE users SET password_hash = ?, role = 'admin', status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [passwordHash, userId]);
  await db.query("DELETE FROM sessions WHERE user_id = ?", [userId]);
  console.log("Administrator account updated.");
} else {
  const [result] = await db.query("INSERT INTO users (school_id, email, phone, display_name, password_hash, role, status) VALUES ('default', ?, '', 'Xhenvolt Administrator', ?, 'admin', 'active')", [email, passwordHash]);
  userId = result.insertId;
  console.log("Administrator account created.");
}
// Superadmin is DERIVED from user_roles, so the membership must exist too.
await db.query("INSERT IGNORE INTO user_roles (user_id, role_id, school_id, is_active, assigned_at) VALUES (?, ?, 'default', 1, CURRENT_TIMESTAMP)", [userId, superAdminRoleId]);
await db.end();