import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";

export async function POST(request) {
  try {
    const { email, password } = await request.json();
    if (typeof email !== "string" || typeof password !== "string" || !email || !password) return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    const user = await authenticate(email, password);
    if (!user) return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    return NextResponse.json({ user });
  } catch (error) {
    console.error("Login failed", error);
    return NextResponse.json({ error: "Unable to sign in. Please try again." }, { status: 503 });
  }
}