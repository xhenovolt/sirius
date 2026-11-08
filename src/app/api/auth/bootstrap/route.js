import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Platform bootstrap is disabled. Create a school through the signup page." },
    { status: 410 },
  );
}
