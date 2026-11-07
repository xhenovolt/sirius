-- Migration 001: identity core.
-- Adds the QR identity, staging, photo and scan-audit tables required by the
-- permanent opaque token design. Idempotent: safe to run more than once.

-- Full extracted card JSON is preserved on the student record so that fields
-- which are not mapped to columns are never lost on re-import.
ALTER TABLE students ADD COLUMN IF NOT EXISTS card_extra JSON NULL;

-- Permanent opaque QR identity. One active token per student; tokens are issued
-- once and never regenerated on re-import. Revocation is recorded, not deleted,
-- so a revoked token can never silently become valid again.
CREATE TABLE IF NOT EXISTS qr_identities (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id BIGINT UNSIGNED NOT NULL,
  public_token VARCHAR(64) NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP NULL,
  revoked_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY qr_identities_token_unique (public_token),
  KEY qr_identities_student_index (student_id),
  KEY qr_identities_revoked_index (revoked_at),
  CONSTRAINT qr_identities_student_fk FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
);

-- Staging rows for a reviewed import. Parsed cards land here before anything is
-- written to students, so the commit step is the only writer of student data.
CREATE TABLE IF NOT EXISTS import_rows (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  batch_id BIGINT UNSIGNED NOT NULL,
  `row_number` INT UNSIGNED NOT NULL,
  admission_number VARCHAR(64) NULL,
  full_name VARCHAR(205) NULL,
  extracted JSON NULL,
  errors JSON NULL,
  photo_ref VARCHAR(500) NULL,
  status ENUM('pending', 'valid', 'invalid', 'committed', 'skipped') NOT NULL DEFAULT 'pending',
  student_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY import_rows_batch_row_unique (batch_id, `row_number`),
  KEY import_rows_batch_index (batch_id),
  KEY import_rows_status_index (status),
  CONSTRAINT import_rows_batch_fk FOREIGN KEY (batch_id) REFERENCES import_batches (id) ON DELETE CASCADE,
  CONSTRAINT import_rows_student_fk FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE SET NULL
);

-- Photo records are storage-agnostic (provider + key + public URL) so the
-- storage backend can change without a schema rewrite.
CREATE TABLE IF NOT EXISTS student_photos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id BIGINT UNSIGNED NOT NULL,
  storage_provider VARCHAR(32) NOT NULL DEFAULT 'cloudinary',
  storage_key VARCHAR(500) NULL,
  url VARCHAR(500) NOT NULL,
  content_type VARCHAR(100) NULL,
  byte_size INT UNSIGNED NULL,
  width SMALLINT UNSIGNED NULL,
  height SMALLINT UNSIGNED NULL,
  sha256 CHAR(64) NULL,
  source ENUM('upload', 'import', 'none') NOT NULL DEFAULT 'upload',
  is_primary TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY student_photos_student_index (student_id),
  KEY student_photos_primary_index (student_id, is_primary),
  CONSTRAINT student_photos_student_fk FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
);

-- One row per resolved-token request. Used for scan auditing and abuse
-- detection. The raw token is never stored here: only the outcome.
CREATE TABLE IF NOT EXISTS scan_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  qr_identity_id BIGINT UNSIGNED NULL,
  student_id BIGINT UNSIGNED NULL,
  school_id VARCHAR(64) NULL,
  outcome ENUM('resolved', 'unknown', 'revoked', 'invalid') NOT NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY scan_events_identity_index (qr_identity_id),
  KEY scan_events_student_index (student_id),
  KEY scan_events_outcome_index (outcome),
  KEY scan_events_created_index (created_at),
  CONSTRAINT scan_events_identity_fk FOREIGN KEY (qr_identity_id) REFERENCES qr_identities (id) ON DELETE SET NULL,
  CONSTRAINT scan_events_student_fk FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE SET NULL
);
