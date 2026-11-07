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

## 2026-11-07 — Step 1 stabilization

### Done

- Fixed production-build import errors: the dashboard uses the existing
  `Shield` icon, and the school logo handler uses `requireSchoolAdmin`.
- Restored session-scoped student/settings/card reads and passed the signed-in
  school ID through all affected school pages. Public verification retains its
  separate, limited-column lookup.
- Scoped school settings and logo writes; restored the logo-update audit event.
- Corrected the settings page's admin check to use the role-derived
  `session.isSuperAdmin` value.
- Removed the incomplete, unused `src/lib/schoolUsers.js` helper so the
  lifecycle work can be completed coherently in Step 3 rather than left as a
  misleading partial implementation.
- Repaired the fresh-schema definition: student `school_id` has no default,
  and `audit_logs` is again included in `database/schema.sql`.
- Restored accidentally deleted import-review, documentation-table, and audit
  styles in `src/app/globals.css`.

### Verification

- `npm.cmd test`: passed, 20 tests / 20 passing. The student test uses a mock
  executor; identity tests use an in-memory executor; import tests cover
  normalization/validation only. No real-database isolation test exists yet.
- `npm.cmd run build`: passed; Next.js 16.3.4 compiled and generated the
  production route table.
- `git diff --check`: passed.
- No migration or database operation was run.

### Next / known issues

- Step 2 remains open: global uniqueness of `student_uid`, real-DB tenant leak
  coverage, and a stronger demonstration of the tenant guard.
- Some tenant-table paths outside the repaired student/settings helpers still
  use raw database access; inventory and remediation are Step 2 work.
- User promote/demote still changes the legacy `users.role` field rather than
  role membership; self/last-admin protection, complete lifecycle, and
  presence views remain for Step 3.
- Capacity checks still lack explicit tests for their fail-open policy.
- No production database availability/schema status was verified.

## 2026-11-07 — Step 2 partial; real-database gate blocked

### Done

- Added migration 005 to replace the global `student_uid` unique index with
  `UNIQUE(school_id, student_uid)`. The existing natural-key constraint remains
  `UNIQUE(school_id, admission_number)` until the planned Step 4 rename.
- Added migration-runner pre-checks for duplicate admission numbers and
  duplicate UIDs within a school. The runner inspects index state and safely
  resumes the migration if DDL partially applied.
- Added a rollback SQL file that restores the global index before removing the
  scoped index. If a global UID collision has appeared, adding the global
  index fails before the scoped index is dropped.
- Added a test proving `queryTenant` rejects SQL without `school_id` before
  calling the database executor.
- Source inspection found no school-user import lookup by admission number
  across schools; import matching is scoped by `school_id`.

### Verification

- `npm.cmd test`: passed, 21 tests / 21 passing. These tests are not a
  substitute for cross-tenant integration coverage.
- `npm.cmd run build`: passed.
- `node --check scripts/migrate.mjs`: passed.
- The migration has not been applied and no database was modified.

### Blocked / next

- The local `.env.local` has no dedicated `TIDB_TEST_HOST` or `TIDB_TEST_DB`;
  only the regular database configuration is present. It is not safe to use
  that unknown database for destructive integration fixtures.
- Step 2 is **not complete**. The requested real-database two-school leak
  suite across students, imports/files, audit, users, and card issuance has
  not been written or run. The duplicate pre-check, migration, and rollback
  have not been verified against TiDB.
- Do not proceed to Step 3 until a disposable test database is configured and
  the real-database leak suite passes.

## 2026-11-07 — Push attempt and phase gate

- Attempted the requested normal push of `main` to `origin`; GitHub returned
  HTTP 403 (`Permission to xhenovolt/sirius.git denied to xhenvolt-code`).
- No remote configuration or push workaround was changed. Commits
  `26f6361`, `8f87b0f`, and `c86261c` remain local and unpushed.
- Step 3 was not started: Step 2 still lacks the required disposable
  real-database tenant-isolation verification. Advancing would violate the
  stated "close tenancy gaps before any new feature" gate.

## 2026-11-07 — Step 3 school users and presence

### Done

- School admin checks now recognize either the school `superadmin` or `admin`
  role membership; a normal school admin can manage users without relying on
  the deprecated `users.role` authorization column.
- School user role changes now modify `user_roles` in a transaction and keep
  the display column synchronized, fixing the previous promote/demote no-op.
- Added server-side user profile edit, password reset, enable/disable, soft
  delete, role change, and session-logout actions. Changes are school-scoped;
  access-removing changes end active school sessions.
- A school-row lock serializes changes that could remove administrator
  access. Self-demotion, self-disable, self-delete, and removal/demotion/
  disablement of the last active administrator are rejected server-side.
