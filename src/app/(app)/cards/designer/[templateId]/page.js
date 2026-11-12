import { getSession, hasSchoolPermission } from "@/lib/auth";
import { listCardTemplates } from "@/lib/cardTemplates";
import { getSchoolSettings } from "@/lib/students";
import QrCards from "../../QrCards";
import AccessDenied from "@/components/shell/AccessDenied";
import PageHeader from "@/components/shell/PageHeader";
import EmptyState from "@/components/shell/EmptyState";

export const dynamic = "force-dynamic";

export default async function CardTemplateDesignerPage({ params }) {
  const session = await getSession();
  if (!hasSchoolPermission(session, "cards.view")) return <AccessDenied />;
  const { templateId } = await params;
  let template = null;
  let templates = [];
  let school = null;
  let loadError = false;
  try {
    [templates, school] = await Promise.all([
      listCardTemplates(session.school_id),
      getSchoolSettings(session.school_id),
    ]);
    template = templates.find((item) => item.id === String(templateId)) || null;
  } catch (error) {
    console.error("Card template lookup failed", error);
    loadError = true;
  }
  if (loadError) {
    return <main className="dashboard cards-page"><EmptyState title="Unable to load this template.">Please check the database connection and try again.</EmptyState></main>;
  }
  if (!template) {
    return <main className="dashboard cards-page"><EmptyState title="Template not found." actionHref="/cards/designer" actionLabel="Back to the designer">This template does not exist in your school.</EmptyState></main>;
  }
  return (
    <main className="dashboard cards-page">
      <PageHeader eyebrow="Card production" title={template.name} intro={`Editing version ${template.version}. Saving creates an immutable next version.`} />
      <QrCards students={[]} school={school} templates={templates} canManage={hasSchoolPermission(session, "cards.manage")} selectedTemplateId={template.id} />
    </main>
  );
}