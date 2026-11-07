import { NextResponse } from "next/server";
import { requireSchoolAdmin } from "@/lib/auth";
import { queryTenant } from "@/lib/dbTenant";
import { recordAuditLog } from "@/lib/audit";

function isDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function GET() {
  const admin = await requireSchoolAdmin();
  if (!admin) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  try {
    const [rules] = await queryTenant(
      admin.school_id,
      `SELECT id, threshold, class_name, term, expires_at, created_at
         FROM clearance_threshold_rules
        WHERE school_id = ? AND is_active = 1
        ORDER BY created_at DESC, id DESC`,
      [admin.school_id],
    );
    return NextResponse.json({ rules });
  } catch (error) {
    console.error("Clearance rules load failed", error);
    return NextResponse.json({ error: "Unable to load clearance rules." }, { status: 503 });
  }
}

export async function POST(request) {
  const admin = await requireSchoolAdmin();
  if (!admin) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  const body = await readBody(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "A valid JSON request body is required." }, { status: 400 });
  }
  const threshold = String(body.threshold ?? "").trim();
  if ((body.className != null && typeof body.className !== "string")
    || (body.term != null && typeof body.term !== "string")) {
    return NextResponse.json({ error: "Class and term scopes must be text." }, { status: 400 });
  }
  const className = body.className == null ? "" : String(body.className).trim();
  const term = body.term == null ? "" : String(body.term).trim();
  const expiresAt = body.expiresAt || null;
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(threshold)) {
    return NextResponse.json({ error: "Threshold must be a non-negative amount with up to two decimal places." }, { status: 400 });
  }
  if (className.length > 64 || term.length > 64) {
    return NextResponse.json({ error: "Class and term scopes must be 64 characters or fewer." }, { status: 400 });
  }
  if (expiresAt !== null && !isDate(expiresAt)) {
    return NextResponse.json({ error: "Expiry must be a valid calendar date." }, { status: 400 });
  }
  try {
    const [result] = await queryTenant(
      admin.school_id,
      `INSERT INTO clearance_threshold_rules
        (school_id, threshold, class_name, term, expires_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [admin.school_id, threshold, className || null, term || null, expiresAt, admin.id],
    );
    await recordAuditLog({
      session: admin,
      request,
      action: "clearance.threshold_created",
      entityType: "clearance_threshold",
      entityId: String(result.insertId),
      details: { threshold, className: className || null, term: term || null, expiresAt },
    });
    return NextResponse.json({ created: true }, { status: 201 });
  } catch (error) {
    console.error("Clearance rule creation failed", error);
    return NextResponse.json({ error: "Unable to create the clearance rule." }, { status: 503 });
  }
}

export async function DELETE(request) {
  const admin = await requireSchoolAdmin();
  if (!admin) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  const body = await readBody(request);
  const id = String(body?.id ?? "");
  if (!/^\d+$/.test(id) || id === "0") {
    return NextResponse.json({ error: "A valid clearance rule id is required." }, { status: 400 });
  }
  try {
    const [result] = await queryTenant(
      admin.school_id,
      `UPDATE clearance_threshold_rules
          SET is_active = 0, updated_at = CURRENT_TIMESTAMP
        WHERE school_id = ? AND id = ? AND is_active = 1`,
      [admin.school_id, id],
    );
    if (result.affectedRows !== 1) return NextResponse.json({ error: "Clearance rule not found." }, { status: 404 });
    await recordAuditLog({
      session: admin,
      request,
      action: "clearance.threshold_removed",
      entityType: "clearance_threshold",
      entityId: id,
    });
    return NextResponse.json({ removed: true });
  } catch (error) {
    console.error("Clearance rule removal failed", error);
    return NextResponse.json({ error: "Unable to remove the clearance rule." }, { status: 503 });
  }
}
