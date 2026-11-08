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

## 2026-11-08 — Step 7 versioned card designer

### Done

- Added immutable per-school card template versions. Each save increments the
  template version under a school-scoped transaction; historical versions
  remain selectable.
- Added a browser designer for card title, physical dimensions, colors,
  available fields, and field order. HTML/CSS output supports print and
  browser “Save as PDF”.
- The server and client share an allowlisted template schema. Fee balance,
  arbitrary HTML/CSS, unrecognized fields, duplicate fields, and unsafe design
  values are rejected. Card data loading does not select fee balance.
- Template changes are restricted to school admins and audited.

### Verification

- `npm.cmd test`: passed, 48 tests, including template field validation and
  immutable version creation.
- `npm.cmd run build`: passed; the card designer and template API compiled.
- `git diff --check`: passed.
- Migration 012 and template persistence were not exercised against TiDB;
  no disposable test database is configured.

### Next / known issues

- Step 8 hardening remains: real-database tenancy isolation, migrations and
  transactional flows, logging, backups, and deployment checklist.
- Migrations 007-012 are still unverified against a dedicated TiDB database;
  previously printed UID-based QR cards still need reprinting.

## 2026-11-08 — Step 8 repository hardening and deployment checklist

### Done

- Added a staging-first deployment checklist covering secret handling,
  migrations, TiDB backups and restore drills, tenancy testing, verification
  privacy, clearance behavior, card printing, and release smoke tests.
- Confirmed `.env*` is ignored, the repository source has no `NEXT_PUBLIC_*`
  database credentials, and token verification audit records do not persist
  raw QR tokens.
- Re-ran the complete repository test suite and production build.

### Verification

- `npm.cmd test`: passed, 48 tests. Current tenancy integration tests still
  mock the database.
- `npm.cmd run build`: passed.
- `git diff --check`: passed.
- No migration command or database mutation was run.

### Next / known issues

- **Blocked pending a dedicated disposable TiDB target:** migrations 007-012
  and real two-school isolation/transaction tests have not been run. Configure
  that test database before claiming Step 2 and database hardening complete.
- Backup policy, restore drill, monitoring, and deployment ownership must be
  confirmed for the actual TiDB hosting environment; this repository cannot
  verify provider-side operations.

## 2026-11-08 — Configured TiDB migrations applied

- Correcting the earlier mistaken assumption that the configured database
  could not be inspected: a read-only connection using `.env.local` succeeded
  and identified TiDB Serverless 8.5.3. The migration ledger initially
  contained only 001 and 002.
- Preflight checks found no duplicate per-school student account numbers or
  student UIDs, and no audit rows missing a school.
- `npm.cmd run migrate` applied migrations 003 through 012 successfully.
  Follow-up read-only verification found all 12 migration records, the
  `student_account_no`/fee-balance/version columns, the composite
  `(school_id, student_account_no)` unique key, no global student UID unique
  index, and the expected control, clearance, import, and card-template tables.
- This confirms the configured TiDB schema was migrated; it does not verify
  that a separately deployed application points to this database. No backup
  or restore drill was performed. Real two-school isolation tests remain
  outstanding.

## 2026-11-08 — Import fee-balance review and history

### Done

- Added fee-balance header aliases and import review editing/mapping.
- Import validation rejects negative values, more than two fractional digits,
  excess precision, and non-numeric formats. Values normalize as exact decimal
  strings; no floating-point arithmetic is used.
- Blank fee-balance cells do not create a diff or clear an existing balance.
  New records default to zero unless a reviewed balance is accepted.
- Accepted import balances are written with their student update in the import
  transaction and recorded in `fee_balance_history`, attributed to the acting
  school user. Batch rollback restores the old balance and adds a reversal
  history entry.

### Verification

- `npm.cmd test`: passed, 51 tests, including fee parsing, validation, review,
  acceptance, and blank-cell preservation.
- `npm.cmd run build`: passed.
- `git diff --check`: passed.

### Next / known issues

- Add and run a real-TiDB two-school integration suite against a dedicated test
  database. Do not use the production-configured database for fixtures.
- Production deployment/runtime verification and provider backup/restore
  operations are not confirmed by repository tests.

## 2026-11-08 — Opt-in real-TiDB isolation harness

### Done

- Added `npm.cmd run test:integration`, a real-service integration runner for
  two schools with overlapping student account numbers. It covers scoped
  student reads/cards, duplicate prevention within a school, cross-school
  user listing/soft-delete, import source/version/mapping access, import
  commit/rollback, balance history, card issuance, and audit logs.
