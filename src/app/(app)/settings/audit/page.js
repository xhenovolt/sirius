import { getSession, hasSchoolPermission } from "@/lib/auth";
import { listAuditLogs } from "@/lib/audit";
import AccessDenied from "@/components/shell/AccessDenied";
import PageHeader from "@/components/shell/PageHeader";
import EmptyState from "@/components/shell/EmptyState";
import AuditLogPanel from "./AuditLogPanel";

export const dynamic = "force-dynamic";

export default async function AuditSettingsPage() {
  const session = await getSession();
  if (!hasSchoolPermission(session, "audit.view")) return <AccessDenied />;
  let logs = [];
  let databaseError = false;
  try {
    logs = await listAuditLogs(session.school_id, 100);
  } catch (error) {
    console.error("Audit log load failed", error);
    databaseError = true;
  }
  return (
    <main className="dashboard settings-page">
      <PageHeader eyebrow="Workspace administration" title="Audit log" intro="A record of sensitive actions taken in your school workspace." />
      {databaseError ? <EmptyState title="Unable to load the audit log.">Please check the database connection and try again.</EmptyState> : <AuditLogPanel logs={logs} />}
    </main>
  );
}