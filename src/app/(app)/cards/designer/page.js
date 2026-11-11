import Link from "next/link";
import { getSession, hasSchoolPermission } from "@/lib/auth";
import { listCardTemplates } from "@/lib/cardTemplates";
import AccessDenied from "@/components/shell/AccessDenied";
import PageHeader from "@/components/shell/PageHeader";
import EmptyState from "@/components/shell/EmptyState";

export const dynamic = "force-dynamic";

export default async function CardDesignerPage() {
  const session = await getSession();
  if (!hasSchoolPermission(session, "cards.view")) return <AccessDenied />;
  let templates = [];
  let databaseError = false;
  try {
    templates = await listCardTemplates(session.school_id);
  } catch (error) {
    console.error("Card templates load failed", error);
    databaseError = true;
  }
  return (
    <main className="dashboard cards-page">
      <PageHeader eyebrow="Card production" title="Card designer" intro="Your school's card template library. The full visual editor arrives in Phase 3." />
      {databaseError ? <EmptyState title="Unable to load templates.">Please check the database connection and try again.</EmptyState> : templates.length === 0 ? <EmptyState title="No templates yet." actionHref="/cards" actionLabel="Go to card generation">Templates saved by the card generator appear here, ready to open in the designer.</EmptyState> : (
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Template library</p><h2>{templates.length} template{templates.length === 1 ? "" : "s"}</h2></div></div>
          <div className="student-table">
            {templates.map((template) => (
              <Link className="student-row" href={`/cards/designer/${template.id}`} key={template.id}>
                <span className="student-avatar">⌗</span>
                <span className="student-name"><strong>{template.name}</strong><small>Version {template.version} · {template.createdAt ? new Date(template.createdAt).toLocaleDateString() : ""}</small></span>
                <span className="arrow">→</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}