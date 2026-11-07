import { NextResponse } from "next/server";
import { getSession, requireSchoolAdmin } from "@/lib/auth";
import { CardTemplateError, listCardTemplates, saveCardTemplate } from "@/lib/cardTemplates";
import { recordAuditLog } from "@/lib/audit";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    return NextResponse.json({ templates: await listCardTemplates(session.school_id) });
  } catch (error) {
    console.error("Card templates load failed", error);
    return NextResponse.json({ error: "Unable to load card templates." }, { status: 503 });
  }
}

export async function POST(request) {
  const admin = await requireSchoolAdmin();
  if (!admin) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid JSON request body is required." }, { status: 400 });
  }
  try {
    const saved = await saveCardTemplate(admin.school_id, body?.name, body?.template, admin.id);
    await recordAuditLog({
      session: admin,
      request,
      action: "card_template.version_created",
      entityType: "card_template",
      entityId: saved.id,
      details: { name: saved.name, version: saved.version },
    });
    return NextResponse.json({ template: saved }, { status: 201 });
  } catch (error) {
    if (error instanceof CardTemplateError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Card template save failed", error);
    return NextResponse.json({ error: "Unable to save the card template." }, { status: 503 });
  }
}
