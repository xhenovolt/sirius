CREATE TABLE IF NOT EXISTS schools (
  school_id VARCHAR(64) NOT NULL,
  school_name VARCHAR(200) NOT NULL,
  school_code VARCHAR(64) NULL,
  address VARCHAR(300) NULL,
  contact_phone VARCHAR(32) NULL,
  contact_email VARCHAR(200) NULL,
  logo_url VARCHAR(500) NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (school_id),
  UNIQUE KEY schools_code_unique (school_code),
  KEY schools_status_index (status)
);

INSERT INTO schools (school_id, school_name, school_code)
VALUES ('default', 'Jipra Secondary School', 'JIPRA')
ON DUPLICATE KEY UPDATE school_name = VALUES(school_name);

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id VARCHAR(64) NULL,
  email VARCHAR(200) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  display_name VARCHAR(150) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'operator') NOT NULL DEFAULT 'operator',
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  last_login_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY users_email_unique (email),
  KEY users_school_index (school_id),
  CONSTRAINT users_school_fk FOREIGN KEY (school_id) REFERENCES schools (school_id)
);

CREATE TABLE IF NOT EXISTS password_reset_codes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id VARCHAR(64) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  code_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY password_reset_school_user_index (school_id, user_id, created_at),
  KEY password_reset_expiry_index (expires_at),
  CONSTRAINT password_reset_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT password_reset_school_fk FOREIGN KEY (school_id) REFERENCES schools (school_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY sessions_token_hash_unique (token_hash),
  KEY sessions_user_index (user_id),
  KEY sessions_expiry_index (expires_at),
  CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS import_batches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id VARCHAR(64) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  total_rows INT UNSIGNED NOT NULL DEFAULT 0,
  valid_rows INT UNSIGNED NOT NULL DEFAULT 0,
  invalid_rows INT UNSIGNED NOT NULL DEFAULT 0,
  imported_rows INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('preview', 'completed', 'failed') NOT NULL DEFAULT 'preview',
  error_message VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  KEY import_batches_school_index (school_id),
  KEY import_batches_created_index (created_at),
  CONSTRAINT import_batches_school_fk FOREIGN KEY (school_id) REFERENCES schools (school_id)
);

CREATE TABLE IF NOT EXISTS students (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id VARCHAR(64) NOT NULL,
  student_uid VARCHAR(64) NOT NULL,
  admission_number VARCHAR(64) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  full_name VARCHAR(205) NOT NULL,
  gender VARCHAR(32) NULL,
  class_name VARCHAR(64) NULL,
  stream VARCHAR(64) NULL,
  student_type VARCHAR(32) NULL,
  photo_url VARCHAR(500) NULL,
  parent_name VARCHAR(205) NULL,
  parent_phone VARCHAR(32) NULL,
  school_name VARCHAR(200) NULL,
  import_batch_id BIGINT UNSIGNED NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY students_uid_unique (student_uid),
  UNIQUE KEY students_school_admission_unique (school_id, admission_number),
  KEY students_name_index (full_name),
  KEY students_school_index (school_id),
  KEY students_status_index (status),
  KEY students_import_batch_index (import_batch_id),
  CONSTRAINT students_school_fk FOREIGN KEY (school_id) REFERENCES schools (school_id),
  CONSTRAINT students_import_batch_fk FOREIGN KEY (import_batch_id) REFERENCES import_batches (id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id VARCHAR(64) NULL,
  user_id BIGINT UNSIGNED NULL,
  actor_email VARCHAR(200) NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NULL,
  entity_id VARCHAR(200) NULL,
  details JSON NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY audit_logs_user_index (user_id),
  KEY audit_logs_action_index (action),
  KEY audit_logs_created_index (created_at),
  CONSTRAINT audit_logs_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
);