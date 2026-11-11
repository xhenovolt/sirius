import Link from "next/link";
import { getSession, hasSchoolPermission } from "@/lib/auth";
import { getClearanceSummary } from "@/lib/clearance";
import AccessDenied from "@/components/shell/AccessDenied";
import PageHeader from "@/components/shell/PageHeader";
import EmptyState from "@/components/shell/EmptyState";

export const dynamic = "force-dynamic";

export default async function ClearanceOverviewPage() {
  const session = await getSession();
  if (!hasSchoolPermission(session, "clearance.view")) return <AccessDenied />;
  const canManage = hasSchoolPermission(session, "clearance.manage");
  let summary = { activeAllowances: 0, activeThresholds: 0, scansLast24h: 0 };
  let databaseError = false;
  try {
    summary = await getClearanceSummary(session.school_id);
  } catch (error) {
    console.error("Clearance summary load failed", error);
    databaseError = true;
  }
  return (
    <main className="dashboard">
      <PageHeader eyebrow="Clearance" title="Clearance overview" intro="How students are cleared: a temporary allowance, then an active threshold, then a zero balance." />
      {databaseError ? <EmptyState title="Unable to load clearance data.">Please check the database connection and try again.</EmptyState> : <>
        <section className="stat-grid" aria-label="Clearance summary">
          {[{ label: "Active allowances", value: summary.activeAllowances, note: "Temporary overrides in force", tone: "mint" }, { label: "Active thresholds", value: summary.activeThresholds, note: "Automatic balance rules", tone: "blue" }, { label: "Scans (24h)", value: summary.scansLast24h, note: "Verification lookups", tone: "amber" }].map((stat) => (
            <article className={`stat-card ${stat.tone}`} key={stat.label}>
              <div className="stat-heading"><span>{stat.label}</span><span className="stat-dot" /></div>
              <strong>{stat.value}</strong>
              <p>{stat.note}</p>
            </article>
          ))}
        </section>
        <section className="content-grid">
          <div className="panel action-panel">
            <div className="panel-heading"><div><p className="eyebrow">Manage</p><h2>Clearance controls</h2></div></div>
            <div className="action-list">
              <Link href="/clearance/allowances" className="action-item"><span className="action-icon mint-icon">✓</span><span><strong>Allowances</strong><small>Review active temporary overrides</small></span><span className="arrow">→</span></Link>
              <Link href="/clearance/thresholds" className="action-item"><span className="action-icon blue-icon">≡</span><span><strong>Thresholds</strong><small>{canManage ? "Set automatic balance rules" : "View automatic balance rules"}</small></span><span className="arrow">→</span></Link>
              <Link href="/verify/log" className="action-item"><span className="action-icon peach-icon">⌁</span><span><strong>Scan log</strong><small>See recent verification outcomes</small></span><span className="arrow">→</span></Link>
            </div>
          </div>
          <div className="panel">
            <div className="panel-heading"><div><p className="eyebrow">How it works</p><h2>Clearance order</h2></div></div>
            <ol className="clearance-order">
              <li><strong>Allowance.</strong> An active, unexpired temporary allowance always allows the student.</li>
              <li><strong>Threshold.</strong> Otherwise, a matching active rule allows balances at or below its limit.</li>
              <li><strong>Zero balance.</strong> Otherwise, a zero fee balance clears the student.</li>
              <li><strong>Not cleared.</strong> Anything else is not cleared.</li>
            </ol>
          </div>
        </section>
      </>}
    </main>
  );
}