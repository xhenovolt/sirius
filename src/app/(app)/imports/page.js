import Link from "next/link";
import { getSession, hasSchoolPermission } from "@/lib/auth";
import { listImportBatches } from "@/lib/imports";
import AccessDenied from "@/components/shell/AccessDenied";
import PageHeader from "@/components/shell/PageHeader";
import EmptyState from "@/components/shell/EmptyState";

export const dynamic = "force-dynamic";

const statusLabels = {
  preview: "In review",
  completed: "Imported",
  rolled_back: "Rolled back",
};

export default async function ImportsHistoryPage() {
  const session = await getSession();
  if (!hasSchoolPermission(session, "imports.view")) return <AccessDenied />;
  const canManage = hasSchoolPermission(session, "imports.manage");
  let batches = [];
  let databaseError = false;
  try {
    batches = await listImportBatches(session.school_id);
  } catch (error) {
    console.error("Import history load failed", error);
    databaseError = true;
  }
  return (
    <main className="dashboard import-page">
      <PageHeader
        eyebrow="Student records"
        title="Import history"
        intro="Every spreadsheet you have staged, with its review and commit status."
        actions={canManage ? <Link className="button button-primary" href="/imports/new"><span>+</span> New import</Link> : null}
      />
      {databaseError ? <EmptyState title="Unable to load import history.">Please check the database connection and try again.</EmptyState> : batches.length === 0 ? <EmptyState title="No imports yet." actionHref={canManage ? "/imports/new" : null} actionLabel={canManage ? "Start an import" : null}>Upload a spreadsheet to stage student records for review.</EmptyState> : (
        <section className="panel import-history">
          <div className="panel-heading"><div><p className="eyebrow">Saved imports</p><h2>{batches.length} batch{batches.length === 1 ? "" : "es"}</h2></div></div>
          {batches.map((item) => (
            <div className="import-history-row" key={item.id}>
              <span>
                <strong><Link href={`/imports/${item.id}`}>{item.fileName}</Link></strong>
                <small>{statusLabels[item.status] || item.status} · {item.totalRows} rows · {item.validRows} ready · {item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}</small>
              </span>
              <Link className="button" href={`/imports/${item.id}`}>Open</Link>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}