import Link from "next/link";
import { getSession, hasSchoolPermission } from "@/lib/auth";
import { listImportBatches } from "@/lib/imports";
import AccessDenied from "@/components/shell/AccessDenied";
import PageHeader from "@/components/shell/PageHeader";
import EmptyState from "@/components/shell/EmptyState";

export const dynamic = "force-dynamic";

export default async function ImportFilesPage() {
  const session = await getSession();
  if (!hasSchoolPermission(session, "imports.view")) return <AccessDenied />;
  let batches = [];
  let databaseError = false;
  try {
    batches = await listImportBatches(session.school_id);
  } catch (error) {
    console.error("Import files load failed", error);
    databaseError = true;
  }
  return (
    <main className="dashboard import-page">
      <PageHeader eyebrow="Student records" title="Stored files" intro="Download the original spreadsheet or any saved review version for each import." />
      {databaseError ? <EmptyState title="Unable to load stored files.">Please check the database connection and try again.</EmptyState> : batches.length === 0 ? <EmptyState title="No stored files yet." actionHref="/imports" actionLabel="View import history">Files appear here once you stage an import.</EmptyState> : (
        <section className="panel import-history">
          <div className="panel-heading"><div><p className="eyebrow">Downloads</p><h2>{batches.length} file{batches.length === 1 ? "" : "s"}</h2></div></div>
          {batches.map((item) => (
            <div className="import-history-row import-file-row" key={item.id}>
              <span>
                <strong><Link href={`/imports/${item.id}`}>{item.fileName}</Link></strong>
                <small>{item.totalRows} rows · {item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}</small>
              </span>
              <span className="import-downloads">
                <a href={`/api/imports/${item.id}/download?source=original`}>Original</a>
                {Array.from({ length: item.currentVersion }, (_, index) => index + 1).map((version) => (
                  <span key={version}>
                    v{version}:
                    {" "}<a href={`/api/imports/${item.id}/download?version=${version}&format=xlsx`}>XLSX</a>
                    {" "}<a href={`/api/imports/${item.id}/download?version=${version}&format=csv`}>CSV</a>
                  </span>
                ))}
              </span>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}