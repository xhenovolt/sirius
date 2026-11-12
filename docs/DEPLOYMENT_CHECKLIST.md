# Sirius deployment checklist

Use this checklist for a staging deployment first. Items marked **unverified**
must not be treated as production-ready evidence.

## Secrets and application configuration

- [ ] Keep database credentials in `.env.local` or the deployment secret store.
      Never commit them or expose them through `NEXT_PUBLIC_*`.
- [ ] Set `TIDB_HOST`, `TIDB_PORT`, `TIDB_USER`, `TIDB_PASSWORD`, and `TIDB_DB`.
- [ ] In Control Center → Platform Settings, set the public website hostname
      used for QR verification (for example `sirius-psi-three.vercel.app`).
      Production requires HTTPS; do not enter a database host or API path.
      The `APP_BASE_URL` environment variable remains an optional fallback.
      QR generation always emits an HTTPS `/v/{opaque-token}` URL.
- [ ] Confirm production TLS, secure school-session cookies, and control-plane
      cookie/session isolation.
- [ ] Verify the production origin and email/photo-storage configuration without
      printing secret values into build or deployment logs.

## Database, migrations, and backups

- [ ] Provision a dedicated disposable TiDB database using the same TiDB version
      and settings as production.
- [ ] Run migrations 001-012 against that test database; verify the migration
      ledger, expected schema, and safe repeat behavior. The migration runner
      reads `.env.local` and applies every unapplied migration, so verify the
      target before running `npm.cmd run migrate`.
- [ ] Check the 005/006 duplicate preconditions and the 011 QR-identity school
      backfill before applying migrations to any existing data.
- [ ] Verify `qr_identities.school_id` and all clearance/card-template tenant
      tables are non-null; inspect query plans for school-scoped lookup indexes.
- [ ] Configure TiDB automated backups or snapshots, retention, and point-in-
      time recovery. Record the responsible owner and recovery objective.
- [ ] Perform and record a restore drill into a separate database. Confirm
      imported source-file blobs and batch snapshots are included.
- [ ] **Unverified:** no disposable TiDB database is configured in the current
      workspace; migrations 007-012 and real transactional behavior have not
      been exercised here.

## Tenant isolation and authorization

- [ ] Run a real-database two-school suite with the same
      `student_account_no` in both schools. Verify read, edit, delete, import,
      source/version download, audit, user, and card-issuance isolation.
- [ ] Configure `.env.test.local` with a dedicated disposable TiDB using
      `TIDB_TEST_HOST`, `TIDB_TEST_PORT`, `TIDB_TEST_USER`,
      `TIDB_TEST_PASSWORD`, and `TIDB_TEST_DB` (which must end in `_test`,
      `_integration`, or `_ci`), and set
      `SIRIUS_TEST_DATABASE_CONFIRM=I_CONFIRM_THIS_IS_A_DISPOSABLE_TEST_DATABASE`.
      The runner refuses to target the same host/database as `.env.local` and
      only inserts/deletes uniquely named fixtures.
- [ ] After applying migrations to that dedicated database, run
      `npm.cmd run test:integration`. It tests two-school student and user
      isolation, import sources/versions/mappings/commit/rollback, audit reads,
      same-account-number tenancy, fee-history changes, and card issuance.
- [ ] Verify a tenant query without `school_id` fails before reaching TiDB.
- [ ] Confirm school id is derived from the authenticated school session, never
      request JSON, form data, URL parameters, or a school selector.
- [ ] Confirm school and control-operator authentication/session cookies remain
      separate.
- [ ] Verify user self-delete and last-admin removal/demotion protections.
- [ ] **Unverified:** the real database suite has not been run until its
      dedicated `.env.test.local` target is provisioned and the command passes.

## Identity, clearance, and cards

- [ ] Print a test card and confirm its QR contains only an HTTPS
      `/v/{random-token}` URL, not a student number or internal ID.
- [ ] Verify a same-school user sees the full record, while public and
      cross-school visitors see only name, photo, class, school, clearance
      verdict, and data-as-of time.
- [ ] Confirm invalid, unknown, and revoked tokens have identical public
      responses; verify `noindex`, `no-referrer`, and scan rate limiting.
- [ ] Check fee balances never appear on printed cards or in public verification
      responses. Test allowance, class/term threshold, expiry, and zero-balance
      precedence using Africa/Kampala dates.
- [ ] Print at the configured card dimensions and use the browser's
      **Save as PDF** option. Confirm no clipped fields and no fee balance.
- [ ] In `/cards/designer`, drag and resize the photo, title, and QR; set the
      title to a student field; save a new version, reopen it, and confirm the
      layout persists. Verify `/cards/designer/{templateId}` opens the selected
      school template only.
- [ ] Reprint previously issued cards that still encode the retired
      `/verify/{student_uid}` format.

## Release and operations

- [ ] Run `npm.cmd test` and `npm.cmd run build` on the release commit.
- [ ] Smoke-test signup/login, student edits, imports and rollback, QR issuance,
      public verification, clearance administration, and template version save.
- [ ] Confirm scan events do not store raw QR tokens and that operational logs
      do not include credentials or student records.
- [ ] Test rollback procedures: application rollback, forward-only database
      migration recovery, import batch rollback, and restoration from backup.
- [ ] Assign owners for database monitoring, backup alerts, security incidents,
      and recovery drills before production launch.
