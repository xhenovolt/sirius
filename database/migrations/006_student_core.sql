-- Migration 006: student core fields and tenant-scoped fee balance history.
-- scripts/migrate.mjs checks the scoped account-number uniqueness before DDL.

CREATE TABLE IF NOT EXISTS fee_balance_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id VARCHAR(64) NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  previous_balance DECIMAL(14, 2) NOT NULL,
  new_balance DECIMAL(14, 2) NOT NULL,
  changed_by BIGINT UNSIGNED NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'edit',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY fee_history_school_student_index (school_id, student_id, created_at),
  CONSTRAINT fee_history_student_fk FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
);
