/**
 * Control Center — access control catalog.
 *
 * Every screen of the Control Center is an AREA, and every area has its own
 * actions (view / create / edit / delete, plus a few specific ones such as
 * impersonate or suspend). A permission is `<area>.<action>`.
 *
 * Who holds what:
 *   • XHENVOLT_SUPER_ADMIN — everything, always. Cannot be restricted, so the
 *     platform owner can never lock themselves out.
 *   • Everyone else — the explicit permission list stored on their operator
 *     record (control_users.permissions), chosen in Control Center →
 *     Operators. Operators created before per-person permissions existed have
 *     no list yet and keep their role's preset until one is saved.
 *
 * Reads are permission-gated exactly like writes: an operator without
 * `<area>.view` cannot load that area's data, not just its menu link.
 *
 * `controlCan` is PURE and unit-tested.
 */

export const CONTROL_AREAS = [
  { key: 'dashboard', label: 'Dashboard', group: 'Overview', pages: ['/control/dashboard'],
    description: 'Platform overview: totals, alerts and recent activity.',
    actions: { view: 'See the dashboard and platform alerts' } },

  { key: 'schools', label: 'Schools', group: 'Schools', pages: ['/control/schools'],
    description: 'School records, subscriptions and lifecycle.',
    actions: {
      view: 'See schools and their details',
      create: 'Provision (create) new schools',
      edit: 'Change a school\'s plan and subscription',
      suspend: 'Suspend or reactivate a school',
      delete: 'Archive and soft-delete schools',
      hard_delete: 'Permanently delete a school and ALL its data',
      impersonate: 'Sign in to a school as its administrator',
    } },

  { key: 'plans', label: 'Plans', group: 'Schools', pages: ['/control/plans'],
    description: 'The subscription plan catalog.',
    actions: { view: 'See plans', create: 'Create plans', edit: 'Edit plans', delete: 'Delete plans' } },

  { key: 'operators', label: 'Operators', group: 'Access & security', pages: ['/control/operators'],
    description: 'Control Center users and what each of them may do.',
    actions: {
      view: 'See operators and their permissions',
      create: 'Add operators',
      edit: "Change operators' permissions, status and passwords",
      delete: 'Remove operators',
    } },

  { key: 'audit', label: 'Audit Log', group: 'Access & security', pages: ['/control/audit'],
    description: 'Who did what in the Control Center.',
    actions: { view: 'See the audit log' } },

  { key: 'settings', label: 'Platform Settings', group: 'Access & security', pages: ['/control/settings'],
    description: 'Platform-wide rules: free-trial thresholds and maintenance mode.',
    actions: { view: 'See platform settings', edit: 'Change platform settings' } },
];

/** Every permission, `<area>.<action>` → description. */
export const CONTROL_PERMISSIONS = Object.fromEntries(
  CONTROL_AREAS.flatMap((a) => Object.entries(a.actions).map(([act, d]) => [`${a.key}.${act}`, d])),
);

export const ALL_PERMISSIONS = Object.keys(CONTROL_PERMISSIONS);

/** Permissions no one but a super admin may hold — destructive or platform-wide. */
export const SUPER_ADMIN_ONLY = ['schools.hard_delete'];

/** Permission names from before per-area permissions, still accepted by controlCan. */
const LEGACY = {
  'platform.view': 'dashboard.view',
  'schools.manage': 'schools.edit',
  'plans.catalog': 'plans.edit',
  'impersonate': 'schools.impersonate',
  'operators.manage': 'operators.edit',
};

const views = (...keys) => keys.map((k) => `${k}.view`);

/** Ready-made permission sets the Operators screen offers as starting points. */
export const CONTROL_PRESETS = {
  viewer: {
    label: 'Viewer',
    description: 'Read-only: schools and plans. Changes nothing.',
    permissions: views('dashboard', 'schools', 'plans'),
  },
  support: {
    label: 'School support',
    description: 'Helps schools: sees schools, can sign in as a school.',
    permissions: [...views('dashboard', 'schools'), 'schools.impersonate'],
  },
  finance: {
    label: 'Finance',
    description: 'Plans, subscriptions and school lifecycle.',
    permissions: [...views('dashboard', 'schools', 'plans'), 'schools.edit', 'plans.edit'],
  },
  operator: {
    label: 'Operator (previous default)',
    description: 'Everything the old Operator role could do — most areas, except operators and settings.',
    permissions: [
      ...views('dashboard', 'schools', 'plans', 'audit'),
      'schools.create', 'schools.edit', 'schools.suspend', 'schools.delete', 'schools.impersonate',
      'plans.create', 'plans.edit', 'plans.delete',
    ],
  },
};

const ROLE_DEFAULTS = {
  XHENVOLT_SUPER_ADMIN: ALL_PERMISSIONS,
  XHENVOLT_OPERATOR: CONTROL_PRESETS.operator.permissions,
  XHENVOLT_VIEWER: CONTROL_PRESETS.viewer.permissions,
};

/**
 * Areas whose screens mix every school together (totals, platform logs, other
 * operators, plans, settings). An operator limited to some schools never holds
 * these: the data cannot be filtered to their schools, so they would see the
 * whole platform.
 */
export const PLATFORM_WIDE_AREAS = ['dashboard', 'plans', 'operators', 'audit', 'settings'];
const dropPlatformWide = (list) => list.filter((p) => !PLATFORM_WIDE_AREAS.includes(p.split('.')[0]));

/** Only known permission names, de-duplicated, never super-admin-only ones. */
export function sanitizePermissions(list) {
  if (!Array.isArray(list)) return [];
  const known = new Set(ALL_PERMISSIONS);
  return [...new Set(list.map(String))].filter((p) => known.has(p) && !SUPER_ADMIN_ONLY.includes(p)).sort();
}

/** PURE: the permissions a subject holds. Unknown role and no list → none. */
export function permissionsFor(subject) {
  const role = typeof subject === 'object' && subject ? subject.role : subject;
  if (role === 'XHENVOLT_SUPER_ADMIN') return ALL_PERMISSIONS;
  if (typeof subject === 'object' && subject && Array.isArray(subject.permissions)) {
    const own = sanitizePermissions(subject.permissions);
    // Holding any action in an area implies seeing it.
    for (const p of [...own]) { const v = `${p.split('.')[0]}.view`; if (!own.includes(v) && CONTROL_PERMISSIONS[v]) own.push(v); }
    return subject.schoolScope ? dropPlatformWide(own) : own;
  }
  const preset = ROLE_DEFAULTS[(role || '')] ?? [];
  return typeof subject === 'object' && subject?.schoolScope ? dropPlatformWide(preset) : preset;
}

/** PURE: may this subject perform this permission? Legacy names are accepted. */
export function controlCan(subject, permission) {
  const p = LEGACY[permission] ?? permission;
  return permissionsFor(subject).includes(p);
}

/** The area a Control Center path belongs to (longest page prefix wins). */
export function areaForPath(pathname) {
  let best = null; let len = -1;
  for (const a of CONTROL_AREAS) for (const p of a.pages) {
    if ((pathname === p || pathname.startsWith(`${p}/`)) && p.length > len) { best = a; len = p.length; }
  }
  return best;
}

/** PURE: may this subject open this Control Center page? Pages outside every area (own sessions) are open. */
export function canOpenPath(subject, pathname) {
  const a = areaForPath(pathname);
  return !a || controlCan(subject, `${a.key}.view`);
}
