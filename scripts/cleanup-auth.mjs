import fs from "node:fs/promises";
import mysql from "mysql2/promise";
import { scopeTenantConnection } from "../src/lib/dbTenant.js";

const env = Object.fromEntries((await fs.readFile(".env.local", "utf8")).split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => { const separator = line.indexOf("="); return [line.slice(0, separator), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "")]; }));
const connection = await mysql.createConnection({ host: env.TIDB_HOST, port: Number(env.TIDB_PORT || 4000), user: env.TIDB_USER, password: env.TIDB_PASSWORD, database: env.TIDB_DB, ssl: { minVersion: "TLSv1.2" } });
try {
  const [schools] = await connection.query("SELECT school_id FROM schools");
  for (const { school_id: schoolId } of schools) {
    const scoped = scopeTenantConnection(connection, schoolId);
    await scoped.query("DELETE FROM sessions WHERE school_id = ? AND expires_at <= CURRENT_TIMESTAMP", [schoolId]);
    await scoped.query(
      "DELETE FROM password_reset_codes WHERE school_id = ? AND (expires_at <= CURRENT_TIMESTAMP OR used_at IS NOT NULL)",
      [schoolId],
    );
  }
} finally {
  await connection.end();
}
console.log("Expired sessions and password reset codes removed.");