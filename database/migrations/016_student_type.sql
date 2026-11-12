-- Migration 016: retain imported day/boarding classification for clearance cards.

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS student_type VARCHAR(32) NULL;
