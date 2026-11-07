import { NextResponse } from "next/server";
import { createUser, requireSchoolAdmin, terminateUserSessions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getSchoolSettings, getUsers } from "@/lib/students";
import { recordAuditLog } from "@/lib/audit";

export async function GET() {
  if (!(await requireSchoolAdmin())) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  try { return NextResponse.json({ school: await getSchoolSettings(), users: await getUsers() }); } catch (error) { console.error("Settings load failed", error); return NextResponse.json({ error: "Unable to load settings." }, { status: 503 }); }
}

export async function PUT(request) {
  const admin = await requireSchoolAdmin();
  if (!admin) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  try {
    const body = await request.json();
    if (!body.schoolName?.trim() || body.schoolName.length > 200) return NextResponse.json({ error: "School name is required." }, { status: 400 });
    await getDb().query("UPDATE schools SET school_name = ?, school_code = ?, address = ?, contact_phone = ?, contact_email = ?, updated_at = CURRENT_TIMESTAMP WHERE school_id = 'default'", [body.schoolName.trim(), body.schoolCode?.trim() || null, body.address?.trim() || null, body.contactPhone?.trim() || null, body.contactEmail?.trim() || null]);
    await recordAuditLog({ session: admin, request, action: "school.settings_updated", entityType: "school", entityId: "default", details: { schoolName: body.schoolName.trim() } });
    return NextResponse.json({ school: await getSchoolSettings() });
  } catch (error) { console.error("Settings update failed", error); return NextResponse.json({ error: "Unable to save school settings." }, { status: 500 }); }
}

export async function PATCH(request) {
  const admin = await requireSchoolAdmin();
  if (!admin) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  try {
    const body = await request.json();
    const userId = Number(body.userId);
    if (!Number.isInteger(userId) || userId < 1 || userId === Number(admin.id)) return NextResponse.json({ error: "That user cannot be changed here." }, { status: 400 });
    if (body.action === "logout") await terminateUserSessions(userId);
    else if (body.action === "promote" || body.action === "demote") await getDb().query("UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [body.action === "promote" ? "admin" : "operator", userId]);
    else if (body.action === "disable" || body.action === "enable") {
      await getDb().query("UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [body.action === "disable" ? "disabled" : "active", userId]);
      if (body.action === "disable") await terminateUserSessions(userId);
    } else return NextResponse.json({ error: "Unknown user action." }, { status: 400 });
    await recordAuditLog({ session: admin, request, action: `user.${body.action}`, entityType: "user", entityId: String(userId) });
    return NextResponse.json({ ok: true });
  } catch (error) { console.error("User action failed", error); return NextResponse.json({ error: "Unable to update user access." }, { status: 500 }); }
}

export async function POST(request) {
  const admin = await requireSchoolAdmin();
  if (!admin) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  try {
    const body = await request.json();
    if (!body.displayName?.trim() || !body.email?.trim() || !body.password || body.password.length < 12) return NextResponse.json({ error: "Name, email, and a password of at least 12 characters are required." }, { status: 400 });
    const role = body.role === "admin" ? "admin" : "operator";
    await createUser({ schoolId: admin.school_id, email: body.email.trim(), password: body.password, displayName: body.displayName.trim(), phone: body.phone?.trim() || "", roleSlug: role, createdBy: admin.id });
    await recordAuditLog({ session: admin, request, action: "user.created", entityType: "user", entityId: body.email.trim(), details: { role } });
    return NextResponse.json({ created: true }, { status: 201 });
  } catch (error) {
    console.error("Admin user creation failed", error);
    return NextResponse.json({ error: error.code === "ER_DUP_ENTRY" ? "An account with that email already exists." : "Unable to create user account." }, { status: error.code === "ER_DUP_ENTRY" ? 409 : 500 });
  }
}