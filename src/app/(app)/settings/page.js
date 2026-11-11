import { redirect } from "next/navigation";
import { getSession, hasSchoolPermission } from "@/lib/auth";
import AccessDenied from "@/components/shell/AccessDenied";

export const dynamic = "force-dynamic";

export default async function SettingsIndex() {
  const session = await getSession();
  if (hasSchoolPermission(session, "school.settings.manage")) redirect("/settings/school");
  if (hasSchoolPermission(session, "users.manage")) redirect("/settings/users");
  if (session?.isSuperAdmin) redirect("/settings/roles");
  if (hasSchoolPermission(session, "audit.view")) redirect("/settings/audit");
  return <AccessDenied />;
}