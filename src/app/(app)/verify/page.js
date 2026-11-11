import { getSession, hasSchoolPermission } from "@/lib/auth";
import Scanner from "./Scanner";
import AccessDenied from "@/components/shell/AccessDenied";
import PageHeader from "@/components/shell/PageHeader";

export const dynamic = "force-dynamic";

export default async function ScanPage() {
  const session = await getSession();
  if (!hasSchoolPermission(session, "students.view")) return <AccessDenied />;
  return (
    <main className="dashboard scan-page">
      <PageHeader eyebrow="Identity lookup" title="Scan a student card" intro="Scan a QR code to find the learner record instantly." />
      <Scanner />
    </main>
  );
}