import { getSession, hasSchoolPermission } from "@/lib/auth";
import { getSchoolSettings } from "@/lib/students";
import AccessDenied from "@/components/shell/AccessDenied";
import PageHeader from "@/components/shell/PageHeader";
import EmptyState from "@/components/shell/EmptyState";
import LogoUpload from "./LogoUpload";
import SchoolDetailsForm from "./SchoolDetailsForm";

export const dynamic = "force-dynamic";

export default async function SchoolSettingsPage() {
  const session = await getSession();
  if (!hasSchoolPermission(session, "school.settings.manage")) return <AccessDenied />;
  let school = null;
  let databaseError = false;
  try {
    school = await getSchoolSettings(session.school_id);
  } catch (error) {
    console.error("School settings load failed", error);
    databaseError = true;
  }
  return (
    <main className="dashboard settings-page">
      <PageHeader eyebrow="Workspace administration" title="School settings" intro="Your school's identity, branding and contact details." />
      {databaseError || !school ? <EmptyState title="Unable to load school settings.">Please check the database connection and try again.</EmptyState> : <div className="settings-grid"><LogoUpload logoUrl={school.logo_url} /><SchoolDetailsForm school={school} /></div>}
    </main>
  );
}