- User list separates enabled/disabled/deleted state from online/offline
  presence. Presence uses active sessions seen within the existing five-minute
  window. Control Center's schools view shows enabled and online user counts
  separately for every school visible to the control operator.
- Added tests for self-delete and last-admin demotion guards.

### Verification

- `npm.cmd test`: passed, 24 tests / 24 passing.
- `npm.cmd run build`: passed.
- Server-side lifecycle responses are audited with the existing school audit
  logger.

### Next / known issues

- Step 2's real TiDB leak suite and migration verification are still not
  available because no dedicated disposable test database is configured.
  The caller explicitly requested continuing despite that gate; this
  implementation does not claim the database isolation requirement is proven.
- Remaining roadmap work: Step 4 student core, Step 5 import diff pipeline,
  Step 6 identity/verification/clearance, Step 7 card designer, Step 8
  hardening.

## 2026-11-07 — Step 4 student core

### Done

- Added migration 006 to rename `admission_number` to
  `student_account_no` in student and staged-import rows, check for duplicate
  numbers per school before the rename, and add the scoped unique key,
  `DECIMAL(14,2)` fee balance, and optimistic-concurrency version.
- Migration application is resumable across partial DDL completion. Existing
  staged JSON rows using the former field name remain readable; spreadsheet
  imports continue accepting legacy admission-number headers.
- Added append-only fee-balance history for manual create/edit operations.
  Imports preserve fee balances, and every student/profile/photo edit bumps the
  version. Student mutations and their audit records are committed together.
- Added individual student creation and profile editing. The imported/student
  account number is required input and is never generated; duplicate numbers
  are rejected within the school. Student UIDs generated for new records are
  random rather than derived from that number.
- Updated student search, import review, cards, scan/profile displays,
  verification output, and spreadsheet documentation to use the new field.
  The public verification response no longer returns the student number or
  gender and includes a data-as-of timestamp.

### Verification

- `npm.cmd test`: passed, 27 tests.
- `npm.cmd run build`: passed.
- `node --check scripts/migrate.mjs`, `node --check scripts/seed-demo.mjs`,
  and `git diff --check`: passed.
- Migration 006 was **not** applied: the configured database is not known to
  be disposable. Its TiDB execution and migration re-run behavior still need
  verification against a dedicated test database.

### Next / known issues

- Step 2's real-database two-school leak suite and migration verification are
  still outstanding; the current tests do not prove database isolation.
- Step 5 import versioning, richer column mapping, field-level diff/acceptance,
  and rollback remain next. Step 6 must still replace legacy QR identifiers
  with permanent public tokens and complete clearance verification behavior.
- The prior push was denied with HTTP 403. No remote or credential workaround
  was attempted; retry only after repository permissions are corrected.

## 2026-11-07 — Step 5a immutable import source and versions

### Done

- Import uploads now retain the original file bytes, file name, content type,
  and SHA-256 digest in tenant-scoped storage. This first version is immutable
  through the application.
- Initial staged rows are snapshotted as version 1. Each saved correction
  creates a compressed, immutable full-batch snapshot and advances the current
  version. The import review UI lists recent batches and provides original-file
  and per-version XLSX/CSV downloads, including after commit.
- Import staging, correction, and commit transactions now use the tenant-scoped
  transaction layer for each tenant-table query.

### Verification

- `npm.cmd test`: passed, 27 tests.
- `npm.cmd run build`: passed; the new authenticated version-download route
  compiled and was enumerated by Next.js.
- `node --check` on the changed import modules and `git diff --check`: passed.
- Migration 007 was not applied because no dedicated disposable TiDB database
  is configured. Source retention, snapshot export, and migration behavior
  have not been exercised against TiDB.

### Next / known issues

- Step 5 remains in progress: implement current-record diffs, row/field
  accept/reject, deterministic column mapping templates, and committed-batch
  rollback.
- The Step 2 real-database isolation suite and migration verification remain
  outstanding.

## 2026-11-07 — Step 5b import diffs and explicit decisions

### Done

- Import review joins staged rows to only the same school's current student
  record and classifies rows as NEW, CHANGED, UNCHANGED, DUPLICATE, or INVALID.
  Changed fields show current values alongside the proposed editable values.
- Reviewers can accept/reject rows, accept/reject individual changed fields,
  or bulk-accept/reject visible valid rows. Decisions persist with staged rows
  and are included in version snapshots. Commit now writes only accepted
  fields; unaccepted/rejected rows are skipped, and non-imported fee balances
  remain untouched.
- Corrected a field-level name merge case so accepting a first-name change
  cannot inadvertently apply a rejected last-name change to `full_name`.
- Added unit coverage for all diff classifications and partial name acceptance.

### Verification

