-- Migration 005: scope the generated student UID uniqueness to its school.
--
-- The school/admission-number unique key is already the natural-key constraint.
-- This additional composite key keeps generated UIDs unambiguous inside a
-- school without preventing different schools from using the same value.
-- scripts/migrate.mjs checks both scoped keys for duplicates before applying.
ALTER TABLE students
  ADD UNIQUE KEY students_school_uid_unique (school_id, student_uid);

ALTER TABLE students
  DROP INDEX students_uid_unique;
