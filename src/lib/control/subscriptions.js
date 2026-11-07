/**
 * Control Center — subscription plan engine.
 *
 * Turns plan strings into a real catalog: named tiers with configurable
 * resource limits (learners / users / cards / storage). A school references a
 * plan by code via `schools.subscription_plan`, so no tenant-schema change is
 * needed and a new commercial plan is a database change, not a deployment.
 *
 * Enforcement is intentionally split: this module owns the catalog + the PURE
 * limit maths (`usageAgainst`, `checkCanAdd`) so quotas can be surfaced here
 * and hard-enforced at each create path by the entitlement engine
 * (src/lib/entitlements.js) without re-deriving the rules.
 *
 * Sirius adaptation: presets are seeded by migration 004, so there is no
 * runtime seeder and no tombstone mechanism (nothing can resurrect a deleted
 * preset). Tenant ids are opaque strings.
 */
import { query } from "./db.js";
import { controlAudit } from "./auth.js";

export const BILLING_CYCLES = ["monthly", "termly", "annual", "one_time"];

export const LIMIT_KEYS = ["learners", "users", "cards", "storage_mb"];

/** PURE: split an invoice into installation (first time only) + subscription. */
export function invoiceAmounts(installationFee, subscriptionPrice, isFirstInvoice) {
  const installation = isFirstInvoice ? Math.max(0, Math.round(Number(installationFee) || 0)) : 0;
  const subscription = Math.max(0, Math.round(Number(subscriptionPrice) || 0));
  return { installation, subscription, total: installation + subscription };
}

/** PURE: days in a billing cycle (termly ≈ 122d/3 terms; annual = 365). */
export function billingCycleDays(cycle) {
  return cycle === "monthly" ? 30 : cycle === "termly" ? 122 : cycle === "annual" ? 365 : 0;
}

