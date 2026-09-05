import { getDb } from "./db";

function clientIp(request) {
  const forwarded = request?.headers?.get?.("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request?.headers?.get?.("x-real-ip") || null;
}

export async function recordAuditLog({ session, request, action, entityType = null, entityId = null, details = null }) {
  try {
    await getDb().query(
      `INSERT INTO audit_logs (school_id, user_id, actor_email, action, entity_type, entity_id, details, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session?.school_id || "default",
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

export async function listAuditLogs(limit = 100) {
  const [rows] = await getDb().query(
    `SELECT id, user_id, actor_email, action, entity_type, entity_id, details, ip_address, created_at
     FROM audit_logs
     ORDER BY created_at DESC
     LIMIT ?`,
    [Number(limit)],
  );
  return rows;
}
