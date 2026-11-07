/**
 * Control Center auth API (Xhenvolt domain — never touches school auth).
 *   GET    → { setup_required, authenticated, user? }
 *   POST   → login { email, password }
 *   PUT    → first-time setup { name, email, password, confirm_password } (only when 0 users)
 *   DELETE → logout
 */
import { NextResponse } from "next/server";
import {
  hasAnyControlUser, createControlUser, loginControl, logoutControl,
  getControlSession, controlAudit, clientIp, CONTROL_COOKIE,
} from "@/lib/control/auth";
import { permissionsFor } from "@/lib/control/permissions";

export const runtime = "nodejs";

const cookieOpts = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 12 * 3600,
};

export async function GET(request) {
  const [setupRequired, user] = await Promise.all([
    hasAnyControlUser().then((v) => !v),
    getControlSession(request),
  ]);
  return NextResponse.json({
    success: true,
    setup_required: setupRequired,
    authenticated: !!user,
    // When a bootstrap secret is configured, first-run setup must supply it.
    bootstrap_secret_required: setupRequired && !!process.env.CONTROL_BOOTSTRAP_SECRET,
    // What this operator may open and do — the shell filters its menu and pages
    // with it (the API enforces the same list server-side).
    user: user ? {
      id: user.id, name: user.name, email: user.email, role: user.role,
      permissions: permissionsFor(user), school_scope: user.schoolScope ?? null,
      access_expires_at: user.accessExpiresAt ?? null,
    } : null,
  });
}

export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.password) return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  const res = await loginControl(String(body.email), String(body.password), clientIp(request), request.headers.get("user-agent"));
  if (!res.ok) {
    // Brute-force lockout → 429 with a Retry-After hint.
    if (res.retryAfterSec) {
      return NextResponse.json({ error: res.reason, retry_after: res.retryAfterSec }, {
        status: 429, headers: { "Retry-After": String(res.retryAfterSec) },
      });
    }
    return NextResponse.json({ error: res.reason }, { status: 401 });
  }
  const out = NextResponse.json({ success: true, user: { name: res.user.name, email: res.user.email, role: res.user.role } });
  out.cookies.set(CONTROL_COOKIE, res.token, cookieOpts);
  return out;
}

export async function PUT(request) {
  // First-time setup — permanently closed the moment any user exists.
  if (await hasAnyControlUser()) return NextResponse.json({ error: "Setup already completed" }, { status: 409 });
  const body = await request.json().catch(() => null);
  if (!body?.name || !body?.email || !body?.password) return NextResponse.json({ error: "Name, email and password are required" }, { status: 400 });
  if (body.password !== body.confirm_password) return NextResponse.json({ error: "Passwords do not match" }, { status: 400 });
  // Bootstrap gate: if a secret is configured, the first operator can only be
  // created by someone who holds it — closes the "first to reach a fresh
  // deployment claims God-mode" race. No secret set → unchanged behaviour.
  const bootSecret = process.env.CONTROL_BOOTSTRAP_SECRET;
  if (bootSecret && String(body.bootstrap_secret || "") !== bootSecret) {
    return NextResponse.json({ error: "Invalid or missing bootstrap secret" }, { status: 403 });
  }
  const created = await createControlUser({
    name: String(body.name), email: String(body.email), password: String(body.password), role: "XHENVOLT_SUPER_ADMIN",
  });
  if (!created.ok) return NextResponse.json({ error: created.reason }, { status: 400 });
  await controlAudit(created.id, "setup_super_admin_created", `control_users:${created.id}`, { email: body.email }, clientIp(request));
  const res = await loginControl(String(body.email), String(body.password), clientIp(request), request.headers.get("user-agent"));
  const out = NextResponse.json({ success: true, user: { name: body.name, email: body.email, role: "XHENVOLT_SUPER_ADMIN" } });
  if (res.ok) out.cookies.set(CONTROL_COOKIE, res.token, cookieOpts);
  return out;
}

export async function DELETE(request) {
  const token = request.cookies.get(CONTROL_COOKIE)?.value;
  const user = await getControlSession(request);
  if (token) await logoutControl(token);
  if (user) await controlAudit(user.id, "logout", "session", null, clientIp(request));
  const out = NextResponse.json({ success: true });
  out.cookies.set(CONTROL_COOKIE, "", { ...cookieOpts, maxAge: 0 });
  return out;
}