- The runner requires `.env.test.local`, a database name ending in `_test`,
  `_integration`, or `_ci`, and an explicit disposable-database confirmation.
  It refuses the same host/database as `.env.local`, verifies all migrations
  are applied, and only cleans up rows for its generated school IDs.
- Kept this runner out of default `node --test` discovery so unit tests do not
  require TiDB credentials.

### Verification

- `npm.cmd test`: passed, 51 tests.
- `npm.cmd run build`: passed.
- Integration runner syntax and `git diff --check`: passed.
- `npm.cmd run test:integration` correctly stopped before connecting because
  no `.env.test.local` test database is configured. Therefore the database
  assertions remain unrun; this harness does not use or mutate `.env.local`.

## 2026-11-08 — Tenant-scope school authentication writes

### Done

- Added migration 013 to attach password-reset codes to their owner's school,
  backfill existing rows, and add a school-scoped lookup index and foreign key.
- Scoped session writes, password-reset operations, and transactional school
  provisioning to the server-resolved school. Tenant transaction callbacks
  now receive only the scoped query interface.
- Password reset lookup now refuses ambiguous identifiers rather than
  selecting an arbitrary user when an email/phone collision exists.
- Updated the baseline schema and auth cleanup/integration fixture paths.

### Verification

- Read-only TiDB preflight found no orphaned or mismatched reset-code owners.
- Applied migration 013; verified its ledger entry, non-null `school_id`,
  scoped index, school foreign key, and zero mismatched rows.
- `npm.cmd test`: passed, 52 tests. `npm.cmd run build`: passed.
- Migration/auth script syntax checks and `git diff --check`: passed.

### Next / known issues

- The real two-school integration suite is still blocked until a separate,
  disposable TiDB target is configured in `.env.test.local`; production TiDB
  was not used for test fixtures.
- Provider backup/restore drills and deployed-runtime verification remain
  unconfirmed.

## 2026-11-08 — Password-reset ambiguity regression test

- Extracted the unique-user decision into a small pure helper and added a
  regression test for no match, one match, and cross-school ambiguity.
- `npm.cmd test`: passed, 53 tests. `npm.cmd run build` and `git diff --check`
  passed.

## 2026-11-08 — School account dropdown and profile view

- Replaced the navbar username's direct sign-out action with an accessible,
  responsive account dropdown containing the signed-in user's name/email,
  profile link, school settings link for administrators, and sign-out action.
- Added a session-protected read-only profile page showing the user's school
  membership and contact details. Control Center navigation remains separate.
- Verified with the unit suite, production build, and `git diff --check`.

## 2026-11-08 — School password recovery and SuperAdmin user controls

### Done

- Confirmed passwords do not automatically expire; school login sessions expire
  after seven days. The sign-in page now makes that distinction clear, and
  email login trims surrounding whitespace.
- Password recovery now looks up email exactly or matches normalized Uganda
  phone formats, checks the SMS provider's per-recipient delivery status, and
  invalidates a reset code if delivery fails so a retry is not blocked by the
  60-second outstanding-code throttle. The recovery form displays connection
  errors and explains that a valid mobile number is needed.
- Newly created and edited school users require a valid Uganda mobile number
  for SMS password recovery.
- School SuperAdmins can create and assign all seeded school roles, manage
  other SuperAdmins and all school users, and reset user passwords. Non-
  SuperAdmins cannot assign elevated roles or manage SuperAdmin accounts.
  Self-removal and last-active-admin guards remain enforced.
- User removal disables the account and hides it from the active user list.
  This behavior was not the requested deletion semantics; superseded by the
  2026-11-08 hard-delete correction below.
- Disabled the legacy bootstrap endpoint, which hard-coded a `default` tenant;
  school provisioning remains through signup.

### Verification

- `npm.cmd test`: passed, 61 tests, including phone normalization, role
  authorization, active-list removal, soft-delete, and session revocation.
- `npm.cmd run build` and `git diff --check`: passed.

## 2026-11-08 — Permanently delete school users

- Corrected the Delete action to physically delete the tenant-scoped user row.
  Existing foreign keys cascade role memberships, sessions, and password reset
  codes; audit entries remain, with the database setting their `user_id` to
  NULL while retaining the actor email and event details.
- Added migration 014 to purge accounts retained by the previous soft-delete
  behavior.
- A read-only preflight found one previously soft-deleted user; the migration
  found one role membership and no sessions, reset codes, or audit rows for
  that row. Applied migration 014; verified the database now has zero
  soft-deleted user rows and the migration runner reports up to date on rerun.
- Updated the confirmation dialog to state deletion is permanent and added
  coverage that the delete statement is constrained to the session's school.
