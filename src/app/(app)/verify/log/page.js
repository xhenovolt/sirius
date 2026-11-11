import Link from "next/link";
import { getSession, hasSchoolPermission } from "@/lib/auth";
import { listScanEvents } from "@/lib/clearance";
import AccessDenied from "@/components/shell/AccessDenied";
import PageHeader from "@/components/shell/PageHeader";
import EmptyState from "@/components/shell/EmptyState";

export const dynamic = "force-dynamic";

const outcomeLabels = {
  resolved: "Resolved",
  unknown: "Unknown token",
  invalid: "Invalid token",
  revoked: "Revoked",
  rate_limited: "Rate limited",
};

export default async function ScanLogPage() {
  const session = await getSession();
  if (!hasSchoolPermission(session, "students.view")) return <AccessDenied />;
  let events = [];
  let databaseError = false;
  try {
    events = await listScanEvents(session.school_id);
  } catch (error) {
    console.error("Scan log load failed", error);
    databaseError = true;
  }
  return (
    <main className="dashboard">
      <PageHeader eyebrow="Verification" title="Scan log" intro="Recent card verification attempts, newest first." />
      {databaseError ? <EmptyState title="Unable to load the scan log.">Please check the database connection and try again.</EmptyState> : events.length === 0 ? <EmptyState title="No scans recorded yet." actionHref="/verify" actionLabel="Open the scanner">Scan a student card to see verification activity here.</EmptyState> : (
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Activity</p><h2>{events.length} recent scan{events.length === 1 ? "" : "s"}</h2></div></div>
          <div className="student-table">
            {events.map((event) => (
              <div className="student-row" key={event.id}>
                <span className="student-name">
                  <strong>{event.full_name ? (event.student_uid ? <Link href={`/students/${encodeURIComponent(event.student_uid)}`}>{event.full_name}</Link> : event.full_name) : "Unresolved token"}</strong>
                  <small>{event.ip_address || "unknown IP"} · {event.created_at ? new Date(event.created_at).toLocaleString() : ""}</small>
                </span>
                <span className={`status scan-outcome ${event.outcome === "resolved" ? "ok" : "warn"}`}><i />{outcomeLabels[event.outcome] || event.outcome}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}