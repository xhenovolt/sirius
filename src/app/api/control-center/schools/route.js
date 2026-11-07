/**
 * Control Center — school oversight.
 * GET   → list schools (searchable, paged) with per-row roll-ups and the plan
 *         catalog, gated by schools.view.
 * POST  → provision a new school + its first administrator (schools.create).
 * PATCH → assign_plan / renew / suspend / reactivate / soft_delete (schools.edit,
 *         schools.suspend, schools.delete).
 * All actions audited. A scoped operator only ever sees their schools.
 */
import { NextResponse } from "next/server";
import { query } from "@/lib/control/db";
import { controlAudit, clientIp } from "@/lib/control/auth";
import { requireControl, scopeClause, schoolInScope } from "@/lib/control/guard";
import { listPlans, assignPlanToSchool, renewSchool } from "@/lib/control/subscriptions";
import { createSchoolWithSuperAdmin } from "@/lib/tenancy";
import { getFreeTrialCardLimit } from "@/lib/control/platform-settings";

export const runtime = "nodejs";

const PAGE_SIZE = 25;

/** PURE: worst capacity severity across a school's metered limits. */
function capacitySeverity(limits, counts) {
  const checks = [
    ["learners", counts.learners],
    ["cards", counts.cards],
  ];
  let worst = "ok";
  const rank = { ok: 0, warn: 1, critical: 2, exceeded: 3 };
  for (const [key, used] of checks) {
    const raw = limits?.[key];
    if (raw == null || raw <= 0) continue; // unlimited
    const pct = Math.min(100, Math.floor((Number(used || 0) / Number(raw)) * 100));
    const sev = Number(used || 0) >= Number(raw) ? "exceeded" : pct >= 95 ? "critical" : pct >= 90 ? "warn" : "ok";
    if (rank[sev] > rank[worst]) worst = sev;
  }
  return worst;
}