- `npm.cmd test`: passed, 61 tests. `npm.cmd run build` and `git diff --check`
  passed.

## 2026-11-08 — Investigate repeated Jipra sign-in failures

- Read-only inspection of the configured database found five remaining Jipra
  users, all active with correctly structured bcrypt cost-12 hashes. Four have
  a successful initial login recorded and no recorded admin password reset.
  The application has no automatic password-age expiry; sessions expire after
  seven days. These checks do not prove what password a user submitted or what
  code is currently running on the deployed host.
- Found 20 existing Jipra `login.failed` audit rows, but none has a failure
  reason, so they cannot distinguish a password mismatch from an inactive
  account. The committed login route also attempted to audit failures without
  a school session, which the tenant-safe audit helper skips. Authentication
  now records known-account failures within that account's school, classifying
  only `password_mismatch` or `account_inactive`; unknown-account attempts are
  logged without identifying data. No password or hash is logged.
- Passed the HTTP request through to session creation so IP and user-agent
  context is available when a user successfully signs in.
- Added unit coverage for failure classification. Next diagnostic step is to
  inspect a failed attempt's `login.failed` audit entry and verify the deployed
  host is running the pushed commit. The configured environment has no
  `APP_BASE_URL`, so the live deployment could not be checked from this
  workspace. The actual entered password cannot be inspected or logged safely.

## 2026-11-08 — Make school password strength platform-configurable

- Replaced the hard-coded 12-character school-account requirement with a
  Control Center policy. The default is six characters and no composition
  rules; control users with settings-edit permission can configure the minimum
  and optionally require uppercase, lowercase, a number, or a symbol.
- Enforced the policy in school signup, user creation, control-provisioned
  school admins, administrator password resets, and SMS self-service resets.
  Existing passwords remain usable until changed. Control Center operator
  passwords remain separate.
- Added policy guidance to school-facing password forms and corresponding
  validation tests. Policy writes now surface database errors rather than
  reporting a false successful save.

## 2026-11-08 — Phase A: diagnose `/cards` preparation failure

### Goal and scope

- Investigation only: trace card preparation, reproduce the observed error,
  compare the configured TiDB schema with repository migrations, and report
  the remaining production-only checks. No functional fix has been applied.
- Added temporary structured server logging in `src/app/cards/page.js`.
  It records the failing step, error class, code, and message, but not request
  secrets, tenant IDs, SQL parameters, or QR tokens. The browser continues to
  receive the same generic message.

### Trace and confirmed root cause

- `CardsPage` resolves the school session and `cards.view` permission before
  entering its preparation `try` block. Inside the `try`, its first operation
  is `getAppBaseUrl()`, before any student/settings/template query, capacity
  read, token issuance, or client QR generation.
- The server log supplied during this investigation reports
  `step: "app_base_url"` and `APP_BASE_URL is not configured.` This confirms
  that the process producing that log has no usable `APP_BASE_URL`; that is
  the immediate cause of its `/cards` error. The environment supplying the log
  has not been independently identified as the Vercel Production project.
- Locally, `.env.local` also has no `APP_BASE_URL`. Calling the first
  preparation step reproduces the same `Error` and message. The configured
  TiDB is reachable, has 13 active students, and can serve the card-page
  student, school, and template reads. Its current card capacity is 120 with
  zero active identities; `checkCapacity(..., "cards")` allows issuance.
- Because the URL check runs first, the observed failing request never reaches
  TiDB or token insertion. The generic catch was hiding that ordering and
  previously logged an unstructured error object; the temporary structured log
  now exposes the failing step without exposing credentials or tokens.

### Hypothesis results

