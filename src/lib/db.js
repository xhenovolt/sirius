import mysql from "mysql2/promise";

let pool;

function getDatabaseConfig() {
  const host = process.env.TIDB_HOST;
  const user = process.env.TIDB_USER;
  const password = process.env.TIDB_PASSWORD;
  const database = process.env.TIDB_DB;

  if (!host || !user || !database) {
    throw new Error("Missing TiDB configuration. Set TIDB_HOST, TIDB_USER, TIDB_PASSWORD, and TIDB_DB.");
  }

  return {
    host,
    user,
    password,
    database,
    port: Number(process.env.TIDB_PORT || 4000),
    ssl: { minVersion: "TLSv1.2" },
    waitForConnections: true,
    connectionLimit: 10,
    enableKeepAlive: true,
  };
}

export function getDb() {
  if (!pool) {
    pool = mysql.createPool(getDatabaseConfig());
  }

  return pool;
}