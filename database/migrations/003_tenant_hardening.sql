-- Migration 003: tenant hardening.
-- Removes the last tenant default so a missing school_id fails loudly instead
-- of silently landing in the 'default' school, and makes per-school audit
-- reads cheap. Applied once via the schema_migrations ledger.

-- students: no tenant default. A write that forgets school_id must error,
-- not quietly assign the row to the default school.
ALTER TABLE students MODIFY COLUMN school_id VARCHAR(64) NOT NULL;

-- audit_logs: reads are always scoped by school now. Backfill any legacy rows
-- and index the tenant column. The column stays NULLABLE on purpose: a
-- platform-level (superadmin) event may legitimately have no school.
UPDATE audit_logs SET school_id = 'default' WHERE school_id IS NULL;
ALTER TABLE audit_logs ADD INDEX audit_logs_school_index (school_id);
