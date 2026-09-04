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
const [existing] = await db.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
if (existing[0]) {
  await db.query("UPDATE users SET password_hash = ?, role = 'admin', status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [passwordHash, existing[0].id]);
  await db.query("DELETE FROM sessions WHERE user_id = ?", [existing[0].id]);
  console.log("Administrator account updated.");
} else {
  await db.query("INSERT INTO users (school_id, email, phone, display_name, password_hash, role, status) VALUES ('default', ?, '', 'Xhenvolt Administrator', ?, 'admin', 'active')", [email, passwordHash]);
  console.log("Administrator account created.");
}
await db.end();