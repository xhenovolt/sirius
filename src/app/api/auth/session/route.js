import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getSession();
    return NextResponse.json({ user }, { status: user ? 200 : 401 });
  } catch (error) {
    console.error("Session lookup failed", error);
    return NextResponse.json({ error: "Unable to verify session." }, { status: 503 });
  }
}