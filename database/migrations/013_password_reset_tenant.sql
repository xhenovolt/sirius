-- Migration 013: bind password reset codes to their owning school.
-- The migration runner preflights orphaned/mismatched owners before applying.
ALTER TABLE password_reset_codes
  ADD COLUMN IF NOT EXISTS school_id VARCHAR(64) NULL AFTER user_id;

UPDATE password_reset_codes p
JOIN users u ON u.id = p.user_id
   SET p.school_id = u.school_id
 WHERE p.school_id IS NULL;

ALTER TABLE password_reset_codes
  MODIFY COLUMN school_id VARCHAR(64) NOT NULL;
