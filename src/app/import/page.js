import { redirect } from "next/navigation";
import { getSession, hasSchoolPermission } from "@/lib/auth";
import AccessDenied from "../AccessDenied";
import ImportClient from "./ImportClient";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!hasSchoolPermission(session, "imports.view")) return <AccessDenied />;
  return (
    <ImportClient
      canManage={hasSchoolPermission(session, "imports.manage")}
      canViewDashboard={hasSchoolPermission(session, "dashboard.view")}
      canViewStudents={hasSchoolPermission(session, "students.view")}
      canViewCards={hasSchoolPermission(session, "cards.view")}
    />
  );
}
