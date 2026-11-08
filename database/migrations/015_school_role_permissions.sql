-- Migration 015: school-scoped permissions attached to school roles.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS role_permissions (
  school_id VARCHAR(64) NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  permission_key VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (school_id, role_id, permission_key),
  KEY role_permissions_role_index (role_id),
  CONSTRAINT role_permissions_school_fk FOREIGN KEY (school_id) REFERENCES schools (school_id),
  CONSTRAINT role_permissions_role_fk FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE
);

INSERT IGNORE INTO role_permissions (school_id, role_id, permission_key)
SELECT r.school_id, r.id, permission.permission_key
FROM roles r
JOIN (
  SELECT 'dashboard.view' AS permission_key
  UNION ALL SELECT 'students.view'
  UNION ALL SELECT 'students.manage'
  UNION ALL SELECT 'imports.view'
  UNION ALL SELECT 'imports.manage'
  UNION ALL SELECT 'cards.view'
  UNION ALL SELECT 'cards.manage'
  UNION ALL SELECT 'clearance.view'
  UNION ALL SELECT 'clearance.manage'
  UNION ALL SELECT 'users.manage'
  UNION ALL SELECT 'school.settings.manage'
  UNION ALL SELECT 'audit.view'
) permission
WHERE r.slug = 'admin' AND r.is_super_admin = 0;

INSERT IGNORE INTO role_permissions (school_id, role_id, permission_key)
SELECT r.school_id, r.id, permission.permission_key
FROM roles r
JOIN (
  SELECT 'dashboard.view' AS permission_key
  UNION ALL SELECT 'students.view'
  UNION ALL SELECT 'imports.view'
  UNION ALL SELECT 'cards.view'
  UNION ALL SELECT 'clearance.view'
  UNION ALL SELECT 'clearance.manage'
) permission
WHERE r.slug = 'bursar' AND r.is_super_admin = 0;

INSERT IGNORE INTO role_permissions (school_id, role_id, permission_key)
SELECT r.school_id, r.id, permission.permission_key
FROM roles r
JOIN (
  SELECT 'dashboard.view' AS permission_key
  UNION ALL SELECT 'students.view'
  UNION ALL SELECT 'imports.view'
  UNION ALL SELECT 'cards.view'
  UNION ALL SELECT 'clearance.view'
) permission
WHERE r.slug = 'operator' AND r.is_super_admin = 0;
