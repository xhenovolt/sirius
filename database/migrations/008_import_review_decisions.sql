-- Migration 008: persist explicit row- and field-level import decisions.

ALTER TABLE import_rows
  ADD COLUMN IF NOT EXISTS review_decisions JSON NULL;
