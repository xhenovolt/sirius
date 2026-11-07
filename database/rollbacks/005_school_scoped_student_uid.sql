-- Safe rollback for migration 005.
-- Add the global index first. If any UID is now shared by different schools,
-- this statement fails and leaves the scoped index in place.
ALTER TABLE students
  ADD UNIQUE KEY students_uid_unique (student_uid);

ALTER TABLE students
  DROP INDEX students_school_uid_unique;
