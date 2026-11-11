import { getSession, hasSchoolPermission } from "@/lib/auth";
import AccessDenied from "@/components/shell/AccessDenied";
import ImportClient from "./ImportClient";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const session = await getSession();
  if (!hasSchoolPermission(session, "imports.view")) return <AccessDenied />;
  return <ImportClient canManage={hasSchoolPermission(session, "imports.manage")} />;
}