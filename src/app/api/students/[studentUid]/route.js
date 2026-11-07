import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getStudentByUid, StudentInputError, updateStudent } from "@/lib/students";

export async function GET(request, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { studentUid } = await params;
  if (!/^SIRIUS-[A-Z0-9-]{3,64}$/i.test(studentUid)) return NextResponse.json({ error: "Invalid Sirius code." }, { status: 400 });

  try {
    const student = await getStudentByUid(session.school_id, studentUid);
    return student ? NextResponse.json({ student }) : NextResponse.json({ error: "Student not found." }, { status: 404 });
  } catch (error) {
    console.error("Scanned student lookup failed", error);
    return NextResponse.json({ error: "Unable to connect to student records. Please try again." }, { status: 503 });
  }
}

export async function PATCH(request, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { studentUid } = await params;
  if (!/^SIRIUS-[A-Z0-9-]{3,64}$/i.test(studentUid)) return NextResponse.json({ error: "Invalid Sirius code." }, { status: 400 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid JSON request body is required." }, { status: 400 });
  }
  const { version, ...changes } = body || {};

  try {
    const updated = await updateStudent(session.school_id, studentUid, changes, version, session, request);
    return NextResponse.json({ version: updated.version });
  } catch (error) {
    if (error instanceof StudentInputError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error?.code === "ER_DUP_ENTRY") return NextResponse.json({ error: "That student account number is already in use at this school." }, { status: 409 });
    console.error("Student update failed", error);
    return NextResponse.json({ error: "Unable to update the student record. Please try again." }, { status: 503 });
  }
}
