import { NextResponse } from "next/server";
import { signUpSchool } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";

export async function POST(request) {
  try {
    const { schoolName, email, password, displayName, phone } = await request.json();
    if (!schoolName?.trim() || !displayName || !email || !phone || !password || password.length < 12) return NextResponse.json({ error: "School name, your name, email, phone, and a password of at least 12 characters are required." }, { status: 400 });
    const { schoolId, userId } = await signUpSchool({ schoolName: schoolName.trim(), email, password, displayName, phone }, request);
    await recordAuditLog({ session: { school_id: schoolId, id: userId, email }, request, action: "signup", entityType: "user", entityId: email, details: { email, displayName } });
    return NextResponse.json({ created: true }, { status: 201 });
  } catch (error) {
    console.error("Signup failed", error);
    return NextResponse.json({ error: error.code === "ER_DUP_ENTRY" ? "An account with that email already exists." : error.message === "Use a valid Uganda mobile number." ? error.message : "Unable to create your account." }, { status: error.code === "ER_DUP_ENTRY" ? 409 : 400 });
  }
}