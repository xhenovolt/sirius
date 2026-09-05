import { NextResponse } from "next/server";
import { destroySession, getSession } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";

export async function POST(request) {
  try {
    const session = await getSession();
    await destroySession();
    if (session) await recordAuditLog({ session, request, action: "logout", entityType: "user", entityId: String(session.id) });
  } catch (error) { console.error("Logout failed", error); }
  return NextResponse.json({ ok: true });
}