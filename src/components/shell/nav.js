import { hasSchoolPermission } from "@/lib/schoolPermissions";

export const appNav = [
  { href: "/", label: "Overview", icon: "home", perm: "dashboard.view" },
  {
    label: "Students", icon: "users", perm: "students.view", items: [
      { href: "/students", label: "All students" },
      { href: "/students/new", label: "Add student", perm: "students.manage" },
    ],
  },
  {
    label: "Imports", icon: "upload", perm: "imports.view", items: [
      { href: "/imports", label: "History" },
      { href: "/imports/new", label: "New import", perm: "imports.manage" },
      { href: "/imports/files", label: "Stored files" },
    ],
  },
  {
    label: "Cards", icon: "card", perm: "cards.view", items: [
      { href: "/cards", label: "Issue & print" },
      { href: "/cards/designer", label: "Designer" },
      { href: "/cards/preview", label: "Preview" },
    ],
  },
  {
    label: "Clearance", icon: "badge", perm: "clearance.view", items: [
      { href: "/clearance", label: "Overview" },
      { href: "/clearance/allowances", label: "Allowances" },
      { href: "/clearance/thresholds", label: "Thresholds" },
    ],
  },
  {
    label: "Verification", icon: "qr", perm: "students.view", items: [
      { href: "/verify", label: "Scanner" },
      { href: "/verify/log", label: "Scan log" },
    ],
  },
  {
    label: "Settings", icon: "gear", items: [
      { href: "/settings/school", label: "School", perm: "school.settings.manage" },
      { href: "/settings/users", label: "Users", perm: "users.manage" },
      { href: "/settings/roles", label: "Roles", superadmin: true },
      { href: "/settings/audit", label: "Audit log", perm: "audit.view" },
    ],
  },
];

function itemAllowed(item, session) {
  if (item.superadmin) return Boolean(session.isSuperAdmin);
  if (item.perm) return hasSchoolPermission(session, item.perm);
  return true;
}

/** Role-aware menu, filtered on the server so hidden items never reach the client. */
export function filterNav(session) {
  const result = [];
  for (const entry of appNav) {
    if (entry.items) {
      const items = entry.items.filter((item) => itemAllowed(item, session));
      if (items.length) result.push({ label: entry.label, icon: entry.icon, items });
    } else if (itemAllowed(entry, session)) {
      result.push({ href: entry.href, label: entry.label, icon: entry.icon });
    }
  }
  return result;
}

/** Longest matching href wins, so /imports/new does not also light up History. */
export function activeHref(nav, pathname) {
  let best = null;
  for (const entry of nav) {
    for (const href of entry.items ? entry.items.map((item) => item.href) : [entry.href]) {
      if ((pathname === href || pathname.startsWith(`${href}/`)) && (!best || href.length > best.length)) best = href;
    }
  }
  return best;
}

const CRUMB_LABELS = {
  students: "Students", new: "Add student", imports: "Imports", files: "Stored files", grid: "Staged rows",
  cards: "Cards", designer: "Designer", preview: "Preview", batches: "Print batches",
  clearance: "Clearance", allowances: "Allowances", thresholds: "Thresholds",
  verify: "Verification", log: "Scan log",
  settings: "Settings", school: "School", users: "Users", roles: "Roles", audit: "Audit log",
  profile: "My profile",
};

export function breadcrumbs(pathname, schoolName) {
  const crumbs = [{ href: "/", label: schoolName || "Overview" }];
  const segments = pathname.split("/").filter(Boolean);
  let path = "";
  for (const segment of segments) {
    path += `/${segment}`;
    const label = CRUMB_LABELS[segment] || (/^\d+$/.test(segment) ? `#${segment}` : "Details");
    crumbs.push({ href: path, label });
  }
  return crumbs;
}