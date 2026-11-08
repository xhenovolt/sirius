export const SCHOOL_PERMISSION_CATALOG = [
  { key: "dashboard.view", label: "View dashboard" },
  { key: "students.view", label: "View student records" },
  { key: "students.manage", label: "Create and edit student records" },
  { key: "imports.view", label: "View import history and staged rows" },
  { key: "imports.manage", label: "Upload, edit, commit, and roll back imports" },
  { key: "cards.view", label: "View and issue student cards" },
  { key: "cards.manage", label: "Design school card templates" },
  { key: "clearance.view", label: "View clearance rules and allowances" },
  { key: "clearance.manage", label: "Manage clearance rules and allowances" },
  { key: "users.manage", label: "Create and manage school users" },
  { key: "school.settings.manage", label: "Manage school identity and logo" },
  { key: "audit.view", label: "View the school audit log" },
];

export const SCHOOL_PERMISSION_KEYS = SCHOOL_PERMISSION_CATALOG.map(({ key }) => key);

export const DEFAULT_ROLE_PERMISSIONS = {
  admin: SCHOOL_PERMISSION_KEYS,
  bursar: ["dashboard.view", "students.view", "imports.view", "cards.view", "clearance.view", "clearance.manage"],
  operator: ["dashboard.view", "students.view", "imports.view", "cards.view", "clearance.view"],
};

export function sanitizeSchoolPermissions(value) {
  if (!Array.isArray(value)) return null;
  const permissions = [...new Set(value)];
  if (permissions.some((permission) => !SCHOOL_PERMISSION_KEYS.includes(permission))) return null;
  return permissions;
}

export function hasSchoolPermission(session, permission) {
  return Boolean(session && (session.isSuperAdmin || session.permissions?.includes(permission)));
}
