import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getSchoolSettings, getUsers } from "@/lib/students";
import { listAuditLogs } from "@/lib/audit";
import LogoutButton from "../LogoutButton";
import SettingsForm from "./SettingsForm";
import UserCreateForm from "./UserCreateForm";
import LogoUpload from "./LogoUpload";
import ClearanceRules from "./ClearanceRules";
import SchoolRoleManager from "./SchoolRoleManager";
import { SCHOOL_PERMISSION_CATALOG } from "@/lib/schoolPermissions";
import { listSchoolRoles } from "@/lib/schoolRoles";
import AuditLogPanel from "./AuditLogPanel";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const canManageUsers = session.isSuperAdmin || session.permissions.includes("users.manage");
  const canManageSchoolSettings = session.isSuperAdmin || session.permissions.includes("school.settings.manage");
  const canViewClearance = session.isSuperAdmin || session.permissions.includes("clearance.view") || session.permissions.includes("clearance.manage");
  const canManageClearance = session.isSuperAdmin || session.permissions.includes("clearance.manage");
  const canViewAudit = session.isSuperAdmin || session.permissions.includes("audit.view");
  const canViewSettings = canManageUsers || canManageSchoolSettings || canViewClearance || canViewAudit;
  if (!canViewSettings) return <div className="app-shell"><header className="topbar"><Link className="brand" href="/"><span className="brand-mark">S</span><span>Sirius</span></Link><LogoutButton /></header><main className="dashboard"><div className="empty-state"><strong>Access denied.</strong><p>Your school role does not have permission to manage this workspace.</p></div></main></div>;
  let school = null; let users = []; let roles = []; let auditLogs = [];
  try {
    const [schoolInfo, schoolUsers, schoolRoles, schoolAudit] = await Promise.all([
      canManageSchoolSettings || canManageUsers ? getSchoolSettings(session.school_id) : Promise.resolve(null),
      canManageUsers ? getUsers(session.school_id) : Promise.resolve([]),
      canManageUsers ? listSchoolRoles(session.school_id) : Promise.resolve([]),
      canViewAudit ? listAuditLogs(session.school_id, 100) : Promise.resolve([]),
    ]);
    school = schoolInfo;
    users = schoolUsers;
    roles = schoolRoles;
    auditLogs = schoolAudit;
  } catch (error) { console.error("Settings page load failed", error); }
  return <div className="app-shell"><header className="topbar"><Link className="brand" href="/"><span className="brand-mark">S</span><span>Sirius</span></Link><nav className="main-nav" aria-label="Main navigation"><Link href="/">Overview</Link><Link href="/students">Students</Link><Link href="/import">Import</Link><Link href="/cards">Cards</Link><Link className="active" href="/settings">Settings</Link></nav><LogoutButton /></header><main className="dashboard settings-page"><div className="page-title"><div><p className="eyebrow">Workspace administration</p><h1>Settings</h1><p className="intro-copy">Manage the parts of your workspace granted to your role.</p></div></div>{canManageSchoolSettings && school && <LogoUpload logoUrl={school.logo_url} />}{canManageUsers && <UserCreateForm roles={roles} isSuperAdmin={session.isSuperAdmin} />}{school && (canManageSchoolSettings || canManageUsers) && <SettingsForm school={school} users={users} roles={roles} currentUserId={session.id} isSuperAdmin={session.isSuperAdmin} canManageSchoolSettings={canManageSchoolSettings} canManageUsers={canManageUsers} />}{session.isSuperAdmin && <SchoolRoleManager permissionCatalog={SCHOOL_PERMISSION_CATALOG} />}{canViewClearance && <ClearanceRules canManage={canManageClearance} />}{canViewAudit && <AuditLogPanel logs={auditLogs} />}</main></div>;
}