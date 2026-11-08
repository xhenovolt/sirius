import { NextResponse } from "next/server";
import { requireSchoolPermission } from "@/lib/auth";
import { listAuditLogs } from "@/lib/audit";

export async function GET() {
  const admin = await requireSchoolPermission("audit.view");
  if (!admin) return NextResponse.json({ error: "Permission to view the audit log is required." }, { status: 403 });
  try {
    return NextResponse.json({ logs: await listAuditLogs(admin.school_id, 200) });
  } catch (error) {
    console.error("Audit log load failed", error);
    return NextResponse.json({ error: "Unable to load audit logs." }, { status: 503 });
  }
}
