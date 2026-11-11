import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getSchoolSettings } from "@/lib/students";
import PageHeader from "@/components/shell/PageHeader";

export const dynamic = "force-dynamic";

const roleLabels = {
  superadmin: "School SuperAdmin",
  admin: "School administrator",
  bursar: "Bursar",
  operator: "Operator",
};

export default async function ProfilePage() {
  const session = await getSession();

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
    <main className="dashboard profile-page">
      <PageHeader eyebrow="Account" title="My profile" intro="Your account details and school membership." />
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
        {session.isSchoolAdmin && <Link className="text-link profile-settings-link" href="/settings/school">Manage school settings <span>→</span></Link>}
      </section>
    </main>
  );
}