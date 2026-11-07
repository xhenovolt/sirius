import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { uploadStudentPhoto } from "@/lib/cloudinary";
import { recordAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { studentUid } = await params;
  const formData = await request.formData();
  const file = formData.get("photo");
  if (!file || typeof file.arrayBuffer !== "function" || !file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "Please choose an image smaller than 5 MB." }, { status: 400 });
  try {
    const upload = await uploadStudentPhoto(Buffer.from(await file.arrayBuffer()), studentUid);
    const [result] = await getDb().query("UPDATE students SET photo_url = ?, updated_at = CURRENT_TIMESTAMP WHERE student_uid = ? AND school_id = ?", [upload.secure_url, studentUid, session.school_id]);
    if (!result.affectedRows) return NextResponse.json({ error: "Student not found." }, { status: 404 });
    await recordAuditLog({ session, request, action: "student.photo_updated", entityType: "student", entityId: studentUid });
    return NextResponse.json({ photoUrl: upload.secure_url });
  } catch (error) {
    console.error("Student photo upload failed", error);
    return NextResponse.json({ error: "Unable to upload student photo. Please try again." }, { status: 500 });
  }
}