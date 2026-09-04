import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

export async function POST() {
  try { await destroySession(); } catch (error) { console.error("Logout failed", error); }
  return NextResponse.json({ ok: true });
}