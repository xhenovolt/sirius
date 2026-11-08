import { NextResponse } from "next/server";
import { createUser, requireSchoolAdmin } from "@/lib/auth";
import { queryTenant } from "@/lib/dbTenant";
import { getSchoolSettings, getUsers } from "@/lib/students";
import { recordAuditLog } from "@/lib/audit";
import { ASSIGNABLE_ROLES, performSchoolUserAction } from "@/lib/schoolUsers";
import { normalizeUgandaPhone } from "@/lib/passwordResetIdentity";

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
    if (body.currentTerm != null && (typeof body.currentTerm !== "string" || body.currentTerm.trim().length > 64)) {
      return NextResponse.json({ error: "Current term must be 64 characters or fewer." }, { status: 400 });
    }
    await queryTenant(admin.school_id, "UPDATE schools SET school_name = ?, school_code = ?, address = ?, contact_phone = ?, contact_email = ?, current_term = ?, updated_at = CURRENT_TIMESTAMP WHERE school_id = ?", [body.schoolName.trim(), body.schoolCode?.trim() || null, body.address?.trim() || null, body.contactPhone?.trim() || null, body.contactEmail?.trim() || null, body.currentTerm?.trim() || null, admin.school_id]);
    await recordAuditLog({ session: admin, request, action: "school.settings_updated", entityType: "school", entityId: admin.school_id, details: { schoolName: body.schoolName.trim(), currentTerm: body.currentTerm?.trim() || null } });
    return NextResponse.json({ school: await getSchoolSettings(admin.school_id) });
  } catch (error) { console.error("Settings update failed", error); return NextResponse.json({ error: "Unable to save school settings." }, { status: 500 }); }
}

export async function PATCH(request) {
  const admin = await requireSchoolAdmin();
  if (!admin) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  try {
    const body = await request.json();
    const userId = Number(body.userId);
    const result = await performSchoolUserAction({
      schoolId: admin.school_id,
      actorId: admin.id,
      actorIsSuperAdmin: admin.isSuperAdmin,
      userId,
      action: body.action,
      values: body,
    });
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
    await recordAuditLog({
      session: admin,
      request,
      action: `user.${body.action}`,
      entityType: "user",
      entityId: String(userId),
      details: body.action === "edit"
        ? { fields: ["displayName", "phone"] }
        : body.action === "set_role" ? { role: body.role } : null,
    });
    return NextResponse.json({ ok: true });
  } catch (error) { console.error("User action failed", error); return NextResponse.json({ error: "Unable to update user access." }, { status: 500 }); }
}

export async function POST(request) {
  const admin = await requireSchoolAdmin();
  if (!admin) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  try {
    const body = await request.json();
    if (typeof body.displayName !== "string" || !body.displayName.trim() || body.displayName.trim().length > 150
      || typeof body.email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email.trim())
      || typeof body.password !== "string" || !body.password
      || typeof body.phone !== "string" || !normalizeUgandaPhone(body.phone)) {
      return NextResponse.json({ error: "A valid name, email, Uganda mobile number, and password are required." }, { status: 400 });
    }
    const role = body.role == null ? "operator" : body.role;
    if (typeof role !== "string" || !ASSIGNABLE_ROLES.has(role)) {
      return NextResponse.json({ error: "Choose a valid school role." }, { status: 400 });
    }
    if (role === "superadmin" && !admin.isSuperAdmin) {
      return NextResponse.json({ error: "Only a school SuperAdmin can create another SuperAdmin." }, { status: 403 });
    }
    if (!admin.isSuperAdmin && !["admin", "operator"].includes(role)) {
      return NextResponse.json({ error: "Only a school SuperAdmin can assign that role." }, { status: 403 });
    }
    await createUser({ schoolId: admin.school_id, email: body.email.trim(), password: body.password, displayName: body.displayName.trim(), phone: body.phone?.trim() || "", roleSlug: role, createdBy: admin.id });
    await recordAuditLog({ session: admin, request, action: "user.created", entityType: "user", entityId: body.email.trim(), details: { role } });
    return NextResponse.json({ created: true }, { status: 201 });
  } catch (error) {
    console.error("Admin user creation failed", error);
    if (error.code === "PLAN_LIMIT_REACHED") return NextResponse.json({ error: error.message, code: error.code, limit: error.limit }, { status: error.status });
    if (error.code === "INVALID_USER_PHONE") return NextResponse.json({ error: error.message }, { status: 400 });
    if (error.code === "INVALID_SCHOOL_PASSWORD") return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: error.code === "ER_DUP_ENTRY" ? "An account with that email already exists." : "Unable to create user account." }, { status: error.code === "ER_DUP_ENTRY" ? 409 : 500 });
  }
}
