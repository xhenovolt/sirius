import { NextResponse } from "next/server";
import { requireSchoolAdmin } from "@/lib/auth";
import { kampalaDate } from "@/lib/clearance";
import { queryTenant, queryTenantOne, withTenantTransaction } from "@/lib/dbTenant";
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

async function findStudent(schoolId, studentUid) {
  return queryTenantOne(
    schoolId,
    "SELECT id, student_uid FROM students WHERE school_id = ? AND student_uid = ? AND status = 'active' LIMIT 1",
    [schoolId, studentUid],
  );
}

export async function GET(request, { params }) {
  const admin = await requireSchoolAdmin();
  if (!admin) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  const { studentUid } = await params;
  try {
    const student = await findStudent(admin.school_id, studentUid);
    if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });
    const [allowances] = await queryTenant(
      admin.school_id,
      `SELECT id, allowed_until, reason, granted_at
         FROM clearance_allowances
        WHERE school_id = ? AND student_id = ? AND revoked_at IS NULL
          AND allowed_until >= ?
        ORDER BY allowed_until DESC, granted_at DESC`,
      [admin.school_id, student.id, kampalaDate()],
    );
    return NextResponse.json({ allowances });
  } catch (error) {
    console.error("Clearance allowance load failed", error);
    return NextResponse.json({ error: "Unable to load clearance allowances." }, { status: 503 });
  }
}

export async function POST(request, { params }) {
  const admin = await requireSchoolAdmin();
  if (!admin) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  const { studentUid } = await params;
  const body = await readBody(request);
  const allowedUntil = body?.allowedUntil;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!isDate(allowedUntil) || allowedUntil < kampalaDate()) {
    return NextResponse.json({ error: "Allowance expiry must be today or a future date." }, { status: 400 });
  }
  if (!reason || reason.length > 500) {
    return NextResponse.json({ error: "A reason of 1 to 500 characters is required." }, { status: 400 });
  }
  try {
    const student = await findStudent(admin.school_id, studentUid);
    if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });
    const allowanceId = await withTenantTransaction(admin.school_id, async (scoped) => {
      const [lockedStudents] = await scoped.query(
        "SELECT id FROM students WHERE school_id = ? AND id = ? AND status = 'active' FOR UPDATE",
        [admin.school_id, student.id],
      );
      if (!lockedStudents.length) return null;
      await scoped.query(
        `UPDATE clearance_allowances
            SET revoked_at = CURRENT_TIMESTAMP
          WHERE school_id = ? AND student_id = ? AND revoked_at IS NULL`,
        [admin.school_id, student.id],
      );
      const [result] = await scoped.query(
        `INSERT INTO clearance_allowances
          (school_id, student_id, allowed_until, reason, granted_by)
         VALUES (?, ?, ?, ?, ?)`,
        [admin.school_id, student.id, allowedUntil, reason, admin.id],
      );
      return String(result.insertId);
    });
    if (!allowanceId) return NextResponse.json({ error: "Student not found." }, { status: 404 });
    await recordAuditLog({
      session: admin,
      request,
      action: "clearance.allowance_granted",
      entityType: "student",
      entityId: studentUid,
      details: { allowanceId, allowedUntil, reason },
    });
    return NextResponse.json({ granted: true }, { status: 201 });
  } catch (error) {
    console.error("Clearance allowance grant failed", error);
    return NextResponse.json({ error: "Unable to grant the clearance allowance." }, { status: 503 });
  }
}

export async function DELETE(request, { params }) {
  const admin = await requireSchoolAdmin();
  if (!admin) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  const { studentUid } = await params;
  const body = await readBody(request);
  const allowanceId = String(body?.allowanceId ?? "");
  if (!/^\d+$/.test(allowanceId) || allowanceId === "0") {
    return NextResponse.json({ error: "A valid allowance id is required." }, { status: 400 });
  }
  try {
    const student = await findStudent(admin.school_id, studentUid);
    if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });
    const [result] = await queryTenant(
      admin.school_id,
      `UPDATE clearance_allowances
          SET revoked_at = CURRENT_TIMESTAMP
        WHERE school_id = ? AND student_id = ? AND id = ? AND revoked_at IS NULL`,
      [admin.school_id, student.id, allowanceId],
    );
    if (result.affectedRows !== 1) return NextResponse.json({ error: "Clearance allowance not found." }, { status: 404 });
    await recordAuditLog({
      session: admin,
      request,
      action: "clearance.allowance_revoked",
      entityType: "student",
      entityId: studentUid,
      details: { allowanceId },
    });
    return NextResponse.json({ revoked: true });
  } catch (error) {
    console.error("Clearance allowance revoke failed", error);
    return NextResponse.json({ error: "Unable to revoke the clearance allowance." }, { status: 503 });
  }
}
