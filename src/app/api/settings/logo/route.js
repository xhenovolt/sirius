import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { uploadSchoolLogo } from "@/lib/cloudinary";
import { recordAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  const file = (await request.formData()).get("logo");
  if (!file || typeof file.arrayBuffer !== "function" || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 3 * 1024 * 1024) return NextResponse.json({ error: "Please choose a JPG, PNG, or WebP logo smaller than 3 MB." }, { status: 400 });
  try {
    const upload = await uploadSchoolLogo(Buffer.from(await file.arrayBuffer()));
    await getDb().query("UPDATE schools SET logo_url = ?, updated_at = CURRENT_TIMESTAMP WHERE school_id = 'default'", [upload.secure_url]);
    await recordAuditLog({ session: admin, request, action: "school.logo_updated" });
    return NextResponse.json({ logoUrl: upload.secure_url });
  } catch (error) { console.error("School logo upload failed", error); return NextResponse.json({ error: "Unable to upload school logo." }, { status: 500 }); }
}