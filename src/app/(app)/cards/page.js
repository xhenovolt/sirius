import { getSchoolSettings, getStudentsForCards } from "@/lib/students";
import QrCards from "./QrCards";
import { getSession, hasSchoolPermission } from "@/lib/auth";
import { buildScanUrl, getAppBaseUrl, issueIdentitiesForStudents } from "@/lib/identity";
import { listCardTemplates } from "@/lib/cardTemplates";
import AccessDenied from "@/components/shell/AccessDenied";
import PageHeader from "@/components/shell/PageHeader";
import { getAppBaseUrlSetting } from "@/lib/control/platform-settings";

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
  if (!hasSchoolPermission(session, "cards.view")) return <AccessDenied />;
  const canManageTemplates = hasSchoolPermission(session, "cards.manage");
  let students = [];
  let school = null;
  let templates = [];
  let cardLimitReached = false;
  let databaseError = false;
  let failingStep = "public_app_base_url_setting";
  let appBaseUrl;
  try {
    const configuredAppBaseUrl = await getAppBaseUrlSetting();
    failingStep = "app_base_url";
    appBaseUrl = getAppBaseUrl(configuredAppBaseUrl || process.env.APP_BASE_URL);
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
        verifyUrl: buildScanUrl(identity.public_token, appBaseUrl),
      });
    }
    cardLimitReached = studentsWithCards.length < students.length;
    students = studentsWithCards;
    return renderCardsPage({ students, school, cardLimitReached, databaseError, templates, canManageTemplates });
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

  return renderCardsPage({ students, school, cardLimitReached, databaseError, templates: [], canManageTemplates });
}

function renderCardsPage({ students, school, cardLimitReached, databaseError, templates, canManageTemplates }) {
  return <main className="dashboard cards-page"><PageHeader eyebrow="Card production" title="Generate cards" intro="Every QR code contains only an opaque token for the student's live record." />{databaseError ? <div className="empty-state"><strong>Unable to prepare student cards.</strong><p>Check the database connection, or ask a Control Center operator to set the public website URL in Platform Settings.</p></div> : <>{students.length === 0 && <div className="empty-state"><strong>{cardLimitReached ? "Card capacity reached." : "No students are ready for cards."}</strong><p>{cardLimitReached ? "Existing issued cards remain available when the page is refreshed after capacity changes." : "Import student records first. You can still design and save a card template."}</p></div>}{cardLimitReached && students.length > 0 && <div className="import-message">Card capacity reached. Showing cards already issued and any new cards within your remaining limit.</div>}<QrCards students={students} school={school} templates={templates} canManage={canManageTemplates} /></>}</main>;
}