# Sirius Progress

## 2026-11-07 — Step 0 recovery audit

### Scope and evidence

Read-only inspection of the current checkout plus `npm.cmd test` and
`npm.cmd run build`. No database migration or push was attempted: Step 0 permits
only tests/builds as exceptions to read-only work, and the configured database
has not been established as disposable.

Current `HEAD` is `172908c` (`Add platform Control Center over the multi-tenant
foundation`). The prior tenancy commit `b4e1f75` is in its history. The stash
list was empty. Before this report, the worktree contained the following
uncommitted files:

- Modified: `database/schema.sql`
- Modified: `src/app/api/settings/logo/route.js`
- Modified: `src/app/api/settings/route.js`
- Modified: `src/app/cards/page.js`
- Modified: `src/app/globals.css`
- Modified: `src/app/settings/page.js`
- Modified: `src/app/verify/[studentUid]/page.js`
- Modified: `src/components/control/icons.js`
- Modified: `src/lib/auth.js`
- Modified: `src/lib/entitlements.js`
- Modified: `src/lib/identity.js`
- Modified: `src/lib/imports.js`
- Modified: `src/lib/students.js`
- Untracked: `src/app/api/control-center/audit/route.js`
- Untracked: `src/app/api/control-center/sessions/route.js`
- Untracked: `src/app/control/audit/page.js`
- Untracked: `src/app/control/operators/page.js`
- Untracked: `src/app/control/sessions/page.js`
- Untracked: `src/app/control/settings/page.js`
- Untracked: `src/lib/schoolUsers.js`

`docs/` did not exist before this report. These changes were not reverted,
staged, or otherwise modified by the audit.

### (a) Verified

- `b4e1f75` added `assertTenantId`, `assertTenantSafe`, `queryTenant`,
  `queryTenantOne`, and `withTenantTransaction` in `src/lib/dbTenant.js`.
  The guard rejects a missing tenant and SQL text without `school_id`.
- Migration `004_platform_control.sql` defines separate platform operator,
  session, audit, login-attempt, settings, and subscription-plan tables.
  Control authentication uses `sirius_control` and those control tables;
  school authentication uses `sirius_session` and `sessions`/`users`.
  Control API handlers inspected use `requireControl` for protected actions.
  No middleware file/matcher was found.
- `checkCapacity` is called from school-user creation, import commit, and card
  issuance (`src/lib/auth.js`, `src/lib/imports.js`, `src/lib/identity.js`).
- The school session code writes a throttled `sessions.last_seen_at` heartbeat.
- No school-side API handler was found reading a tenant ID directly from
  `body.school_id`, `body.schoolId`, or a school_id query parameter. Platform
  Control Center school-management endpoints do accept a target `school_id`;
  they authenticate a control operator and enforce that operator's school
  scope, which is distinct from taking a school tenant from a school user's
  request.

### (b) Claimed but false in the current checkout

- Tenant scoping is not consistently enforced. The uncommitted
  `src/lib/students.js` has reverted to the old no-tenant function signatures
  and unscoped student/user reads, including `WHERE school_id = 'default'`.
  Other current code paths also use raw `getDb().query()`/connection queries
  for tenant tables instead of the scoped layer. Explicit SQL predicates in
  some of those paths do not satisfy the stated single-layer requirement.
- The current schema still declares `UNIQUE KEY students_uid_unique
  (student_uid)`. It also declares the desired per-school unique key on
  `(school_id, admission_number)`, but the global student-UID uniqueness
  remains a cross-school constraint. The uncommitted schema change also
  reintroduces `DEFAULT 'default'` on `students.school_id`.
- The request to eliminate hardcoded `default` tenant values is not met:
  current source contains hardcoded default-school reads/writes, and
  migrations 002/003 backfill or seed the `default` tenant. The exact existing
  default remains in the baseline schema.
- The test suite contains no real-database tenant leak suite. The student test
  uses a stubbed executor; the identity test uses an in-memory executor; the
  import tests are pure normalization/validation tests. They do not prove
  isolation across two database tenants or the listed operations/tables.
