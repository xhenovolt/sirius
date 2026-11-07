import { NextResponse } from "next/server";
import { requireSchoolAdmin } from "@/lib/auth";
import { listAuditLogs } from "@/lib/audit";

export async function GET() {
  if (!(await requireSchoolAdmin())) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  try {
    return NextResponse.json({ logs: await listAuditLogs(200) });
  } catch (error) {
    console.error("Audit log load failed", error);
    return NextResponse.json({ error: "Unable to load audit logs." }, { status: 503 });
  }
}
