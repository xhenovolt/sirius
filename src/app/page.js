import Link from "next/link";
import { getRecentImports, getSchoolSettings, getStudentSummary } from "@/lib/students";
import { getSession, hasSchoolPermission } from "@/lib/auth";
import { redirect } from "next/navigation";
import LogoutButton from "./LogoutButton";
import AccessDenied from "./AccessDenied";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!hasSchoolPermission(session, "dashboard.view")) return <AccessDenied />;
  const canViewStudents = hasSchoolPermission(session, "students.view");
  const canManageImports = hasSchoolPermission(session, "imports.manage");
  const canViewImports = hasSchoolPermission(session, "imports.view");
  const canViewCards = hasSchoolPermission(session, "cards.view");
  const canAccessSettings = session.isSuperAdmin || ["users.manage", "school.settings.manage", "clearance.view", "clearance.manage", "audit.view"].some((permission) => session.permissions.includes(permission));
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
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Sirius home">
          <span className="brand-mark">S</span>
          <span>Sirius</span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          <a className="active" href="#overview">Overview</a>
          {canViewStudents && <Link href="/students">Students</Link>}
          {canViewImports && <Link href="/import">Imports</Link>}
          {canViewCards && <Link href="/cards">Cards</Link>}
          {canAccessSettings && <Link href="/settings">Settings</Link>}
        </nav>
        <LogoutButton />
      </header>

      <main className="dashboard" id="overview">
        <section className="intro-row">
          <div>
            <p className="eyebrow">{school.school_name}</p>
            <h1>Good morning, {session.displayName}.</h1>
            <p className="intro-copy">Here is what is happening with your student records.</p>
          </div>
          {canManageImports && <Link className="button button-primary" href="/import"><span>+</span> Import students</Link>}
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
          <div className="panel action-panel" id="students">
            <div className="panel-heading">
              <div><p className="eyebrow">Quick actions</p><h2>Keep things moving</h2></div>
              <span className="panel-icon">↗</span>
            </div>
            <div className="action-list">
              {canManageImports && <Link href="/import" className="action-item"><span className="action-icon blue-icon">↥</span><span><strong>Import students</strong><small>Upload an Excel spreadsheet</small></span><span className="arrow">→</span></Link>}
              {canViewCards && <Link href="/cards" className="action-item"><span className="action-icon mint-icon">⌗</span><span><strong>Generate QR codes</strong><small>Prepare cards for printing</small></span><span className="arrow">→</span></Link>}
              {canViewStudents && <Link href="/scan" className="action-item"><span className="action-icon peach-icon">⌁</span><span><strong>Scan a student card</strong><small>Find a student instantly</small></span><span className="arrow">→</span></Link>}
            </div>
          </div>

          {canViewImports && <div className="panel imports-panel" id="imports">
            <div className="panel-heading">
              <div><p className="eyebrow">Activity</p><h2>Recent imports</h2></div>
              <a className="text-link" href="#imports">View all <span>→</span></a>
            </div>
            <div className="import-table">
              {recentImports.length === 0 ? <p className="empty-inline">No imports recorded yet.</p> : recentImports.map((item) => (
                <div className="import-row" key={`${item.file_name}-${item.created_at}`}>
                  <span className="file-icon">xls</span>
                  <span className="import-info"><strong>{item.file_name}</strong><small>{item.imported_rows} students · {new Date(item.created_at).toLocaleDateString()}</small></span>
                  <span className="status"><i />{item.status}</span>
                </div>
              ))}
            </div>
          </div>}
        </section>

        <section className="bottom-banner" id="cards">
          <div className="banner-copy"><span className="banner-mark">⌗</span><div><p className="eyebrow">Card readiness</p><h2>{withoutPhotos} students are missing a photo</h2><p>Add photos before generating their cards for a complete identity record.</p></div></div>
          {canViewStudents && <a className="button button-light" href="/students">Review students <span>→</span></a>}
        </section>
      </main>
    </div>
  );
}