| Hypothesis | Result | Evidence |
|---|---|---|
| H1 — Vercel `APP_BASE_URL` / `TIDB_*` configuration | **CONFIRMED for the process in the supplied log**: `APP_BASE_URL` is absent. **Vercel settings themselves remain unverified.** | The supplied log identifies the exact missing variable. Local `TIDB_HOST`, `TIDB_PORT`, `TIDB_USER`, `TIDB_PASSWORD`, and `TIDB_DB` are present and a read-only TiDB connection succeeds. Vercel CLI is authenticated as `xhenonpro`, but the accessible project list has no Sirius project and this checkout has no `.vercel` project link. |
| H2 — missing `school_id` in a session | **RULED OUT for the supplied failure.** | Session resolution and the cards-permission gate happen before the logged `app_base_url` step. A cookie without a matching tenant-scoped session returns no session and redirects before this catch. The local DB contains a school and active users/sessions with matching tenant IDs. |
| H3 — production DB behind migrations | **UNVERIFIABLE for Vercel Production; ruled out for the configured local TiDB.** | The configured TiDB has all 15 repository migrations recorded and the required card, school, student, plan, setting, and session tables. The local database cannot be proven to be the database used by Vercel. The request in the supplied log fails before any DB access. |
| H4 — `checkCapacity` / plan configuration | **RULED OUT locally and for the supplied request.** | Local capacity is 120/0 and permits issuance. The cards flow fails at the earlier URL check. Capacity reads default open when plan/settings are absent or unreadable; that behavior does not produce this configuration exception. Production plan state is not independently checked. |
| H5 — TiDB TLS, pooling, or serverless connections | **RULED OUT locally; UNVERIFIABLE in Vercel.** | The configured TiDB accepts the current TLS 1.2 connection and scoped reads. The module uses one pool per process with a limit of 10 connections; serverless-wide connection pressure remains an operational risk, but it is not the observed failing step. |
| H6 — Vercel ephemeral filesystem | **RULED OUT for this failure path.** | Card preparation does not write files. Photo/logo uploads use Cloudinary, and no local filesystem write calls were found in `src/`. Those upload integrations are independent of card generation. |
| H7 — Next.js 16 API/runtime misuse | **RULED OUT by current code/build for this failure.** | `cookies()` and dynamic route `params` are awaited; the cards page has no Edge runtime override; Node crypto is used in server-side code and QR rendering is in a Client Component. The production build passes. The observed error is thrown by the explicit URL check. |
| H8 — QR schema constraints or no students | **RULED OUT as the immediate cause; insertion constraints were not exercised.** | Local TiDB has 13 active students. `qr_identities.school_id` and `student_id` are NOT NULL, the token column holds the generated 43-character token, and `public_token` is globally unique. There are currently zero active QR identities because the earlier URL failure prevents issuance. No test token was inserted into the configured database. |

### APP_BASE_URL behavior and transfer/offline implications

- `getAppBaseUrl()` reads only `process.env.APP_BASE_URL`; it has no Vercel
  hostname fallback. Missing configuration throws the exact exception above.
- It strips an optional HTTP(S) scheme and trailing slashes, accepts a
  hostname/optional-port shape, and always emits `https://`. It rejects paths,
  but currently accepts `localhost` and invalid numeric ports (for example
  `99999`); it does not enforce production HTTPS input or verify a canonical
  domain. The QR builder correctly emits `/v/{opaque_token}` and the URL
  builder tests cover the standard hostname and path rejection.
- The QR contract requires an absolute HTTPS link to the live record, so a
  public base URL is inherently required when rendering a scannable card.
  Printed cards work as physical cards offline, but live verification cannot:
  scanning requires network access to the active Sirius domain. If the
  deployment domain changes, newly generated QR links can use the new
  hostname, but already-printed cards still point at the old hostname. Keep
  the old domain redirecting to `/v/{token}` or reprint those cards.
- The immediate minimal production unblock is to configure the Production
  environment variable `APP_BASE_URL` as the public hostname
  `sirius-psi-three.vercel.app` and redeploy. This does not yet solve local
  hostname validation or domain migration policy; those need a deliberate
  follow-up choice. No setting or source-code fix has been applied in this
  investigation phase.

### Golden-path status (code evidence, not production smoke-tested)

| Step | Existing implementation | Gap / acceptance before calling it working |
|---|---|---|
| 1. Admin login and tenant | School sessions are tenant-scoped; the local DB has active users and sessions. | No production login was performed, and the accessible Vercel scope does not expose the Sirius project. Verify an actual school-admin login and tenant. |
| 2. Import/review sample spreadsheet | Deterministic suggestions, staged-row editing, old/new field diffs, row/field decisions, and transactional commit exist. | Tested the requested headers. `class`, `stream`, `fees balance`, and `photo` map; `hometel` is only a data-shape suggestion. `account number` is only a data-shape suggestion. `full name` does not provide required `first_name`/`last_name`; `father`, `stdtype`, and `status` do not map. Clarify what `stdtype` and `status` mean before mapping them. Acceptance: upload the sample, confirm mapping, review the actual diff, accept selected changes, and verify commit. |
| 3. Student listing/edit | Tenant-scoped listing/profile and optimistic-version student editing with server validation/audit are implemented and covered by tests. | Verify the committed sample rows appear and an edit persists in the deployed DB with a stale-version conflict tested. |
| 4. Card generation/designer | Opaque 256-bit tokens, stable token reuse, capacity checks, layout fields/toggles, and fee-free card templates are implemented. | Currently blocked by absent `APP_BASE_URL` in the server process from the supplied log. Local DB contains no active identities. After config is fixed, verify QR contents and that fees never render. |
| 5. Scan/verification | Unit tests cover same-school full records, public allowlisted fields, clearance, and indistinguishable invalid/unknown/revoked results. | No live token has been issued in the configured DB, so deployed scan behavior is unverified. Test both a logged-in same-school verifier and public/bad-token requests. |
| 6. Print/PDF | Browser print and print-specific CSS exist. | No real-browser print/PDF smoke test has been performed. Verify card size, QR scannability, and that controls/fee balance are absent from print. |

