-- Migration 011: tenant-scoped QR identities and read-time clearance rules.

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS current_term VARCHAR(64) NULL;

ALTER TABLE qr_identities
  ADD COLUMN IF NOT EXISTS school_id VARCHAR(64) NULL;

UPDATE qr_identities qi
JOIN students s ON s.id = qi.student_id
   SET qi.school_id = s.school_id
 WHERE qi.school_id IS NULL;

ALTER TABLE qr_identities
  MODIFY COLUMN school_id VARCHAR(64) NOT NULL;

ALTER TABLE scan_events
  MODIFY COLUMN outcome ENUM('resolved', 'unknown', 'revoked', 'invalid', 'rate_limited') NOT NULL;

CREATE TABLE IF NOT EXISTS clearance_allowances (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id VARCHAR(64) NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  allowed_until DATE NOT NULL,
  reason VARCHAR(500) NOT NULL,
  granted_by BIGINT UNSIGNED NOT NULL,
  granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  KEY clearance_allowance_student_index (school_id, student_id, revoked_at, allowed_until),
  CONSTRAINT clearance_allowance_student_fk FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS clearance_threshold_rules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id VARCHAR(64) NOT NULL,
  threshold DECIMAL(14, 2) NOT NULL,
  class_name VARCHAR(64) NULL,
  term VARCHAR(64) NULL,
  expires_at DATE NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY clearance_rule_school_active_index (school_id, is_active, expires_at)
);
