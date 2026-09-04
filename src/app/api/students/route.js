import { NextResponse } from "next/server";
import { searchStudents } from "@/lib/students";
import { getSession } from "@/lib/auth";

export async function GET(request) {
  if (!(await getSession())) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const search = request.nextUrl.searchParams.get("search") || "";

  if (search.length > 100) {
    return NextResponse.json({ error: "Search query is too long." }, { status: 400 });
  }

  try {
    return NextResponse.json({ students: await searchStudents(search) });
  } catch (error) {
    console.error("Student search failed", error);
    return NextResponse.json({ error: "Unable to connect to student records. Please try again." }, { status: 503 });
  }
}