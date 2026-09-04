import { NextResponse } from "next/server";
import { createUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function POST(request) {
  try {
    const { email, password, displayName, adminSecret } = await request.json();
    if (!process.env.ADMIN_SECRET || adminSecret !== process.env.ADMIN_SECRET) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    if (!email || !password || !displayName || password.length < 12) return NextResponse.json({ error: "A name, email, and password of at least 12 characters are required." }, { status: 400 });
    const [[count]] = await getDb().query("SELECT COUNT(*) AS count FROM users");
    if (Number(count.count) > 0) return NextResponse.json({ error: "Initial administrator already exists." }, { status: 409 });
    await createUser(email, password, displayName, "");
    return NextResponse.json({ created: true }, { status: 201 });
  } catch (error) {
    console.error("Auth bootstrap failed", error);
    return NextResponse.json({ error: "Unable to create administrator." }, { status: 500 });
  }
}