- The prior commit's guard is a SQL-text check for the substring
  `school_id`, not proof that the predicate is correctly bound or present.
  Its test only asserts that SQL lacking that substring throws.
- The migration runner applies numbered migrations using a database ledger,
  but migrations were not run in this audit. Migrations 001-004 require the
  base tables in `database/schema.sql`; the runner itself does not initialize
  that base schema. Migration 003 uses `ADD INDEX` without an `IF NOT EXISTS`
  guard, so manually re-running its SQL after the index exists is not
  idempotent. No fresh-database application or re-run was verified.
- The claimed push failure was not independently verified; no push was
  attempted, and no remote configuration was changed.

### (c) Half-done

- The untracked `src/lib/schoolUsers.js` starts implementing school-user
  lifecycle operations, but the settings API still uses its older inline
  actions rather than wiring those helpers. Its `countActiveAdmins` helper is
  not used to protect role changes, disable, or deletion; the lifecycle
  mutation helpers do not themselves enforce self/last-admin rules or audit
  each change. No completed lifecycle tests were found.
- `src/app/api/settings/route.js` still promotes/demotes by updating legacy
  `users.role`, while `src/lib/auth.js` derives admin authorization from
  `user_roles`. Therefore changing that column does not grant/revoke the role
  used by authorization.
- Presence has a heartbeat in school auth and a five-minute calculation in
  the old user-list query, but the current uncommitted `getUsers` ignores its
  school argument and has no tenant filter. The school UI only shows an online
  indicator; the required separately displayed active/enabled status and
  complete control-operator presence view are not verified as implemented.
- `admission_number` remains the student natural-key field and `student_uid`
  remains globally unique. The planned rename and uniqueness migration are
  still deferred.

### (d) Broken / validation results

- `npm.cmd run build` **fails**. Confirmed errors:
  `src/app/control/dashboard/page.js` imports `ShieldCheck`, which is not
  exported by the current `src/components/control/icons.js`; and the
  uncommitted `src/app/api/settings/logo/route.js` imports `requireAdmin`,
  which `src/lib/auth.js` does not export (`requireSchoolAdmin` is exported).
- `npm.cmd test` **fails**: 14 tests pass, but `src/lib/students.test.js` fails
  at module load because `src/lib/students.js` imports `./db` without the
  `.js` extension, which Node ESM cannot resolve here. The test file's fake
  executor is also written for tenant-scoped calls, unlike the current
  uncommitted implementation.
- Since the production build fails, a meaningful start check was not
  possible. No application server was started.
- Migration application was not run; see scope above.

### (e) Risks

- The current uncommitted student helpers and settings/logo handler include
  unscoped or hardcoded-default tenant operations. The schema default can also
  silently place a missing-tenant student write in the default school.
- Global student UID uniqueness can cause cross-school collisions. The
  existing import path still matches on `(school_id, admission_number)`, so
  the schema and application natural-key contract are inconsistent.
- Control-plane authentication has its own cookie and session store, but the
  absence of middleware means protection depends on each page/API boundary;
  API handlers inspected are permission-guarded, while the control shell's
  client-side session check is not itself an authorization boundary.
- `checkCapacity` intentionally fails open when plan/usage data cannot be
  resolved, preserving basic school operation. This can bypass configured
  limits during database/configuration faults; tests covering this policy were
  not found.
- Migration execution against the configured `.env.local` database would
  mutate that database, so its safety and current schema state remain
  unknown.

### (f) Open questions

- Is there a disposable TiDB database available for fresh-schema migration,
  idempotency, and real cross-tenant leak tests?
- Has that database already applied migrations 001-004? This was not queried.
- Is the uncommitted work the intended interrupted agent work, and should it
  be preserved as the input to Step 1 stabilization? It was left untouched.

### Next

Stop for approval before Step 1. No source fixes, database operations, or
remediation commits were made as part of this audit.
