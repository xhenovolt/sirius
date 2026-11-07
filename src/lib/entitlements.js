/**
 * Plan-based capacity limits — the entitlement engine.
 *
 * WHY A CENTRAL ENGINE RATHER THAN A CHECK PER ROUTE
 * --------------------------------------------------
 * A limit is only real if every create path consults it. Hardcoding a
 * threshold into each route is how limits drift: the next route ships without
 * one and the limit silently stops meaning anything. Limits are read from the
 * plan row, so a new commercial plan is a database change, not a deployment.
 *
 * THE UNSET-PLAN POLICY, AND WHY IT IS DELIBERATE
 * ----------------------------------------------
 * A school whose plan does not resolve is treated as UNLIMITED, never as zero.
 * Failing open is the right default: the alternative turns a missing plan —
 * an administrative gap, not a customer decision — into a school that cannot
 * admit a learner on enrolment day. The one deliberate exception is CARDS: a
 * school with no plan is on a free trial, and its card ceiling comes from the
 * platform setting `free_trial_card_limit` (set by a superadmin). That is the
 * "how many cards before you must subscribe" rule, and it is data, not code.
 *
 * WHAT COUNTS AGAINST A LIMIT
 * ---------------------------
 * Only live rows. Counts must MATCH what the Control Center displays, so the
 * meters below are the single source for both.
 *
 * SIRIUS ADAPTATION: no staff/devices tables. Meters are learners (students),
 * users and cards (qr_identities). Tenant ids are opaque strings.
 */
import { query } from "./db.js";
import { getFreeTrialCardLimit } from "./control/platform-settings.js";

const KNOWN_LABELS = {
  learners:    'learners',
  users:       'user accounts',
  cards:       'clearance cards',
  storage_mb:  'MB of storage',
  sms_monthly: 'SMS messages this month',
};

/** Human label for a limit key; falls back to the key itself for new keys. */
export function limitLabel(key) {
  return KNOWN_LABELS[key] ?? String(key).replace(/_/g, ' ');
}

const SINGULAR_LABELS = {
  learners: 'learner',
  users:    'user account',
  cards:    'clearance card',
};

/** Count-aware label, for "1 card remaining" rather than "1 cards remaining". */
export function limitLabelFor(key, count) {
  if (Math.abs(count) === 1) return SINGULAR_LABELS[key] ?? limitLabel(key);
  return limitLabel(key);
}

/** Warning thresholds — one edit changes the Control Center and any banner. */
export const LIMIT_WARN_PERCENT = 90;
export const LIMIT_CRITICAL_PERCENT = 95;

export function severityFor(state) {
  if (state.limit === null || state.percent === null) return 'ok';
  if (state.exceeded) return 'exceeded';
  if (state.percent >= LIMIT_CRITICAL_PERCENT) return 'critical';
  if (state.percent >= LIMIT_WARN_PERCENT) return 'warn';
  return 'ok';
}

/**
 * Resolve a school's plan limits. Returns `null` when the school has no
 * resolvable plan — see the unset-plan policy above.
 */
export async function getPlanLimits(schoolId) {
  const rows = await query(
    `SELECT p.limits
       FROM schools s
       JOIN subscription_plans p
         ON p.code = s.subscription_plan
        AND p.is_active = 1
      WHERE s.school_id = ?
      LIMIT 1`,
    [schoolId],
  ).catch(() => []);

  if (!rows.length) return null;
  const raw = rows[0].limits;
  if (raw == null) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    // Malformed JSON must not become an accidental lockout.
    return null;
  }
}

/**
 * METER REGISTRY — the extensibility point.
 *
 * A limit is enforceable when two things line up: the plan JSON carries the
 * key, and a meter here knows how to count it. Adding `cards: 500` to a plan
 * row makes it enforceable immediately — no route changes, no deployment.
 *
 * These predicates MUST match the Control Center display exactly, so there is
 * one query per resource for both.
 */
