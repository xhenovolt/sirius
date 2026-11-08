import { NextResponse } from "next/server";
import { requireSchoolAdmin } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { createSchoolRole, deleteSchoolRole, listSchoolRoles, updateSchoolRole } from "@/lib/schoolRoles";
import { SCHOOL_PERMISSION_CATALOG } from "@/lib/schoolPermissions";

async function requireSuperAdmin() {
  const admin = await requireSchoolAdmin();
  if (!admin) return { error: NextResponse.json({ error: "Administrator access required." }, { status: 403 }) };
  if (!admin.isSuperAdmin) return { error: NextResponse.json({ error: "School SuperAdmin access required." }, { status: 403 }) };
  return { admin };
}

export async function GET() {
  const { admin, error } = await requireSuperAdmin();
  if (error) return error;
  try {
    return NextResponse.json({
      roles: await listSchoolRoles(admin.school_id),
      permissions: SCHOOL_PERMISSION_CATALOG,
    });
  } catch (loadError) {
    console.error("School roles load failed", loadError);
    return NextResponse.json({ error: "Unable to load school roles." }, { status: 503 });
  }
}

export async function POST(request) {
  const { admin, error } = await requireSuperAdmin();
  if (error) return error;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "A valid JSON request body is required." }, { status: 400 });
  }
  try {
    const result = await createSchoolRole(admin.school_id, body);
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
    await recordAuditLog({
      session: admin,
      request,
      action: "school_role.created",
      entityType: "role",
      entityId: String(result.id),
      details: { name: body.name, slug: result.slug, permissions: result.permissions },
    });
    return NextResponse.json({ role: result }, { status: 201 });
  } catch (saveError) {
    console.error("School role creation failed", saveError);
    return NextResponse.json({ error: "Unable to create the school role." }, { status: 503 });
  }
}

export async function PATCH(request) {
  const { admin, error } = await requireSuperAdmin();
  if (error) return error;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "A valid JSON request body is required." }, { status: 400 });
  }
  try {
    const result = await updateSchoolRole(admin.school_id, body);
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
    await recordAuditLog({
      session: admin,
      request,
      action: "school_role.updated",
      entityType: "role",
      entityId: String(result.id),
      details: { name: body.name, slug: result.slug, permissions: result.permissions },
    });
    return NextResponse.json({ role: result });
  } catch (saveError) {
    console.error("School role update failed", saveError);
    return NextResponse.json({ error: "Unable to update the school role." }, { status: 503 });
  }
}

export async function DELETE(request) {
  const { admin, error } = await requireSuperAdmin();
  if (error) return error;
  const body = await request.json().catch(() => null);
  const id = Number(body?.id);
  try {
    const result = await deleteSchoolRole(admin.school_id, id);
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
    await recordAuditLog({
      session: admin,
      request,
      action: "school_role.deleted",
      entityType: "role",
      entityId: String(id),
    });
    return NextResponse.json({ deleted: true });
  } catch (deleteError) {
    console.error("School role deletion failed", deleteError);
    return NextResponse.json({ error: "Unable to delete the school role." }, { status: 503 });
  }
}
