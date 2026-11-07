-- Migration 002: tenancy core.
-- Makes the tenant explicit on every tenant table and introduces per-school
-- roles with user memberships, mirroring the DRAIS authentication strategy
-- (schools -> users.school_id -> roles -> user_roles). Superadmin is DERIVED
-- from roles.is_super_admin, never stored on users.
--
-- Idempotent: safe to run more than once.

-- ---------------------------------------------------------------------------
-- schools: soft delete
-- ---------------------------------------------------------------------------
ALTER TABLE schools ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

-- ---------------------------------------------------------------------------
-- roles: per-school role catalogue
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id VARCHAR(64) NOT NULL,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(64) NOT NULL,
  description VARCHAR(255) NULL,
  is_super_admin TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY roles_school_slug_unique (school_id, slug),
  KEY roles_school_index (school_id),
  CONSTRAINT roles_school_fk FOREIGN KEY (school_id) REFERENCES schools (school_id)
);

-- ---------------------------------------------------------------------------
-- user_roles: a user's membership of a role within a school
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  school_id VARCHAR(64) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  assigned_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY user_roles_unique (user_id, role_id, school_id),
  KEY user_roles_user_index (user_id),
  KEY user_roles_role_index (role_id),
  KEY user_roles_school_index (school_id),
  CONSTRAINT user_roles_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT user_roles_role_fk FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE,
  CONSTRAINT user_roles_school_fk FOREIGN KEY (school_id) REFERENCES schools (school_id)
);

-- ---------------------------------------------------------------------------
-- users: tenant is mandatory, add lifecycle columns
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by BIGINT UNSIGNED NULL;
ALTER TABLE users MODIFY COLUMN status ENUM('active', 'disabled', 'pending') NOT NULL DEFAULT 'active';
UPDATE users SET school_id = 'default' WHERE school_id IS NULL;
ALTER TABLE users MODIFY COLUMN school_id VARCHAR(64) NOT NULL;
ALTER TABLE users MODIFY COLUMN role ENUM('admin', 'operator') NOT NULL DEFAULT 'operator' COMMENT 'DEPRECATED: authorisation reads user_roles';

-- ---------------------------------------------------------------------------
-- sessions: the tenant travels with the session so it is never taken from
-- client input, plus the client context DRAIS records.
-- ---------------------------------------------------------------------------
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS school_id VARCHAR(64) NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64) NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_agent VARCHAR(255) NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1;
UPDATE sessions s JOIN users u ON u.id = s.user_id SET s.school_id = u.school_id WHERE s.school_id IS NULL;

-- ---------------------------------------------------------------------------
-- child tables added in migration 001 must also carry the tenant
-- ---------------------------------------------------------------------------
ALTER TABLE qr_identities ADD COLUMN IF NOT EXISTS school_id VARCHAR(64) NULL;
UPDATE qr_identities qi JOIN students s ON s.id = qi.student_id SET qi.school_id = s.school_id WHERE qi.school_id IS NULL;
ALTER TABLE qr_identities MODIFY COLUMN school_id VARCHAR(64) NOT NULL;

ALTER TABLE import_rows ADD COLUMN IF NOT EXISTS school_id VARCHAR(64) NULL;
UPDATE import_rows ir JOIN import_batches b ON b.id = ir.batch_id SET ir.school_id = b.school_id WHERE ir.school_id IS NULL;
ALTER TABLE import_rows MODIFY COLUMN school_id VARCHAR(64) NOT NULL;

ALTER TABLE student_photos ADD COLUMN IF NOT EXISTS school_id VARCHAR(64) NULL;
UPDATE student_photos sp JOIN students s ON s.id = sp.student_id SET sp.school_id = s.school_id WHERE sp.school_id IS NULL;
ALTER TABLE student_photos MODIFY COLUMN school_id VARCHAR(64) NOT NULL;

ALTER TABLE import_batches MODIFY COLUMN school_id VARCHAR(64) NOT NULL;
ALTER TABLE students MODIFY COLUMN school_id VARCHAR(64) NOT NULL;

-- ---------------------------------------------------------------------------
-- seed the default school's roles
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO roles (school_id, name, slug, description, is_super_admin, is_active) VALUES
  ('default', 'SuperAdmin', 'superadmin', 'School owner with full system access', 1, 1),
  ('default', 'Admin', 'admin', 'School administrator', 0, 1),
  ('default', 'Bursar', 'bursar', 'Finance officer who manages fee data', 0, 1),
  ('default', 'Operator', 'operator', 'General school staff', 0, 1);

-- ---------------------------------------------------------------------------
-- backfill existing single-school users into memberships.
-- Existing 'admin' users become the default school's superadmins so the
-- tenant remains administrable after the migration.
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO user_roles (user_id, role_id, school_id, is_active, assigned_at)
SELECT u.id, r.id, u.school_id, 1, CURRENT_TIMESTAMP
FROM users u
JOIN roles r ON r.school_id = u.school_id AND r.slug = 'superadmin'
WHERE u.role = 'admin';

INSERT IGNORE INTO user_roles (user_id, role_id, school_id, is_active, assigned_at)
SELECT u.id, r.id, u.school_id, 1, CURRENT_TIMESTAMP
FROM users u
JOIN roles r ON r.school_id = u.school_id AND r.slug = 'operator'
WHERE u.role = 'operator';
