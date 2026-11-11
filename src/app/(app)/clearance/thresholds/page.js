import { getSession, hasSchoolPermission } from "@/lib/auth";
import AccessDenied from "@/components/shell/AccessDenied";
import PageHeader from "@/components/shell/PageHeader";
import ClearanceRules from "./ClearanceRules";

export const dynamic = "force-dynamic";

export default async function ClearanceThresholdsPage() {
  const session = await getSession();
  if (!hasSchoolPermission(session, "clearance.view")) return <AccessDenied />;
  return (
    <main className="dashboard settings-page">
      <PageHeader eyebrow="Clearance" title="Fee-balance thresholds" intro="Set the balance at or below which students are automatically allowed." />
      <ClearanceRules canManage={hasSchoolPermission(session, "clearance.manage")} />
    </main>
  );
}