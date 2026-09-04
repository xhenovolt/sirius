import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getStudentByUid } from "@/lib/students";

export async function GET(request, { params }) {
  if (!(await getSession())) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { studentUid } = await params;
  if (!/^SIRIUS-[A-Z0-9-]{3,64}$/i.test(studentUid)) return NextResponse.json({ error: "Invalid Sirius code." }, { status: 400 });

  try {
    const student = await getStudentByUid(studentUid);
    return student ? NextResponse.json({ student }) : NextResponse.json({ error: "Student not found." }, { status: 404 });
  } catch (error) {
    console.error("Scanned student lookup failed", error);
    return NextResponse.json({ error: "Unable to connect to student records. Please try again." }, { status: 503 });
  }
}