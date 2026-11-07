import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getSchoolSettings, getUsers } from "@/lib/students";
import LogoutButton from "../LogoutButton";
import SettingsForm from "./SettingsForm";
import UserCreateForm from "./UserCreateForm";
import LogoUpload from "./LogoUpload";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.isSuperAdmin) return <div className="app-shell"><header className="topbar"><Link className="brand" href="/"><span className="brand-mark">S</span><span>Sirius</span></Link><LogoutButton /></header><main className="dashboard"><div className="empty-state"><strong>Administrator access required.</strong><p>Only an administrator can manage school settings and users.</p></div></main></div>;
  let school = null; let users = [];
  try { [school, users] = await Promise.all([getSchoolSettings(session.school_id), getUsers(session.school_id)]); } catch (error) { console.error("Settings page load failed", error); }
  return <div className="app-shell"><header className="topbar"><Link className="brand" href="/"><span className="brand-mark">S</span><span>Sirius</span></Link><nav className="main-nav" aria-label="Main navigation"><Link href="/">Overview</Link><Link href="/students">Students</Link><Link href="/import">Import</Link><Link href="/cards">Cards</Link><Link className="active" href="/settings">Settings</Link></nav><LogoutButton /></header><main className="dashboard settings-page"><div className="page-title"><div><p className="eyebrow">Workspace administration</p><h1>Settings</h1><p className="intro-copy">Manage school identity and the people who can access Sirius.</p></div></div>{school ? <><LogoUpload logoUrl={school.logo_url} /><UserCreateForm /><SettingsForm school={school} users={users} currentUserId={session.id} /></> : <div className="empty-state"><strong>Unable to load settings.</strong><p>Please try again.</p></div>}</main></div>;
}