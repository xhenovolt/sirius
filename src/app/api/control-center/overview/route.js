/**
 * GET /api/control-center/overview — the platform at a glance.
 * Schools by status, learners, users, clearance cards, plan spread and the
 * schools that need attention (no plan, i.e. on a free trial).
 * Control-session gated + audited.
 */
import { NextResponse } from "next/server";
import { query } from "@/lib/control/db";
import { controlAudit, clientIp } from "@/lib/control/auth";
import { requireControl } from "@/lib/control/guard";
import { scopeClause } from "@/lib/control/guard";

export const runtime = "nodejs";

export async function GET(request) {
  const g = await requireControl(request, "dashboard.view");
  if (g.res) return g.res;
  const user = g.user;

  const one = async (sql, params = []) => (await query(sql, params).catch(() => [{}]))[0] ?? {};

  const [schools, learners, users, cards, planSpread, noPlan] = await Promise.all([
    one(`SELECT COUNT(*) total,
                SUM(status = 'active') active,
                SUM(status = 'suspended') suspended,
                SUM(status = 'inactive') inactive
           FROM schools WHERE deleted_at IS NULL`),
    one(`SELECT COUNT(*) n FROM students WHERE status = 'active'`),
    one(`SELECT COUNT(*) n FROM users WHERE deleted_at IS NULL AND status = 'active'`),
    one(`SELECT COUNT(*) n FROM qr_identities WHERE revoked_at IS NULL`),
    query(`SELECT subscription_plan AS code, COUNT(*) AS n
             FROM schools WHERE deleted_at IS NULL AND subscription_plan IS NOT NULL
            GROUP BY subscription_plan ORDER BY n DESC`).catch(() => []),
    query(`SELECT school_id, school_name, created_at
             FROM schools WHERE deleted_at IS NULL AND (subscription_plan IS NULL OR subscription_plan = '')
            ORDER BY created_at DESC LIMIT 10`).catch(() => []),
  ]);

  const problems = [];
  const scoped = scopeClause(user, "school_id");
  const trialCount = await one(
    `SELECT COUNT(*) n FROM schools WHERE deleted_at IS NULL AND (subscription_plan IS NULL OR subscription_plan = '')${scoped.sql}`,
    scoped.params,
  );
  if (Number(trialCount.n || 0) > 0) {
    problems.push({ severity: "warning", text: `${trialCount.n} school(s) have no plan — they are on the free trial` });
  }

  await controlAudit(user.id, "viewed_overview", "overview", null, clientIp(request));
  return NextResponse.json({
    success: true,
    schools: {
      total: Number(schools.total || 0),
      active: Number(schools.active || 0),
      suspended: Number(schools.suspended || 0),
      inactive: Number(schools.inactive || 0),
    },
    learners: Number(learners.n || 0),
    users: Number(users.n || 0),
    cards: Number(cards.n || 0),
    plans: planSpread.map((r) => ({ code: r.code, schools: Number(r.n || 0) })),
    no_plan_schools: noPlan.map((r) => ({ school_id: r.school_id, school_name: r.school_name, created_at: r.created_at })),
    problems,
  });
}
