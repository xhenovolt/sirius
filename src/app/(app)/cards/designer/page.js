import { getSession, hasSchoolPermission } from "@/lib/auth";
import { listCardTemplates } from "@/lib/cardTemplates";
import { getSchoolSettings } from "@/lib/students";
import QrCards from "../QrCards";
import AccessDenied from "@/components/shell/AccessDenied";
import PageHeader from "@/components/shell/PageHeader";
import EmptyState from "@/components/shell/EmptyState";

export const dynamic = "force-dynamic";

export default async function CardDesignerPage() {
  const session = await getSession();
  if (!hasSchoolPermission(session, "cards.view")) return <AccessDenied />;
  let templates = [];
  let school = null;
  let loadError = false;
  try {
    [templates, school] = await Promise.all([
      listCardTemplates(session.school_id),
      getSchoolSettings(session.school_id),
    ]);
  } catch (error) {
    console.error("Card templates load failed", error);
    loadError = true;
  }
  return (
    <main className="dashboard cards-page">
      <PageHeader eyebrow="Card production" title="Card designer" intro="Create and position every card component. Saving creates a new immutable template version." />
      {loadError
        ? <EmptyState title="Unable to load the card designer.">Please check the database connection and try again.</EmptyState>
        : <QrCards students={[]} school={school} templates={templates} canManage={hasSchoolPermission(session, "cards.manage")} />}
    </main>
  );
}