- `npm.cmd test`: passed, 29 tests.
- `npm.cmd run build`: passed.
- `node --check` on the changed import modules and `git diff --check`: passed.
- Migration 008 was not run against TiDB; the live review flow has not been
  exercised against a real test database.

### Next / known issues

- Step 5 remains in progress: deterministic column mapping/confidence and
  saved school templates, plus rollback of a committed batch.
- Step 2 real-database tenant isolation testing and migration verification
  remain blocked on a dedicated disposable TiDB database.

## 2026-11-07 — Step 5c committed-batch rollback

### Done

- Import commit now records the pre-commit values and post-commit version for
  each accepted student in a tenant-scoped undo table, in the same transaction
  as the student changes.
- Added an authenticated rollback operation that checks the student version
  has not changed since commit. If any affected student was edited later, the
  entire rollback aborts. Existing students are restored; newly imported
  students are removed only if unchanged and not already issued a QR identity.
- Rollback restores staged-row status from the latest review snapshot, marks
  the batch rolled back, and writes its audit record atomically.

### Verification

- `npm.cmd test`: passed, 29 tests.
- `npm.cmd run build`: passed; the rollback endpoint was compiled.
- `node --check` on the changed import modules and route, and `git diff --check`:
  passed.
- Migration 009 and the actual rollback transaction were not run against
  TiDB; live transactional behavior remains unverified.

### Next / known issues

- Step 5 remains in progress: deterministic header matching/confidence,
  user-confirmed mapping, and saved school templates.
- Step 2's real-database isolation suite and all new migration verification
  remain outstanding because no disposable TiDB database is configured.

## 2026-11-07 — Step 5d deterministic import mapping

### Done

- Added deterministic header normalization, known-synonym and fuzzy matching,
  limited data-shape hints, confidence/reason reporting, and validation that
  required fields are mapped to distinct source columns.
- Import now analyzes an uploaded spreadsheet before staging. The review UI
  allows users to confirm/edit field mappings, apply a saved school template,
  and save the current mapping as a school-specific template. Empty files and
  malformed template JSON are rejected explicitly.
- Staging applies only the confirmed mapping. Student data remains unchanged
  until the existing import review/commit process.
- Added unit tests for synonym matching, fuzzy and data-shape suggestions,
  required fields, and duplicate source-column rejection.

### Verification

- `npm.cmd test`: passed, 32 tests.
- `npm.cmd run build`: passed; the import mapping screen and APIs compiled.
- `node --check` on changed import modules/routes and `git diff --check`:
  passed.
- Migration 010 and template persistence were not exercised against TiDB; the
  migration remains unapplied because no disposable test database is configured.

### Next / known issues

- Continue remaining Step 5 coverage and verify migrations/import transactions
  against a dedicated test database before claiming live database validation.
- The Step 2 real-database tenant isolation suite remains outstanding.

## 2026-11-08 — Step 6 identity verification and clearance

### Done

- Added migration 011 for tenant-scoped QR identities, school current term,
  per-student allowances, and scoped fee-threshold rules.
- Card QR codes now encode only an existing-or-once-issued 256-bit opaque
  token at `https://{APP_BASE_URL}/v/{token}`. Card creation respects the
  school card limit; no student number, internal id, or fee balance is encoded.
- Added live token verification. Same-school school users see the full record;
  public and cross-school visitors see only name, photo, class, school,
  clearance verdict, and data-as-of timestamp. Invalid, unknown, and revoked
  tokens share the same public response. Verification is noindex/no-referrer,
  records scan outcomes without storing raw tokens, and is limited to 60
  requests per minute per IP bucket.
- Added read-time clearance evaluation in Africa/Kampala time, using exact
  decimal comparisons and the required allowance, threshold, zero-balance,
  then outstanding-balance precedence. School admins can manage allowances,
  thresholds, and current term; changes are audited.
- Retired the legacy public student-UID verification page so it no longer
  exposes student data. Previously printed UID-based QR cards must be
  reprinted to use the opaque-token verification route.
- Added tests for time-zone boundary behavior, rule precedence/scopes/expiry,
  public field allowlisting, same-school full access, token outcomes, and
  rate limiting.

### Verification

- `npm.cmd test`: passed, 44 tests.
- `npm.cmd run build`: passed; `/v/[token]` and clearance APIs compiled.
- `node --check` on changed server modules and `git diff --check`: passed.
- Migration 011 and the live QR/clearance database transactions were not
  exercised against TiDB; no disposable test database is configured.

### Next / known issues

- Step 7: versioned school card templates and print/PDF designer. Keep fee
  balance unavailable to card templates.
- Step 2's real-database tenant isolation suite and migrations 007-011 live
  verification remain outstanding. Existing printed QR cards using
  `/verify/{student_uid}` need reprinting.