const COUNT_METERS = {
  learners: `SELECT COUNT(*) n FROM students WHERE school_id = ? AND status = 'active'`,
  users:    `SELECT COUNT(*) n FROM users WHERE school_id = ? AND deleted_at IS NULL AND status = 'active'`,
  // A card exists once and is never regenerated; a revoked identity frees its slot.
  cards:    `SELECT COUNT(*) n FROM qr_identities WHERE school_id = ? AND revoked_at IS NULL`,
};

/** Keys this engine can actually measure — derived, never hand-maintained. */
export const METERED_KEYS = Object.keys(COUNT_METERS);

/**
 * Live usage for one key, or null when nothing can measure it.
 * A failed query returns null (never 0) so a broken counter cannot silently
 * disable a limit while claiming full headroom.
 */
export async function getUsage(schoolId, key) {
  const sql = COUNT_METERS[key];
  if (!sql) return null;
  const r = await query(sql, [schoolId]).catch(() => null);
  if (r === null) return null;
  return Number(r[0]?.n ?? 0);
}

/**
 * The effective ceiling for one key.
 * For every key this is the plan's value (null = unlimited). For `cards`, a
 * school with NO plan falls back to the platform free-trial card limit.
 */
async function resolveLimit(schoolId, key) {
  const limits = await getPlanLimits(schoolId);
  if (key === 'cards') {
    if (limits) return limits.cards ?? null;
    return getFreeTrialCardLimit();
  }
  return limits == null ? null : (limits[key] ?? null);
}

/** Current state of one limit, for display or for a decision. */
export async function getLimitState(schoolId, key) {
  const [limit, used] = await Promise.all([resolveLimit(schoolId, key), getUsage(schoolId, key)]);
  const metered = used !== null;

  if (limit == null || !Number.isFinite(Number(limit)) || Number(limit) <= 0) {
    return { key, limit: null, used, remaining: null, percent: null, exceeded: false, metered };
  }
  const cap = Number(limit);
  if (!metered) {
    return { key, limit: cap, used: null, remaining: null, percent: null, exceeded: false, metered };
  }
  const exceeded = used >= cap;
  return {
    key,
    limit: cap,
    used,
    remaining: Math.max(0, cap - used),
    // FLOOR, not round, and 100% is reserved for actually being full — a
    // number that says full when it is not is worse than no number at all.
    percent: exceeded ? 100 : Math.min(99, Math.floor((used / cap) * 100)),
    exceeded,
    metered,
  };
}

/** Every limit the school's plan declares, plus any metered key the plan omits. */
export async function getUsageSummary(schoolId) {
  const limits = await getPlanLimits(schoolId);
  const keys = new Set([...Object.keys(limits ?? {}), ...METERED_KEYS]);
  return Promise.all([...keys].map((k) => getLimitState(schoolId, k)));
}

/**
 * Gate a creation.
 *
 *   const over = await checkCapacity(schoolId, 'cards');
 *   if (over) return NextResponse.json(over.body, { status: over.status });
 *
 * Returns null to proceed, or a `{ status, body }` descriptor (so this module
 * needs no `next` import and stays unit-testable). `requested` is the count of
 * records that will GENUINELY BE CREATED — an import of 40 existing + 30 new
 * consumes 30, not 70.
 */
export async function checkCapacity(schoolId, key, requested = 1) {
  if (requested <= 0) return null;

  const state = await getLimitState(schoolId, key);
  if (state.limit === null) return null;   // unlimited or no plan (except cards)
  if (state.used === null) return null;    // ceiling exists but unmeasurable — fail open
  if (state.used + requested <= state.limit) return null;

  const label = limitLabel(key);
  const body = {
    error: state.remaining === 0
      ? `Your plan allows ${state.limit} ${label} and you have ${state.used}. Archive records you no longer need, or upgrade the plan.`
      : `This would exceed your plan: ${state.remaining} of ${state.limit} ${label} remaining, ${requested} requested.`,
    code: 'PLAN_LIMIT_REACHED',
    limit: {
      key,
      allowed: state.limit,
      used: state.used,
      remaining: state.remaining,
      requested,
    },
  };
  return { status: 403, body };
}