export async function GET(request) {
  const g = await requireControl(request, "schools.view");
  if (g.res) return g.res;
  const user = g.user;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const offset = (page - 1) * PAGE_SIZE;

  const where = ["s.deleted_at IS NULL"];
  const params = [];
  if (q) {
    where.push("(s.school_name LIKE ? OR s.school_code LIKE ? OR s.school_id LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const scoped = scopeClause(user, "s.school_id");
  const whereSql = `WHERE ${where.join(" AND ")}${scoped.sql}`;

  const [rows, totalRows, plans] = await Promise.all([
    query(
      `SELECT s.school_id, s.school_name, s.school_code, s.status, s.subscription_plan, s.subscription_status,
              s.subscription_end_date, s.created_at,
              (SELECT COUNT(*) FROM students st WHERE st.school_id = s.school_id AND st.status = 'active') learners,
              (SELECT COUNT(*) FROM users u WHERE u.school_id = s.school_id AND u.deleted_at IS NULL AND u.status = 'active') users,
              (SELECT COUNT(DISTINCT u.id)
                 FROM users u
                 JOIN sessions us ON us.user_id = u.id AND us.school_id = u.school_id
                WHERE u.school_id = s.school_id AND u.deleted_at IS NULL AND u.status = 'active'
                  AND us.is_active = 1 AND us.expires_at > CURRENT_TIMESTAMP
                  AND us.last_seen_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 5 MINUTE)) online_users,
              (SELECT COUNT(*) FROM qr_identities qi WHERE qi.school_id = s.school_id AND qi.revoked_at IS NULL) cards
         FROM schools s ${whereSql}
        ORDER BY s.created_at DESC LIMIT ? OFFSET ?`,
      [...params, ...scoped.params, PAGE_SIZE, offset],
    ),
    query(`SELECT COUNT(*) n FROM schools s ${whereSql}`, [...params, ...scoped.params]),
    listPlans(),
  ]);

  const planByCode = Object.fromEntries(plans.map((p) => [p.code, p]));
  const trialCardLimit = await getFreeTrialCardLimit();

  const schools = rows.map((r) => {
    const plan = r.subscription_plan ? planByCode[r.subscription_plan] : null;
    const limits = plan?.limits ?? (trialCardLimit ? { cards: trialCardLimit } : null);
    return {
      school_id: r.school_id,
      school_name: r.school_name,
      school_code: r.school_code,
      status: r.status,
      subscription_plan: r.subscription_plan,
      subscription_status: r.subscription_status,
      subscription_end_date: r.subscription_end_date,
      created_at: r.created_at,
      learners: Number(r.learners || 0),
      users: Number(r.users || 0),
      online_users: Number(r.online_users || 0),
      cards: Number(r.cards || 0),
      capacity: capacitySeverity(limits, { learners: Number(r.learners || 0), cards: Number(r.cards || 0) }),
    };
  });

  return NextResponse.json({
    success: true,
    schools,
    total: Number(totalRows[0]?.n || 0),
    page,
    page_size: PAGE_SIZE,
    plans: plans.map((p) => ({ code: p.code, name: p.name })),
  });
}

export async function POST(request) {
  const g = await requireControl(request, "schools.create");
  if (g.res) return g.res;
  const user = g.user;
  const b = await request.json().catch(() => null);

  const schoolName = String(b?.school_name || "").trim();
  const email = String(b?.admin_email || "").toLowerCase().trim();
  const password = String(b?.admin_password || "");
  const displayName = String(b?.admin_name || "").trim();
  if (!schoolName || schoolName.length > 200) return NextResponse.json({ error: "School name is required (max 200 chars)." }, { status: 400 });
  if (!displayName || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "A valid administrator name and email are required." }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Administrator password must be at least 8 characters." }, { status: 400 });

  try {
    const { schoolId, userId } = await createSchoolWithSuperAdmin({
      schoolName,
      schoolCode: b?.school_code ? String(b.school_code).trim().slice(0, 64) : null,
      email,
      password,
      displayName,
      phone: b?.admin_phone ? String(b.admin_phone).trim().slice(0, 32) : null,
    });
    await controlAudit(user.id, "school_provisioned", `schools:${schoolId}`, { schoolName, adminEmail: email, userId }, clientIp(request));
    return NextResponse.json({ success: true, school_id: schoolId });
  } catch (error) {
    console.error("Provision school failed", error);
    return NextResponse.json({ error: "Unable to provision school." }, { status: 500 });
  }
}

export async function PATCH(request) {
  const b = await request.json().catch(() => null);
  const schoolId = String(b?.school_id || "");
  if (!schoolId) return NextResponse.json({ error: "school_id is required" }, { status: 400 });

  const action = String(b?.action || "");
  const need = action === "suspend" || action === "reactivate" ? "schools.suspend"
    : action === "soft_delete" ? "schools.delete"
      : "schools.edit";
  const g = await requireControl(request, need);
  if (g.res) return g.res;
  const user = g.user;
  if (!schoolInScope(user, schoolId)) return NextResponse.json({ error: "School not found" }, { status: 404 });

  try {
    if (action === "assign_plan") {
      const code = String(b?.plan || "");
      if (!code) return NextResponse.json({ error: "plan is required" }, { status: 400 });
      const res = await assignPlanToSchool(schoolId, code, user.id, clientIp(request));
      if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 });
      return NextResponse.json({ success: true, ends: res.ends });
    }
    if (action === "renew") {
      const res = await renewSchool(schoolId, user.id, clientIp(request));
      if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 });
      return NextResponse.json({ success: true, ends: res.ends });
    }
    if (action === "suspend" || action === "reactivate") {
      const status = action === "suspend" ? "suspended" : "active";
      await query(`UPDATE schools SET status = ?, status_reason = ?, updated_at = NOW() WHERE school_id = ?`,
        [status, action === "suspend" ? String(b?.reason || "").slice(0, 255) || null : null, schoolId]);
      await controlAudit(user.id, `school_${action}`, `schools:${schoolId}`, { reason: b?.reason ?? null }, clientIp(request));
      return NextResponse.json({ success: true });
    }
    if (action === "soft_delete") {
      await query(`UPDATE schools SET deleted_at = NOW(), updated_at = NOW() WHERE school_id = ?`, [schoolId]);
      await controlAudit(user.id, "school_soft_deleted", `schools:${schoolId}`, null, clientIp(request));
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("School action failed", error);
    return NextResponse.json({ error: "Unable to complete the action." }, { status: 500 });
  }
}
