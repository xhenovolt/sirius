import { getDb } from "./db.js";
import { queryTenant } from "./dbTenant.js";

function clientIp(request) {
  const forwarded = request?.headers?.get?.("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request?.headers?.get?.("x-real-ip") || null;
}

export async function recordAuditLog({ session, request, action, entityType = null, entityId = null, details = null }) {
  // The tenant comes from the session, never from the caller. A session
  // without a school_id is a bug, and a mislabelled audit row is worse than
  // a missing one — so skip loudly rather than default the tenant.
  const schoolId = session?.school_id;
  if (!schoolId) {
    console.error("Audit log skipped: the session has no school_id.");
    return;
  }
  try {
    await getDb().query(
      `INSERT INTO audit_logs (school_id, user_id, actor_email, action, entity_type, entity_id, details, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        schoolId,
        session?.id || null,
        session?.email || null,
        action,
        entityType,
        entityId,
        details ? JSON.stringify(details) : null,
        clientIp(request),
        request?.headers?.get?.("user-agent")?.slice(0, 255) || null,
      ],
    );
  } catch (error) {
    // Audit logging must never break the primary request flow.
    console.error("Audit log write failed", error);
  }
}

export async function listAuditLogs(schoolId, limit = 100) {
  const [rows] = await queryTenant(
    schoolId,
    `SELECT id, user_id, actor_email, action, entity_type, entity_id, details, ip_address, created_at
     FROM audit_logs
     WHERE school_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [schoolId, Number(limit)],
  );
  return rows;
}
