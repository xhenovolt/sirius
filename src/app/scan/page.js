import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import LogoutButton from "../LogoutButton";
import Scanner from "./Scanner";
import { hasSchoolPermission } from "@/lib/auth";
import AccessDenied from "../AccessDenied";

export const dynamic = "force-dynamic";

export default async function ScanPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!hasSchoolPermission(session, "students.view")) return <AccessDenied />;
  return <div className="app-shell"><header className="topbar"><Link className="brand" href="/"><span className="brand-mark">S</span><span>Sirius</span></Link><nav className="main-nav" aria-label="Main navigation"><Link href="/">Overview</Link><Link href="/students">Students</Link><Link href="/import">Import</Link><Link className="active" href="/scan">Scan</Link></nav><LogoutButton /></header><main className="dashboard scan-page"><div className="page-title"><div><p className="eyebrow">Identity lookup</p><h1>Scan a student card</h1><p className="intro-copy">Scan a QR code to find the learner record instantly.</p></div></div><Scanner /></main></div>;
}