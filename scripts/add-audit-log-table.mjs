import fs from "node:fs/promises";
import mysql from "mysql2/promise";

function readEnv(contents) {
  return Object.fromEntries(
    contents
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "")];
      }),
  );
}

const env = readEnv(await fs.readFile(".env.local", "utf8"));
const connection = await mysql.createConnection({
  host: env.TIDB_HOST,
  port: Number(env.TIDB_PORT || 4000),
  user: env.TIDB_USER,
  password: env.TIDB_PASSWORD,
  database: env.TIDB_DB,
  ssl: { minVersion: "TLSv1.2" },
});

try {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      school_id VARCHAR(64) NULL,
      user_id BIGINT UNSIGNED NULL,
      actor_email VARCHAR(200) NULL,
      action VARCHAR(100) NOT NULL,
      entity_type VARCHAR(100) NULL,
      entity_id VARCHAR(200) NULL,
      details JSON NULL,
      ip_address VARCHAR(64) NULL,
      user_agent VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY audit_logs_user_index (user_id),
      KEY audit_logs_action_index (action),
      KEY audit_logs_created_index (created_at),
      CONSTRAINT audit_logs_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
    )
  `);

  const [tables] = await connection.query(
    `SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'audit_logs'`,
    [env.TIDB_DB],
  );
  console.log(tables.length ? "audit_logs table is ready." : "audit_logs table was not created.");
} finally {
  await connection.end();
}
