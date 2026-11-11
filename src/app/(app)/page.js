import Link from "next/link";
import { getRecentImports, getSchoolSettings, getStudentSummary } from "@/lib/students";
import { getSession, hasSchoolPermission } from "@/lib/auth";
import AccessDenied from "@/components/shell/AccessDenied";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  if (!hasSchoolPermission(session, "dashboard.view")) return <AccessDenied />;
  const canViewStudents = hasSchoolPermission(session, "students.view");
  const canManageImports = hasSchoolPermission(session, "imports.manage");
  const canViewImports = hasSchoolPermission(session, "imports.view");
  const canViewCards = hasSchoolPermission(session, "cards.view");
  let summary = { students: 0, without_photos: 0 };
  let school = { school_name: "School" };
  let recentImports = [];
  let databaseError = false;
  try {
    [summary, recentImports, school] = await Promise.all([
      getStudentSummary(session.school_id),
      canViewImports ? getRecentImports(session.school_id) : Promise.resolve([]),
      getSchoolSettings(session.school_id),
    ]);
  } catch (error) {
    console.error("Dashboard load failed", error);
    databaseError = true;
  }
  const students = Number(summary.students || 0);
  const withoutPhotos = Number(summary.without_photos || 0);

  return (
    <main className="dashboard">
      <section className="intro-row">
        <div>
          <p className="eyebrow">{school.school_name}</p>
          <h1>Welcome back, {session.displayName}.</h1>
          <p className="intro-copy">Here is what is happening with your student records.</p>
        </div>
        {canManageImports && <Link className="button button-primary" href="/imports/new"><span>+</span> Import students</Link>}
      </section>

      <section className="stat-grid" aria-label="Student record summary">
        {[{ label: "Students", value: students, note: databaseError ? "Database unavailable" : "Active records", tone: "blue" }, { label: "QR codes ready", value: students, note: "Generated from student IDs", tone: "mint" }, { label: "Without photos", value: withoutPhotos, note: "Needs attention", tone: "amber" }].map((stat) => (
          <article className={`stat-card ${stat.tone}`} key={stat.label}>
            <div className="stat-heading"><span>{stat.label}</span><span className="stat-dot" /></div>
            <strong>{stat.value}</strong>
            <p>{stat.note}</p>
          </article>
        ))}
      </section>

      <section className="content-grid">
        <div className="panel action-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Quick actions</p><h2>Keep things moving</h2></div>
            <span className="panel-icon">↗</span>
          </div>
          <div className="action-list">
            {canManageImports && <Link href="/imports/new" className="action-item"><span className="action-icon blue-icon">↥</span><span><strong>Import students</strong><small>Upload an Excel spreadsheet</small></span><span className="arrow">→</span></Link>}
            {canViewCards && <Link href="/cards" className="action-item"><span className="action-icon mint-icon">⌗</span><span><strong>Generate QR codes</strong><small>Prepare cards for printing</small></span><span className="arrow">→</span></Link>}
            {canViewStudents && <Link href="/verify" className="action-item"><span className="action-icon peach-icon">⌁</span><span><strong>Scan a student card</strong><small>Find a student instantly</small></span><span className="arrow">→</span></Link>}
          </div>
        </div>

        {canViewImports && <div className="panel imports-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Activity</p><h2>Recent imports</h2></div>
            <Link className="text-link" href="/imports">View all <span>→</span></Link>
          </div>
          <div className="import-table">
            {recentImports.length === 0 ? <p className="empty-inline">No imports recorded yet.</p> : recentImports.map((item) => (
              <Link className="import-row" href="/imports" key={`${item.file_name}-${item.created_at}`}>
                <span className="file-icon">xls</span>
                <span className="import-info"><strong>{item.file_name}</strong><small>{item.imported_rows} students · {new Date(item.created_at).toLocaleDateString()}</small></span>
                <span className="status"><i />{item.status}</span>
              </Link>
            ))}
          </div>
        </div>}
      </section>

      <section className="bottom-banner">
        <div className="banner-copy"><span className="banner-mark">⌗</span><div><p className="eyebrow">Card readiness</p><h2>{withoutPhotos} students are missing a photo</h2><p>Add photos before generating their cards for a complete identity record.</p></div></div>
        {canViewStudents && <Link className="button button-light" href="/students">Review students <span>→</span></Link>}
      </section>
    </main>
  );
}