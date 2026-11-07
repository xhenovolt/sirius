import Link from "next/link";
import { getSchoolSettings, getStudentsForCards } from "@/lib/students";
import QrCards from "./QrCards";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import LogoutButton from "../LogoutButton";
import { buildScanUrl, getAppBaseUrl, issueIdentitiesForStudents } from "@/lib/identity";

export const dynamic = "force-dynamic";

export default async function CardsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  let students = [];
  let school = null;
  let cardLimitReached = false;
  let databaseError = false;
  try {
    getAppBaseUrl();
    [students, school] = await Promise.all([
      getStudentsForCards(session.school_id),
      getSchoolSettings(session.school_id),
    ]);
    const identities = await issueIdentitiesForStudents(session.school_id, students.map((student) => student.id));
    const studentsWithCards = [];
    for (const student of students) {
      const identity = identities[String(student.id)];
      if (!identity) continue;
      studentsWithCards.push({
        ...student,
        verifyUrl: buildScanUrl(identity.public_token),
      });
    }
    cardLimitReached = studentsWithCards.length < students.length;
    students = studentsWithCards;
  } catch (error) {
    console.error("Card records load failed", error);
    databaseError = true;
  }

  return <div className="app-shell"><header className="topbar"><Link className="brand" href="/"><span className="brand-mark">S</span><span>Sirius</span></Link><nav className="main-nav" aria-label="Main navigation"><Link href="/">Overview</Link><Link href="/students">Students</Link><Link href="/import">Import</Link><Link className="active" href="/cards">Cards</Link></nav><LogoutButton /></header><main className="dashboard cards-page"><div className="page-title"><div><p className="eyebrow">Card production</p><h1>Generate cards</h1><p className="intro-copy">Every QR code contains only an opaque token for the student&apos;s live record.</p></div></div>{databaseError ? <div className="empty-state"><strong>Unable to prepare student cards.</strong><p>Check the database and APP_BASE_URL configuration, then try again.</p></div> : students.length === 0 ? <div className="empty-state"><strong>No students are ready for cards.</strong><p>{cardLimitReached ? "Your card capacity has been reached. Existing issued cards remain available." : "Import student records first, then return here to generate QR codes."}</p></div> : <>{cardLimitReached && <div className="import-message">Card capacity reached. Showing the cards already issued and any new cards within your remaining limit.</div>}<QrCards students={students} school={school} /></>}</main></div>;
}