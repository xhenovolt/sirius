import { getSchoolSettings } from "@/lib/students";
import { getStudentsForClearanceCards } from "@/lib/clearance";
import { listCardTemplates } from "@/lib/cardTemplates";
import { getSession, hasSchoolPermission } from "@/lib/auth";
import AccessDenied from "@/components/shell/AccessDenied";
import PageHeader from "@/components/shell/PageHeader";
import CardPreviewClient from "./CardPreviewClient";

export const dynamic = "force-dynamic";

export default async function CardPreviewPage() {
  const session = await getSession();
  if (!hasSchoolPermission(session, "cards.view")) return <AccessDenied />;
  let templates = [];
  let students = [];
  let school = null;
  let loadError = false;
  try {
    [templates, students, school] = await Promise.all([
      listCardTemplates(session.school_id),
      getStudentsForClearanceCards(session.school_id),
      getSchoolSettings(session.school_id),
    ]);
  } catch (error) {
    console.error("Card preview data load failed", {
      errorClass: error instanceof Error ? error.constructor.name : typeof error,
      errorCode: typeof error?.code === "string" ? error.code : null,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    loadError = true;
  }
  return (
    <main className="dashboard cards-page">
      <PageHeader eyebrow="Card production" title="Card preview" intro="Render a saved template against a real student record before printing." />
      {loadError
        ? <div className="empty-state"><strong>Unable to load card previews.</strong><p>Check the database connection and confirm the latest database migrations are applied.</p></div>
        : <CardPreviewClient templates={templates} students={students} school={school} />}
    </main>
  );
}