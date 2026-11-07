/**
 * Control Center — the signed-in operator's OWN sessions.
 *
 * This screen is deliberately NOT permission-gated beyond authentication: an
 * operator always manages their own sessions, whatever their role.
 *   GET    → this operator's active sessions (settings.view not required)
 *   DELETE → revoke one session (?id=N) — never the current one
 *   POST   → { action: 'revoke_others' | 'revoke_all' }
 * All actions audited.
 */
import { NextResponse } from "next/server";
import { requireControl } from "@/lib/control/guard";
import {
  listControlSessions, revokeControlSession, revokeOtherControlSessions, revokeAllControlSessions,
  controlAudit, clientIp,
} from "@/lib/control/auth";

export const runtime = "nodejs";

export async function GET(request) {
  const g = await requireControl(request, null);
  if (g.res) return g.res;
  return NextResponse.json({ success: true, sessions: await listControlSessions(request, g.user.id) });
}

export async function POST(request) {
  const g = await requireControl(request, null);
  if (g.res) return g.res;
  const body = await request.json().catch(() => null);
  const action = body?.action;
  const currentToken = request.cookies.get("sirius_control")?.value;

  let ended = 0;
  if (action === "revoke_others") ended = await revokeOtherControlSessions(g.user.id, currentToken);
  else if (action === "revoke_all") ended = await revokeAllControlSessions(g.user.id);
  else return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  await controlAudit(g.user.id, `control_sessions_${action}`, "control_sessions", { ended }, clientIp(request));
  return NextResponse.json({ success: true, ended });
}

export async function DELETE(request) {
  const g = await requireControl(request, null);
  if (g.res) return g.res;
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const currentToken = request.cookies.get("sirius_control")?.value;
  const ok = await revokeControlSession(g.user.id, id, currentToken);
  if (!ok) return NextResponse.json({ error: "Session not found, already revoked, or is your current session" }, { status: 404 });
  await controlAudit(g.user.id, "control_session_revoked", `control_sessions:${id}`, null, clientIp(request));
  return NextResponse.json({ success: true });
}
