import { getSession, hasSchoolPermission } from "@/lib/auth";
import { getUsers } from "@/lib/students";
import { listSchoolRoles } from "@/lib/schoolRoles";
import AccessDenied from "@/components/shell/AccessDenied";
import PageHeader from "@/components/shell/PageHeader";
import EmptyState from "@/components/shell/EmptyState";
import UserCreateForm from "./UserCreateForm";
import UsersPanel from "./UsersPanel";

export const dynamic = "force-dynamic";

export default async function UsersSettingsPage() {
  const session = await getSession();
  if (!hasSchoolPermission(session, "users.manage")) return <AccessDenied />;
  let users = [];
  let roles = [];
  let databaseError = false;
  try {
    [users, roles] = await Promise.all([
      getUsers(session.school_id),
      listSchoolRoles(session.school_id),
    ]);
  } catch (error) {
    console.error("Users settings load failed", error);
    databaseError = true;
  }
  return (
    <main className="dashboard settings-page">
      <PageHeader eyebrow="Workspace administration" title="Users" intro="Invite teammates and control what each person can do." />
      {databaseError ? <EmptyState title="Unable to load users.">Please check the database connection and try again.</EmptyState> : <div className="settings-grid"><UserCreateForm roles={roles} isSuperAdmin={session.isSuperAdmin} /><UsersPanel users={users} roles={roles} currentUserId={session.id} isSuperAdmin={session.isSuperAdmin} /></div>}
    </main>
  );
}