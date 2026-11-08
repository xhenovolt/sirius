import { NextResponse } from "next/server";
import { createStudent, searchStudents, StudentInputError } from "@/lib/students";
import { requireSchoolPermission } from "@/lib/auth";

export async function GET(request) {
  const session = await requireSchoolPermission("students.view");
  if (!session) return NextResponse.json({ error: "Permission to view student records is required." }, { status: 403 });
  const search = request.nextUrl.searchParams.get("search") || "";

  if (search.length > 100) {
    return NextResponse.json({ error: "Search query is too long." }, { status: 400 });
  }
  try {
    return NextResponse.json({ students: await searchStudents(session.school_id, search) });
  } catch (error) {
    console.error("Student search failed", error);
    return NextResponse.json({ error: "Unable to connect to student records. Please try again." }, { status: 503 });
  }
}

export async function POST(request) {
  const session = await requireSchoolPermission("students.manage");
  if (!session) return NextResponse.json({ error: "Permission to manage student records is required." }, { status: 403 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid JSON request body is required." }, { status: 400 });
  }

  try {
    const created = await createStudent(session.school_id, body, session, request);
    return NextResponse.json({ studentUid: created.studentUid }, { status: 201 });
  } catch (error) {
    if (error instanceof StudentInputError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error?.code === "ER_DUP_ENTRY") return NextResponse.json({ error: "That student account number is already in use at this school." }, { status: 409 });
    console.error("Student creation failed", error);
    return NextResponse.json({ error: "Unable to create the student record. Please try again." }, { status: 503 });
  }
}
