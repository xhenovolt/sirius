import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";

export async function POST(request) {
  try {
    const { email, password } = await request.json();
    if (typeof email !== "string" || typeof password !== "string" || !email || !password) return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    const user = await authenticate(email, password);
    if (!user) {
      await recordAuditLog({ request, action: "login.failed", entityType: "user", entityId: email, details: { email } });
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }
    await recordAuditLog({ session: user, request, action: "login.success", entityType: "user", entityId: String(user.id) });
    return NextResponse.json({ user });
  } catch (error) {
    console.error("Login failed", error);
    return NextResponse.json({ error: "Unable to sign in. Please try again." }, { status: 503 });
  }
}