/** PURE: the subscription end date for a cycle starting at `from` (one_time → null). */
export function nextEndDate(cycle, from = new Date()) {
  const days = billingCycleDays(cycle);
  if (days === 0) return null; // one_time: no expiry
  return new Date(from.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/** PURE: the per-installment amount (rounded up to the currency's unit). */
export function installmentAmount(price, installments) {
  const n = Math.max(1, Math.floor(installments || 1));
  return Math.ceil((Number(price) || 0) / n);
}

const parse = (v, fallback) => {
  if (v == null) return fallback;
  if (typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return fallback; }
};

const rowToPlan = (r) => ({
  code: r.code, name: r.name, tier: Number(r.tier || 0),
  limits: parse(r.limits, {}), features: parse(r.features, []), is_active: !!Number(r.is_active),
  price: Number(r.price || 0), installation_fee: Number(r.installation_fee || 0), currency: r.currency || "UGX",
  billing_cycle: BILLING_CYCLES.includes(r.billing_cycle) ? r.billing_cycle : "annual",
  installments: Math.max(1, Number(r.installments || 1)), deliverables: parse(r.deliverables, []),
});

export async function listPlans() {
  const rows = await query(`SELECT * FROM subscription_plans ORDER BY tier ASC, name ASC`).catch(() => []);
  return rows.map(rowToPlan);
}

export async function getPlanByCode(code) {
  const rows = await query(`SELECT * FROM subscription_plans WHERE code = ? LIMIT 1`, [code]).catch(() => []);
  return rows[0] ? rowToPlan(rows[0]) : null;
}

/** Keep a limits object honest: known keys only, numbers or null. */
function sanitizeLimits(input) {
  const out = {};
  for (const key of LIMIT_KEYS) {
    const raw = input?.[key];
    out[key] = raw == null || raw === "" ? null : Math.max(0, Math.floor(Number(raw))) || null;
  }
  return out;
}

/** Create or update a plan (operator-authored). Returns the saved plan. */
export async function upsertPlan(input) {
  const code = String(input.code || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  if (!code) throw new Error("Plan code is required");
  const cycle = BILLING_CYCLES.includes(input.billing_cycle) ? input.billing_cycle : "annual";
  await query(
    `INSERT INTO subscription_plans
       (code, name, tier, limits, features, is_active, price, installation_fee, currency, billing_cycle, installments, deliverables)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), tier = VALUES(tier),
       limits = VALUES(limits), features = VALUES(features), is_active = VALUES(is_active),
       price = VALUES(price), installation_fee = VALUES(installation_fee), currency = VALUES(currency),
       billing_cycle = VALUES(billing_cycle), installments = VALUES(installments), deliverables = VALUES(deliverables)`,
    [code, String(input.name || code).trim(), Number(input.tier) || 0,
     JSON.stringify(sanitizeLimits(input.limits)), JSON.stringify(Array.isArray(input.features) ? input.features.map(String) : []),
     input.is_active === false ? 0 : 1, Number(input.price) || 0, Number(input.installation_fee) || 0,
     String(input.currency || "UGX").slice(0, 8), cycle, Math.max(1, Number(input.installments) || 1),
     JSON.stringify(Array.isArray(input.deliverables) ? input.deliverables.map(String) : [])],
  );
  return getPlanByCode(code);
}

/** How many (non-deleted) schools are currently on a plan code. */
export async function schoolsOnPlan(code) {
  const r = await query(`SELECT COUNT(*) n FROM schools WHERE subscription_plan = ? AND deleted_at IS NULL`, [code]).catch(() => [{ n: 0 }]);
  return Number(r[0]?.n || 0);
}

/** Delete a plan. Refuses while any school is still assigned to it. */
export async function deletePlan(code, operatorId, ip) {
  const inUse = await schoolsOnPlan(code);
  if (inUse > 0) return { ok: false, reason: `${inUse} school(s) still on this plan — reassign them first` };
  await query(`DELETE FROM subscription_plans WHERE code = ?`, [code]);
  await controlAudit(operatorId, "plan_deleted", `plans:${code}`, null, ip ?? null);
  return { ok: true };
}

/**
 * Assign a plan to a school. Also starts the billing clock: the subscription
 * end date is set from the plan's billing cycle (annual → +365d, etc.).
 * A one_time plan sets no expiry.
 */
export async function assignPlanToSchool(schoolId, code, operatorId, ip) {
  const plan = await getPlanByCode(code);
  if (!plan) return { ok: false, reason: "Unknown plan" };
  const end = nextEndDate(plan.billing_cycle);
  await query(
    `UPDATE schools SET subscription_plan = ?, subscription_status = 'active',
            subscription_start_date = COALESCE(subscription_start_date, CURDATE()),
            subscription_end_date = ?, updated_at = NOW() WHERE school_id = ?`,
    [code, end, schoolId],
  );
  await controlAudit(operatorId, "plan_assigned", `schools:${schoolId}`,
    { plan: code, name: plan.name, price: plan.price, currency: plan.currency, cycle: plan.billing_cycle, ends: end }, ip ?? null);
  return { ok: true, plan, ends: end };
}

/**
 * Renew a school's current plan for another billing cycle. Extends from the
 * later of "today" or the current end date (so early renewals stack).
 */
export async function renewSchool(schoolId, operatorId, ip) {
  const rows = await query(`SELECT subscription_plan, subscription_end_date FROM schools WHERE school_id = ? LIMIT 1`, [schoolId]).catch(() => []);
  const code = rows[0]?.subscription_plan;
  if (!code) return { ok: false, reason: "School has no plan assigned" };
  const plan = await getPlanByCode(code);
  if (!plan) return { ok: false, reason: "Assigned plan no longer exists" };
  const cur = rows[0]?.subscription_end_date ? new Date(rows[0].subscription_end_date) : null;
  const from = cur && cur.getTime() > Date.now() ? cur : new Date(); // stack early renewals
  const end = nextEndDate(plan.billing_cycle, from);
  await query(
    `UPDATE schools SET subscription_status = 'active', subscription_end_date = ?, updated_at = NOW() WHERE school_id = ?`,
    [end, schoolId],
  );
  await controlAudit(operatorId, "subscription_renewed", `schools:${schoolId}`,
    { plan: code, cycle: plan.billing_cycle, new_end: end, price: plan.price, currency: plan.currency }, ip ?? null);
  return { ok: true, ends: end, plan };
}

/* ── PURE limit maths (unit-tested) ─────────────────────────────────────── */

/** PURE: usage vs a plan's limits, per resource. null/0 limit = unlimited. */
export function usageAgainst(limits, usage) {
  return LIMIT_KEYS.map((key) => {
    const raw = limits?.[key];
    const unlimited = raw == null || raw === 0;
    const limit = unlimited ? null : Number(raw);
    const used = Number(usage?.[key] ?? 0);
    const pct = unlimited || !limit ? 0 : Math.min(100, Math.round((used / limit) * 100));
    return { key, used, limit, unlimited, over: !unlimited && !!limit && used > limit, pct };
  });
}

/** PURE: may `count` more of `key` be added under these limits? */
export function checkCanAdd(limits, key, current, adding = 1) {
  const raw = limits?.[key];
  if (raw == null || raw === 0) return { allowed: true }; // unlimited
  if (current + adding > Number(raw)) {
    return { allowed: false, reason: `Plan limit reached for ${key} (${current}/${raw})` };
  }
  return { allowed: true };
}
