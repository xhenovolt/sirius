-- Migration 007: immutable import sources and staged-row version history.

ALTER TABLE import_batches
  ADD COLUMN IF NOT EXISTS current_version INT UNSIGNED NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS import_batch_files (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id VARCHAR(64) NOT NULL,
  batch_id BIGINT UNSIGNED NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  content_type VARCHAR(100) NOT NULL,
  sha256 CHAR(64) NOT NULL,
  file_data MEDIUMBLOB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY import_batch_file_unique (school_id, batch_id),
  CONSTRAINT import_batch_file_fk FOREIGN KEY (batch_id) REFERENCES import_batches (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS import_batch_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id VARCHAR(64) NOT NULL,
  batch_id BIGINT UNSIGNED NOT NULL,
  version_no INT UNSIGNED NOT NULL,
  snapshot LONGBLOB NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY import_batch_version_unique (school_id, batch_id, version_no),
  CONSTRAINT import_batch_version_fk FOREIGN KEY (batch_id) REFERENCES import_batches (id) ON DELETE CASCADE
);
