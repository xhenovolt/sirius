/**
 * Control Center — platform settings + maintenance mode.
 *
 * A tiny KV store for platform-wide flags, and a maintenance switch used to make
 * a risky deploy/migration safe:
 *   • 'off'        — normal.
 *   • 'banner'     — show a notice to all schools; full access.
 *   • 'read_only'  — show a notice AND block tenant writes; reads still work.
 *                    The Control Center is never blocked, so an operator can
 *                    always turn it back off.
 *
 * `isReadOnly` is PURE and unit-tested. `getMaintenance` is cached (30s) so it
 * adds no per-request DB cost on the hot path.
 */
import { query } from "./db.js";

export const MAINTENANCE_MODES = ['off', 'banner', 'read_only'];

/** PURE: does this mode block tenant writes? */
export function isReadOnly(mode) {
  return mode === 'read_only';
}

export async function getSetting(key) {
  const rows = await query(`SELECT value_text FROM platform_settings WHERE key_name = ? LIMIT 1`, [key]).catch(() => []);
  return rows[0]?.value_text ?? null;
}

export async function setSetting(key, value) {
  await query(
    `INSERT INTO platform_settings (key_name, value_text) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE value_text = VALUES(value_text)`,
    [key, value],
  ).catch(() => {});
}

let cache = null;

/** Current maintenance state (30s cache — safe default 'off' on any error). */
export async function getMaintenance() {
  if (cache && cache.exp > Date.now()) return cache.v;
  let v = { mode: 'off', message: '' };
  try {
    const raw = await getSetting('maintenance');
    if (raw) {
      const p = JSON.parse(raw);
      v = { mode: MAINTENANCE_MODES.includes(p.mode) ? p.mode : 'off', message: String(p.message || '') };
    }
  } catch { /* default off */ }
  cache = { v, exp: Date.now() + 30_000 };
  return v;
}

export async function setMaintenance(mode, message) {
  const clean = MAINTENANCE_MODES.includes(mode) ? mode : 'off';
  await setSetting('maintenance', JSON.stringify({ mode: clean, message: String(message || '') }));
  cache = null;
  return getMaintenance();
}

/* ── free-trial thresholds (superadmin-configurable) ──────────────────── */

/** Cards a school without a plan may generate before it must subscribe. null = unlimited. */
export async function getFreeTrialCardLimit() {
  const n = Number(await getSetting('free_trial_card_limit'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Length of a free trial, in days (0 = no trial). */
export async function getFreeTrialDays() {
  const n = Number(await getSetting('free_trial_days'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}
