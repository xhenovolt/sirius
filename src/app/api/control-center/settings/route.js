/**
 * Control Center — platform settings.
 * GET  → maintenance mode + free-trial thresholds (settings.view)
 * PUT  → update any of them (settings.edit)
 * All actions audited.
 */
import { NextResponse } from "next/server";
import { controlAudit, clientIp } from "@/lib/control/auth";
import { requireControl } from "@/lib/control/guard";
import {
  getMaintenance, setMaintenance, getFreeTrialDays, getFreeTrialCardLimit,
  getSchoolPasswordPolicy, setSchoolPasswordPolicy, setSetting, MAINTENANCE_MODES,
} from "@/lib/control/platform-settings";
import { parseSchoolPasswordPolicy } from "@/lib/passwordPolicyRules";

export const runtime = "nodejs";

async function readSettings() {
  const [maintenance, freeTrialDays, freeTrialCardLimit, schoolPasswordPolicy] = await Promise.all([
    getMaintenance(), getFreeTrialDays(), getFreeTrialCardLimit(), getSchoolPasswordPolicy(),
  ]);
  return {
    maintenance,
    free_trial_days: freeTrialDays,
    free_trial_card_limit: freeTrialCardLimit,
    school_password_policy: schoolPasswordPolicy,
    maintenance_modes: MAINTENANCE_MODES,
  };
}

export async function GET(request) {
  const g = await requireControl(request, "settings.view");
  if (g.res) return g.res;
  try {
    return NextResponse.json({ success: true, settings: await readSettings() });
  } catch (error) {
    console.error("Control settings load failed", error);
    return NextResponse.json({ error: "Unable to load platform settings." }, { status: 503 });
  }
}

export async function PUT(request) {
  const g = await requireControl(request, "settings.edit");
  if (g.res) return g.res;
  const user = g.user;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  if (body.school_password_policy !== undefined && !parseSchoolPasswordPolicy(body.school_password_policy)) {
    return NextResponse.json({
      error: "Password policy must set a minimum length from 6 to 72 and choose true or false for each character requirement.",
    }, { status: 400 });
  }

  try {
    const changes = {};
    if (body.maintenance_mode !== undefined) {
      const m = await setMaintenance(String(body.maintenance_mode), String(body.maintenance_message || ""));
      changes.maintenance = m;
    }
    if (body.free_trial_days !== undefined) {
      const n = Math.max(0, Math.floor(Number(body.free_trial_days) || 0));
      await setSetting("free_trial_days", String(n));
      changes.free_trial_days = n;
    }
    if (body.free_trial_card_limit !== undefined) {
      const n = Math.max(0, Math.floor(Number(body.free_trial_card_limit) || 0));
      await setSetting("free_trial_card_limit", String(n));
      changes.free_trial_card_limit = n;
    }
    if (body.school_password_policy !== undefined) {
      changes.school_password_policy = await setSchoolPasswordPolicy(body.school_password_policy);
    }
    if (!Object.keys(changes).length) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });

    await controlAudit(user.id, "platform_settings_updated", "platform_settings", changes, clientIp(request));
    return NextResponse.json({ success: true, settings: await readSettings() });
  } catch (error) {
    console.error("Control settings update failed", error);
    return NextResponse.json({ error: "Unable to save platform settings." }, { status: 503 });
  }
}
