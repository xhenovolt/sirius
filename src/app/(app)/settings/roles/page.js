import { getSession } from "@/lib/auth";
import { SCHOOL_PERMISSION_CATALOG } from "@/lib/schoolPermissions";
import AccessDenied from "@/components/shell/AccessDenied";
import PageHeader from "@/components/shell/PageHeader";
import SchoolRoleManager from "./SchoolRoleManager";

export const dynamic = "force-dynamic";

export default async function RolesSettingsPage() {
  const session = await getSession();
  if (!session?.isSuperAdmin) return <AccessDenied />;
  return (
    <main className="dashboard settings-page">
      <PageHeader eyebrow="Workspace administration" title="Roles" intro="Define custom roles and choose exactly which permissions each one grants." />
      <SchoolRoleManager permissionCatalog={SCHOOL_PERMISSION_CATALOG} />
    </main>
  );
}