import Link from "next/link";
import { getSession, hasSchoolPermission } from "@/lib/auth";
import { listSchoolAllowances } from "@/lib/clearance";
import AccessDenied from "@/components/shell/AccessDenied";
import PageHeader from "@/components/shell/PageHeader";
import EmptyState from "@/components/shell/EmptyState";

export const dynamic = "force-dynamic";

export default async function ClearanceAllowancesPage() {
  const session = await getSession();
  if (!hasSchoolPermission(session, "clearance.view")) return <AccessDenied />;
  let allowances = [];
  let databaseError = false;
  try {
    allowances = await listSchoolAllowances(session.school_id);
  } catch (error) {
    console.error("Allowances load failed", error);
    databaseError = true;
  }
  return (
    <main className="dashboard settings-page">
      <PageHeader eyebrow="Clearance" title="Temporary allowances" intro="Active overrides that allow a student through clearance until their expiry date. Open a student's profile to grant or revoke." />
      {databaseError ? <EmptyState title="Unable to load allowances.">Please check the database connection and try again.</EmptyState> : allowances.length === 0 ? <EmptyState title="No active allowances.">Grant a temporary allowance from a student's profile when they need an exception.</EmptyState> : (
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Active overrides</p><h2>{allowances.length} allowance{allowances.length === 1 ? "" : "s"}</h2></div></div>
          <div className="clearance-rule-list">
            {allowances.map((allowance) => (
              <div className="clearance-rule-row" key={allowance.id}>
                <span>
                  <strong><Link href={`/students/${encodeURIComponent(allowance.student_uid)}`}>{allowance.full_name}</Link></strong>
                  <small>{allowance.class_name || "No class"} · until {String(allowance.allowed_until).slice(0, 10)} · {allowance.reason}</small>
                  <small>Granted {allowance.granted_at ? new Date(allowance.granted_at).toLocaleDateString() : ""}{allowance.granted_by_name ? ` by ${allowance.granted_by_name}` : ""}</small>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}