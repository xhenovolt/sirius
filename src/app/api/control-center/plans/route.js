/**
 * Control Center — subscription plan catalog.
 * GET    → plans + how many schools each has + the pure limit maths helper keys
 *          (plans.view)
 * POST   → create/update a plan (plans.create or plans.edit)
 * DELETE → delete a plan (plans.delete); refuses while a school is on it
 * All actions audited.
 */
import { NextResponse } from "next/server";
import { controlAudit, clientIp } from "@/lib/control/auth";
import { requireControl } from "@/lib/control/guard";
import { controlCan } from "@/lib/control/permissions";
import { listPlans, upsertPlan, deletePlan, schoolsOnPlan, LIMIT_KEYS, BILLING_CYCLES } from "@/lib/control/subscriptions";

export const runtime = "nodejs";

export async function GET(request) {
  const g = await requireControl(request, "plans.view");
  if (g.res) return g.res;
  const user = g.user;

  const plans = await listPlans();
  const withUsage = await Promise.all(plans.map(async (p) => ({ ...p, schools: await schoolsOnPlan(p.code) })));
  return NextResponse.json({
    success: true,
    plans: withUsage,
    limit_keys: LIMIT_KEYS,
    billing_cycles: BILLING_CYCLES,
    me: {
      id: user.id, role: user.role,
      can: {
        create: controlCan(user, "plans.create"),
        edit: controlCan(user, "plans.edit"),
        delete: controlCan(user, "plans.delete"),
      },
    },
  });
}

export async function POST(request) {
  // Creating and editing share a handler; require the specific permission.
  const body = await request.json().catch(() => null);
  const existing = body?.code ? (await listPlans()).some((p) => p.code === String(body.code).toLowerCase()) : false;
  const g = await requireControl(request, existing ? "plans.edit" : "plans.create");
  if (g.res) return g.res;
  const user = g.user;

  try {
    const saved = await upsertPlan(body || {});
    await controlAudit(user.id, existing ? "plan_updated" : "plan_created", `plans:${saved.code}`,
      { name: saved.name, limits: saved.limits, price: saved.price }, clientIp(request));
    return NextResponse.json({ success: true, plan: saved });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Unable to save plan." }, { status: 400 });
  }
}

export async function DELETE(request) {
  const g = await requireControl(request, "plans.delete");
  if (g.res) return g.res;
  const user = g.user;
  const url = new URL(request.url);
  const code = String(url.searchParams.get("code") || "").trim().toLowerCase();
  if (!code) return NextResponse.json({ error: "code is required" }, { status: 400 });
  const res = await deletePlan(code, user.id, clientIp(request));
  if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 });
  return NextResponse.json({ success: true });
}