### Gated next work (not started)

1. **Phase B1 — unblock configuration:** after approval, set and validate the
   canonical production URL and test card issuance without exposing token
   values. Acceptance: `/cards` renders all eligible students, persisted
   identities are reused on refresh, and QR URLs target the live `/v/{token}`
   route. Decide whether local development uses an explicit local URL or a
   trusted request origin; do not blindly trust arbitrary `Host` headers.
2. **Phase B2 — prevent opaque failures:** classify CONFIG, DATABASE,
   TENANT/SESSION, ENTITLEMENT, STORAGE, and UNEXPECTED errors; retain safe
   browser messages and add request-correlated server logs. Add startup/first
   use config validation and tests for missing, malformed, localhost, and
   production URL cases.
3. **Phase B3 — close the golden-path import gap:** confirm the intended
   semantics of `stdtype` and `status`, then implement/test the sample
   `full name`, `father`, `hometel`, and other approved mappings. Acceptance:
   stage, diff, selectively accept, commit, and verify the imported values.
4. **Phase B4 — release safeguards:** protected health diagnostics, migration
   version verification, safe entitlement fallback coverage, and a production
   smoke script/checklist. Do not add Control Center product features.
5. **Phase C — production golden path:** run the six manual acceptance steps
   above against the actual Vercel deployment and production DB; retain old
   domain redirects or reprint cards if the domain changes.

### Production-only evidence still needed

- The supplied log confirms the emitting server process lacks `APP_BASE_URL`.
  To independently verify Vercel Production, open the Vercel team/project
  that owns `sirius-psi-three.vercel.app` → **Settings → Environment
  Variables** and check only whether `APP_BASE_URL` exists for **Production**
  (do not share its value if it is sensitive). Also confirm the Production
  deployment was redeployed after the variable was set.
- In the same project, verify `TIDB_HOST`, `TIDB_PORT`, `TIDB_USER`,
  `TIDB_PASSWORD`, and `TIDB_DB` are present in Production without sharing
  values. From an authorized production DB connection, report only the
  migration count/latest migration name and presence of required tables; do
  not run fixtures or mutate QR rows.
- Production QR issuance, printing, and verification require an authorized
  school-admin session and a safe sample import; they cannot be proven from
  this workspace.

### Verification

- Read-only local TiDB checks: 15/15 migrations, all required tables present,
  13 active students, card capacity allows issuance, and card data/settings/
  template queries succeed. No QR identity was inserted.
- Local reproduction emitted the same structured `app_base_url` error as the
  supplied server log. Domain-only, scheme-prefixed, trailing-slash, localhost,
  invalid-port, and path input cases were checked; current validation accepts
  localhost and the invalid port.
- `npm.cmd test`: passed, 70 tests.
- `npm.cmd run build`: passed; `/cards` compiled in the production route build.
- `git diff --check`: passed. Phase A report and diagnostic logging are ready
  for commit; no functional fix has been made.

## 2026-11-08 — Configure QR website origin in Control Center

- Added a public website URL field to Control Center → Platform Settings.
  Control operators with `settings.edit` can save the deployment's public
  hostname to the existing global `platform_settings` key-value table; updates
  use the existing platform audit log. No migration or school-level URL input
  is needed.
- `/cards` now uses the saved platform URL first and `APP_BASE_URL` as a
  backwards-compatible fallback. The selected origin is passed explicitly to
  QR URL generation; setting a database hostname or relative API path is not
  supported.
- URL validation canonicalizes hostnames to HTTPS, rejects paths, credentials,
  query/fragment components and invalid ports, and requires HTTPS/non-localhost
  in production. HTTP localhost remains available for local development.
- Updated the deployment checklist to configure the origin through the UI.
  Existing printed cards are unchanged; old domains must keep redirecting or
  cards must be reprinted after a domain change.
- Validation: `npm.cmd test` passed (71/71); `npm.cmd run build` passed;
  `git diff --check` passed. Production Control Center saving and QR issuance
  still need an operator session and deployment smoke test.
