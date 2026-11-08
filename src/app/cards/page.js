import Link from "next/link";
import { getSchoolSettings, getStudentsForCards } from "@/lib/students";
import QrCards from "./QrCards";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import LogoutButton from "../LogoutButton";
import { buildScanUrl, getAppBaseUrl, issueIdentitiesForStudents } from "@/lib/identity";
import { listCardTemplates } from "@/lib/cardTemplates";
import AccessDenied from "../AccessDenied";
import { hasSchoolPermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

function cardStep(step, work) {
  return Promise.resolve(work).catch((error) => {
    const detail = error instanceof Error ? error : new Error(String(error), { cause: error });
    detail.cardPreparationStep = step;
    throw detail;
  });
}

export default async function CardsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!hasSchoolPermission(session, "cards.view")) return <AccessDenied />;
  const canManageTemplates = hasSchoolPermission(session, "cards.manage");
  let students = [];
  let school = null;
  let templates = [];
  let cardLimitReached = false;
  let databaseError = false;
  let failingStep = "app_base_url";
  try {
    getAppBaseUrl();
    [students, school, templates] = await Promise.all([
      cardStep("student_query", getStudentsForCards(session.school_id)),
      cardStep("school_settings_query", getSchoolSettings(session.school_id)),
      cardStep("card_templates_query", listCardTemplates(session.school_id)),
    ]);
    failingStep = "qr_identity_issuance";
    const identities = await issueIdentitiesForStudents(session.school_id, students.map((student) => student.id));
    failingStep = "verification_url_build";
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
    return renderCardsPage({ session, students, school, cardLimitReached, databaseError, templates, canManageTemplates });
  } catch (error) {
    const detail = error instanceof Error ? error : new Error(String(error));
    console.error("Card preparation failed", {
      step: detail.cardPreparationStep || failingStep,
      errorClass: detail.constructor.name,
      errorCode: typeof detail.code === "string" ? detail.code : null,
      errorMessage: detail.message,
    });
    databaseError = true;
  }

  return renderCardsPage({ session, students, school, cardLimitReached, databaseError, templates: [], canManageTemplates });
}

function renderCardsPage({ session, students, school, cardLimitReached, databaseError, templates, canManageTemplates }) {
  return <div className="app-shell"><header className="topbar"><Link className="brand" href="/"><span className="brand-mark">S</span><span>Sirius</span></Link><nav className="main-nav" aria-label="Main navigation">{hasSchoolPermission(session, "dashboard.view") && <Link href="/">Overview</Link>}{hasSchoolPermission(session, "students.view") && <Link href="/students">Students</Link>}{hasSchoolPermission(session, "imports.view") && <Link href="/import">Import</Link>}<Link className="active" href="/cards">Cards</Link></nav><LogoutButton /></header><main className="dashboard cards-page"><div className="page-title"><div><p className="eyebrow">Card production</p><h1>Generate cards</h1><p className="intro-copy">Every QR code contains only an opaque token for the student&apos;s live record.</p></div></div>{databaseError ? <div className="empty-state"><strong>Unable to prepare student cards.</strong><p>Check the database and APP_BASE_URL configuration, then try again.</p></div> : <>{students.length === 0 && <div className="empty-state"><strong>{cardLimitReached ? "Card capacity reached." : "No students are ready for cards."}</strong><p>{cardLimitReached ? "Existing issued cards remain available when the page is refreshed after capacity changes." : "Import student records first. You can still design and save a card template."}</p></div>}{cardLimitReached && students.length > 0 && <div className="import-message">Card capacity reached. Showing cards already issued and any new cards within your remaining limit.</div>}<QrCards students={students} school={school} templates={templates} canManage={canManageTemplates} /></>}</main></div>;
}