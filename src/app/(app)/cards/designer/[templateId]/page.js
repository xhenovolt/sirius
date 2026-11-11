import Link from "next/link";
import { getSession, hasSchoolPermission } from "@/lib/auth";
import { listCardTemplates } from "@/lib/cardTemplates";
import AccessDenied from "@/components/shell/AccessDenied";
import PageHeader from "@/components/shell/PageHeader";
import EmptyState from "@/components/shell/EmptyState";

export const dynamic = "force-dynamic";

export default async function CardTemplateDesignerPage({ params }) {
  const session = await getSession();
  if (!hasSchoolPermission(session, "cards.view")) return <AccessDenied />;
  const { templateId } = await params;
  let template = null;
  try {
    const templates = await listCardTemplates(session.school_id);
    template = templates.find((item) => item.id === String(templateId)) || null;
  } catch (error) {
    console.error("Card template lookup failed", error);
  }
  if (!template) {
    return <main className="dashboard cards-page"><EmptyState title="Template not found." actionHref="/cards/designer" actionLabel="Back to the designer">This template does not exist in your school.</EmptyState></main>;
  }
  return (
    <main className="dashboard cards-page">
      <PageHeader eyebrow="Card production" title={template.name} intro={`Version ${template.version}. The WYSIWYG editing surface arrives in Phase 3.`} />
      <Link className="back-link" href="/cards/designer">← Back to the designer</Link>
      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Template details</p><h2>Read-only summary</h2></div></div>
        <div className="profile-details">
          <div><small>Name</small><strong>{template.name}</strong></div>
          <div><small>Version</small><strong>{template.version}</strong></div>
          <div><small>Created</small><strong>{template.createdAt ? new Date(template.createdAt).toLocaleString() : "Unknown"}</strong></div>
        </div>
        <p className="settings-help">This template is currently managed by the card generator. The drag-and-drop designer, live preview and publishing workflow are delivered in the designer phases.</p>
      </section>
    </main>
  );
}