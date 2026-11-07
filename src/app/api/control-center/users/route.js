/**
 * Control Center operators.
 * GET    → operators with their permissions, scope, expiry and activity, plus
 *          the permission catalog and presets the Operators screen builds from
 *          (operators.view)
 * POST   → create an operator { name, email, password, role, permissions?,
 *          school_scope?, access_expires_at?, notes? } (operators.create)
 * PATCH  → update an operator (operators.edit)
 * DELETE → remove an operator (operators.delete)
 * All actions audited.
 */
import { NextResponse } from "next/server";
import { query } from "@/lib/control/db";
import { controlAudit, clientIp } from "@/lib/control/auth";
import { requireControl } from "@/lib/control/guard";
import { CONTROL_AREAS, CONTROL_PRESETS, SUPER_ADMIN_ONLY, PLATFORM_WIDE_AREAS, controlCan, permissionsFor } from "@/lib/control/permissions";
import { listOperators, createOperator, updateOperator, deleteOperator } from "@/lib/control/operators";

export const runtime = "nodejs";

export async function GET(request) {
  const g = await requireControl(request, "operators.view");
  if (g.res) return g.res;
  const user = g.user;
  const [rows, schools] = await Promise.all([
    listOperators(),
    query(`SELECT school_id, school_name FROM schools WHERE deleted_at IS NULL ORDER BY school_name ASC`).catch(() => []),
  ]);
  return NextResponse.json({
    success: true,
    rows,
    catalog: { areas: CONTROL_AREAS, presets: CONTROL_PRESETS, superAdminOnly: SUPER_ADMIN_ONLY, platformWideAreas: PLATFORM_WIDE_AREAS },
    schools,
    me: {
      id: user.id, role: user.role, permissions: permissionsFor(user), school_scope: user.schoolScope ?? null,
      can: {
        create: controlCan(user, "operators.create"),
        edit: controlCan(user, "operators.edit"),
        delete: controlCan(user, "operators.delete"),
        audit: controlCan(user, "audit.view"),
      },
    },
  });
}

export async function POST(request) {
  const g = await requireControl(request, "operators.create");
  if (g.res) return g.res;
  const user = g.user;
  const body = await request.json().catch(() => null);
  const created = await createOperator(user, body);
  if (!created.ok) return NextResponse.json({ error: created.reason }, { status: created.status });
  await controlAudit(user.id, "operator_created", `control_users:${created.id}`, {
    email: body?.email, role: body?.role, permissions: body?.permissions ?? null, school_scope: body?.school_scope ?? null,
    access_expires_at: body?.access_expires_at ?? null,
  }, clientIp(request));
  return NextResponse.json({ success: true, id: created.id });
}

export async function PATCH(request) {
  const g = await requireControl(request, "operators.edit");
  if (g.res) return g.res;
  const user = g.user;
  const body = await request.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const { id: _ignored, ...patch } = body;
  const res = await updateOperator(user, id, patch);
  if (!res.ok) return NextResponse.json({ error: res.reason }, { status: res.status });
  await controlAudit(user.id, "operator_updated", `control_users:${id}`, res.changes, clientIp(request));
  return NextResponse.json({ success: true, changes: res.changes });
}

export async function DELETE(request) {
  const g = await requireControl(request, "operators.delete");
  if (g.res) return g.res;
  const user = g.user;
  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const res = await deleteOperator(user, id);
  if (!res.ok) return NextResponse.json({ error: res.reason }, { status: res.status });
  await controlAudit(user.id, "operator_deleted", `control_users:${id}`, res.changes, clientIp(request));
  return NextResponse.json({ success: true });
}
