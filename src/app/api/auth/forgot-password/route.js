import { NextResponse } from "next/server";
import { requestPasswordReset, resetPassword } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";

export async function POST(request) {
  try {
    const body = await request.json();
    if (body.action === "request") {
      if (!body.identifier) return NextResponse.json({ error: "Enter your email or phone number." }, { status: 400 });
      await requestPasswordReset(body.identifier);
      await recordAuditLog({ request, action: "password_reset.requested", entityType: "user", entityId: body.identifier });
      return NextResponse.json({ sent: true, message: "If an account matches, a reset code has been sent by SMS." });
    }
    if (!body.identifier || !/^\d{6}$/.test(String(body.code || "")) || !body.password || body.password.length < 12) return NextResponse.json({ error: "Enter the six-digit code and a password of at least 12 characters." }, { status: 400 });
    if (!(await resetPassword(body.identifier, body.code, body.password))) return NextResponse.json({ error: "Invalid or expired reset code." }, { status: 400 });
    await recordAuditLog({ request, action: "password_reset.completed", entityType: "user", entityId: body.identifier });
    return NextResponse.json({ reset: true });
  } catch (error) {
    console.error("Password reset failed", error);
    return NextResponse.json({ error: "Unable to process password reset. Please try again." }, { status: 503 });
  }
}