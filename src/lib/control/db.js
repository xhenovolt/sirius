/**
 * Control Center data access.
 *
 * The Control Center is a PLATFORM service: it reads and writes the same
 * hosted database as the rest of Sirius, but through its own entry point so
 * its data access is never confused with the school-scoped layer (dbTenant).
 * Control code must NEVER import dbTenant and vice-versa.
 */
import { getDb } from "../db.js";

/** Run a query and return the rows. */
export async function query(sql, params = []) {
  const [rows] = await getDb().query(sql, params);
  return rows;
}

/** Run a query and return the first row, or null. */
export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

/** A dedicated connection, for transactions. */
export function getConnection() {
  return getDb().getConnection();
}
