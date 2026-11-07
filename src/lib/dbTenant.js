import { getDb } from "./db.js";

/**
 * The single tenant-scoped data-access layer.
 *
 * Every query that touches a tenant table MUST go through here, and the tenant
 * MUST come from the server session — never from the request body, query
 * string or a client cookie.
 *
 * The guard is fail-closed in two ways:
 *   1. the tenant id must be present and non-empty, and
 *   2. the SQL text itself must reference school_id, so a forgotten WHERE
 *      cannot silently return another school's rows.
 *
 * This mirrors the DRAIS `assertTenantSafe`/`queryTenant` shape, but the tenant
 * is a required first argument rather than an optional trailing one.
 */
export function assertTenantSafe(sql, schoolId) {
  if (schoolId === null || schoolId === undefined || String(schoolId).trim() === "") {
    throw new Error(`[dbTenant] FATAL: missing tenant id (got ${JSON.stringify(schoolId)}).`);
  }
  if (typeof sql !== "string" || !/school_id/i.test(sql)) {
    throw new Error(
      `[dbTenant] UNSAFE QUERY: SQL does not reference school_id.\nQuery: ${String(sql).slice(0, 200)}`,
    );
  }
}

/** Scoped query. Returns [rows, fields] exactly like mysql2. */
export async function queryTenant(schoolId, sql, params = []) {
  assertTenantSafe(sql, schoolId);
  return getDb().query(sql, params);
}

/** Scoped query returning the first row, or null. */
export async function queryTenantOne(schoolId, sql, params = []) {
  const [rows] = await queryTenant(schoolId, sql, params);
  return rows[0] || null;
}

/**
 * Run a unit of work inside a transaction where every statement is scoped.
 * The callback receives `{ query }`; the raw connection is passed second so
 * callers can use escape-free helpers when they truly need an unscoped read.
 */
export async function withTenantTransaction(schoolId, work) {
  if (schoolId === null || schoolId === undefined || String(schoolId).trim() === "") {
    throw new Error(`[dbTenant] FATAL: missing tenant id (got ${JSON.stringify(schoolId)}).`);
  }
  const connection = await getDb().getConnection();
  try {
    await connection.beginTransaction();
    const scoped = {
      query(sql, params = []) {
        assertTenantSafe(sql, schoolId);
        return connection.query(sql, params);
      },
    };
    const result = await work(scoped, connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
