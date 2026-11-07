import Link from "next/link";
import { getSchoolSettings, getStudentsForCards } from "@/lib/students";
import QrCards from "./QrCards";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import LogoutButton from "../LogoutButton";

export const dynamic = "force-dynamic";

export default async function CardsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  let students = [];
  let school = null;
  let databaseError = false;
  try {
    [students, school] = await Promise.all([
      getStudentsForCards(session.school_id),
      getSchoolSettings(session.school_id),
    ]);
  } catch (error) {
    console.error("Card records load failed", error);
    databaseError = true;
  }

    return <div className="app-shell"><header className="topbar"><Link className="brand" href="/"><span className="brand-mark">S</span><span>Sirius</span></Link><nav className="main-nav" aria-label="Main navigation"><Link href="/">Overview</Link><Link href="/students">Students</Link><Link href="/import">Import</Link><Link className="active" href="/cards">Cards</Link></nav><LogoutButton /></header><main className="dashboard cards-page"><div className="page-title"><div><p className="eyebrow">Card production</p><h1>Generate cards</h1><p className="intro-copy">Every QR code contains only the student&apos;s stable Sirius identity.</p></div></div>{databaseError ? <div className="empty-state"><strong>Unable to connect to student records.</strong><p>Please try again.</p></div> : students.length === 0 ? <div className="empty-state"><strong>No students are ready for cards.</strong><p>Import student records first, then return here to generate QR codes.</p></div> : <QrCards students={students} school={school} />}</main></div>;
}