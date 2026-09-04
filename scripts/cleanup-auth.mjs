import fs from "node:fs/promises";
import mysql from "mysql2/promise";

const env = Object.fromEntries((await fs.readFile(".env.local", "utf8")).split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => { const separator = line.indexOf("="); return [line.slice(0, separator), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "")]; }));
const connection = await mysql.createConnection({ host: env.TIDB_HOST, port: Number(env.TIDB_PORT || 4000), user: env.TIDB_USER, password: env.TIDB_PASSWORD, database: env.TIDB_DB, ssl: { minVersion: "TLSv1.2" } });
await connection.query("DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP");
await connection.query("DELETE FROM password_reset_codes WHERE expires_at <= CURRENT_TIMESTAMP OR used_at IS NOT NULL");
await connection.end();
console.log("Expired sessions and password reset codes removed.");