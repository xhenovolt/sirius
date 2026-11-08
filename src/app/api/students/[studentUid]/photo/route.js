import { NextResponse } from "next/server";
import { requireSchoolPermission } from "@/lib/auth";
import { uploadStudentPhoto } from "@/lib/cloudinary";
import { updateStudentPhoto } from "@/lib/students";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  const session = await requireSchoolPermission("students.manage");
  if (!session) return NextResponse.json({ error: "Permission to manage student records is required." }, { status: 403 });
  const { studentUid } = await params;
  const formData = await request.formData();
  const file = formData.get("photo");
  if (!file || typeof file.arrayBuffer !== "function" || !file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "Please choose an image smaller than 5 MB." }, { status: 400 });
  try {
    const upload = await uploadStudentPhoto(Buffer.from(await file.arrayBuffer()), studentUid);
    const updated = await updateStudentPhoto(session.school_id, studentUid, upload.secure_url, session, request);
    if (!updated) return NextResponse.json({ error: "Student not found." }, { status: 404 });
    return NextResponse.json({ photoUrl: upload.secure_url });
  } catch (error) {
    console.error("Student photo upload failed", error);
    return NextResponse.json({ error: "Unable to upload student photo. Please try again." }, { status: 500 });
  }
}