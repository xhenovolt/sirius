/**
 * Control Center — the platform audit log.
 * GET ?page&limit&q → { rows, pagination } (audit.view)
 * Every operator action on the platform lands here (who/what/when/where).
 */
import { NextResponse } from "next/server";
import { query } from "@/lib/control/db";
import { requireControl } from "@/lib/control/guard";

export const runtime = "nodejs";

const clampLimit = (n) => Math.min(200, Math.max(1, Number(n) || 50));

export async function GET(request) {
  const g = await requireControl(request, "audit.view");
  if (g.res) return g.res;

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = clampLimit(url.searchParams.get("limit"));
  const q = (url.searchParams.get("q") || "").trim();

  const where = [];
  const params = [];
  if (q) {
    const like = `%${q}%`;
    where.push("(a.action LIKE ? OR a.resource LIKE ? OR a.metadata LIKE ? OR a.ip LIKE ? OR u.name LIKE ?)");
    params.push(like, like, like, like, like);
  }
  const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";

  const [rows, countRows] = await Promise.all([
    query(
      `SELECT a.id, a.action, a.resource, a.metadata, a.ip, a.created_at, u.name AS user_name
         FROM control_audit_logs a LEFT JOIN control_users u ON u.id = a.user_id
         ${whereSql}
        ORDER BY a.id DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit],
    ),
    query(
      `SELECT COUNT(*) AS n FROM control_audit_logs a LEFT JOIN control_users u ON u.id = a.user_id ${whereSql}`,
      params,
    ),
  ]);

  const total = Number(countRows[0]?.n || 0);
  return NextResponse.json({
    success: true,
    rows: rows.map((r) => ({
      id: Number(r.id), action: r.action, resource: r.resource, metadata: r.metadata, ip: r.ip,
      user_name: r.user_name ?? null,
      created_at: r.created_at ? new Date(r.created_at).toISOString() : null,
    })),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
}
