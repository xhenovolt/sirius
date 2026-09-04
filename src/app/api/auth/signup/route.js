import { NextResponse } from "next/server";
import { signUp } from "@/lib/auth";

export async function POST(request) {
  try {
    const { email, password, displayName, phone } = await request.json();
    if (!displayName || !email || !phone || !password || password.length < 12) return NextResponse.json({ error: "Name, email, phone, and a password of at least 12 characters are required." }, { status: 400 });
    await signUp(email, password, displayName, phone);
    return NextResponse.json({ created: true }, { status: 201 });
  } catch (error) {
    console.error("Signup failed", error);
    return NextResponse.json({ error: error.code === "ER_DUP_ENTRY" ? "An account with that email already exists." : error.message === "Use a valid Uganda mobile number." ? error.message : "Unable to create your account." }, { status: error.code === "ER_DUP_ENTRY" ? 409 : 400 });
  }
}