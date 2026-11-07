import { NextResponse } from "next/server";
import { createUser, requireSchoolAdmin, terminateUserSessions } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { queryTenant } from "@/lib/dbTenant";
import { getSchoolSettings, getUsers } from "@/lib/students";
import { recordAuditLog } from "@/lib/audit";

export async function GET() {
  const admin = await requireSchoolAdmin();
  if (!admin) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  try { return NextResponse.json({ school: await getSchoolSettings(admin.school_id), users: await getUsers(admin.school_id) }); } catch (error) { console.error("Settings load failed", error); return NextResponse.json({ error: "Unable to load settings." }, { status: 503 }); }
}

export async function PUT(request) {
  const admin = await requireSchoolAdmin();
  if (!admin) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  try {
    const body = await request.json();
    if (!body.schoolName?.trim() || body.schoolName.length > 200) return NextResponse.json({ error: "School name is required." }, { status: 400 });
    await queryTenant(admin.school_id, "UPDATE schools SET school_name = ?, school_code = ?, address = ?, contact_phone = ?, contact_email = ?, updated_at = CURRENT_TIMESTAMP WHERE school_id = ?", [body.schoolName.trim(), body.schoolCode?.trim() || null, body.address?.trim() || null, body.contactPhone?.trim() || null, body.contactEmail?.trim() || null, admin.school_id]);
    await recordAuditLog({ session: admin, request, action: "school.settings_updated", entityType: "school", entityId: admin.school_id, details: { schoolName: body.schoolName.trim() } });
    return NextResponse.json({ school: await getSchoolSettings(admin.school_id) });
  } catch (error) { console.error("Settings update failed", error); return NextResponse.json({ error: "Unable to save school settings." }, { status: 500 }); }
}

export async function PATCH(request) {
  const admin = await requireSchoolAdmin();
  if (!admin) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  try {
    const body = await request.json();
    const userId = Number(body.userId);
    if (!Number.isInteger(userId) || userId < 1 || userId === Number(admin.id)) return NextResponse.json({ error: "That user cannot be changed here." }, { status: 400 });
    // A school admin may only act on their own school's users.
    const [target] = await getDb().query("SELECT id FROM users WHERE id = ? AND school_id = ? LIMIT 1", [userId, admin.school_id]);
    if (!target[0]) return NextResponse.json({ error: "That user is not part of your school." }, { status: 404 });

    if (body.action === "logout") await terminateUserSessions(userId);
    else if (body.action === "promote" || body.action === "demote") await getDb().query("UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?", [body.action === "promote" ? "admin" : "operator", userId, admin.school_id]);
    else if (body.action === "disable" || body.action === "enable") {
      await getDb().query("UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?", [body.action === "disable" ? "disabled" : "active", userId, admin.school_id]);
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
    if (error.code === "PLAN_LIMIT_REACHED") return NextResponse.json({ error: error.message, code: error.code, limit: error.limit }, { status: error.status });
    return NextResponse.json({ error: error.code === "ER_DUP_ENTRY" ? "An account with that email already exists." : "Unable to create user account." }, { status: error.code === "ER_DUP_ENTRY" ? 409 : 500 });
  }
}
