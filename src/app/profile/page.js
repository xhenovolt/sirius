import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getSchoolSettings } from "@/lib/students";
import LogoutButton from "../LogoutButton";

export const dynamic = "force-dynamic";

const roleLabels = {
  superadmin: "School SuperAdmin",
  admin: "School administrator",
  bursar: "Bursar",
  operator: "Operator",
};

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  let school = null;
  try {
    school = await getSchoolSettings(session.school_id);
  } catch (error) {
    console.error("Profile school lookup failed", error);
  }

  const details = [
    ["Name", session.displayName],
    ["Email", session.email],
    ["Phone", session.phone || "Not provided"],
    ["Role", roleLabels[session.role] || "School user"],
    ["School", school?.school_name || "Unavailable"],
  ];

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/"><span className="brand-mark">S</span><span>Sirius</span></Link>
        <nav className="main-nav" aria-label="Main navigation">
          <Link href="/">Overview</Link>
          <Link href="/students">Students</Link>
          <Link href="/import">Import</Link>
          <Link href="/cards">Cards</Link>
          {session.isSchoolAdmin && <Link href="/settings">Settings</Link>}
        </nav>
        <LogoutButton />
      </header>
      <main className="dashboard profile-page">
        <div className="page-title">
          <div>
            <p className="eyebrow">Account</p>
            <h1>My profile</h1>
            <p className="intro-copy">Your account details and school membership.</p>
          </div>
        </div>
        <section className="profile-card" aria-label="Profile details">
          <div className="profile-card-heading">
            <span className="avatar">{session.displayName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "S"}</span>
            <div>
              <h2>{session.displayName}</h2>
              <p>{roleLabels[session.role] || "School user"}</p>
            </div>
          </div>
          <dl className="profile-details">
            {details.map(([label, value]) => (
              <div className="profile-detail" key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {session.isSchoolAdmin && <Link className="text-link profile-settings-link" href="/settings">Manage school settings <span>→</span></Link>}
        </section>
      </main>
    </div>
  );
}
