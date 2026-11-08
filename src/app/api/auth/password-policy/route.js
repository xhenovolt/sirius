import { NextResponse } from "next/server";
import { getSchoolPasswordPolicy } from "@/lib/control/platform-settings";

export async function GET() {
  return NextResponse.json({ policy: await getSchoolPasswordPolicy() });
}
