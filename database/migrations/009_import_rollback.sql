-- Migration 009: retain pre-commit values for safe, conditional batch rollback.

ALTER TABLE import_batches
  MODIFY COLUMN status ENUM('preview', 'completed', 'failed', 'rolled_back') NOT NULL DEFAULT 'preview';

CREATE TABLE IF NOT EXISTS import_batch_undo (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id VARCHAR(64) NOT NULL,
  batch_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  existed_before TINYINT(1) NOT NULL,
  previous_record JSON NULL,
  committed_version BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY import_batch_undo_student_unique (school_id, batch_id, student_id),
  CONSTRAINT import_batch_undo_batch_fk FOREIGN KEY (batch_id) REFERENCES import_batches (id) ON DELETE CASCADE,
  CONSTRAINT import_batch_undo_student_fk FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
);
