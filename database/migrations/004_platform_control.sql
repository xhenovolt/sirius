-- Migration 004: platform Control Center + subscription plans.
--
-- Adds an ISOLATED platform layer that oversees every school, mirroring the
-- real DRAIS Control Center: its own tables (control_users / control_sessions /
-- control_audit_logs / control_login_attempts), its own KV store
-- (platform_settings) and a plan catalog (subscription_plans) that drives
-- per-school resource limits as DATA, not code.
--
-- Nothing here touches school auth (`users` / `sessions`): a mistake in the
-- Control Center can never break school login.
--
-- Adaptation from DRAIS: our tenant id is an opaque STRING (school_id), so
-- control school-scope stores strings. We have no staff/devices tables, so the
-- metered limits are learners / users / cards.
--
-- Idempotent: safe to run more than once.

-- ---------------------------------------------------------------------------
-- schools: subscription + trial lifecycle.
-- `status` gains 'suspended' so a lapsed subscription can be gated without
-- deleting anything (the school's data is untouched).
-- ---------------------------------------------------------------------------
ALTER TABLE schools ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(40) NULL;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(16) NOT NULL DEFAULT 'none';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS subscription_type VARCHAR(16) NULL;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS trial_start_date DATE NULL;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS trial_end_date DATE NULL;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS subscription_start_date DATE NULL;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS subscription_end_date DATE NULL;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS status_reason VARCHAR(255) NULL;
ALTER TABLE schools MODIFY COLUMN status ENUM('active', 'inactive', 'suspended') NOT NULL DEFAULT 'active';

-- ---------------------------------------------------------------------------
-- control_users: the platform operators. Separate identity domain.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS control_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(40) NOT NULL DEFAULT 'XHENVOLT_OPERATOR',
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP NULL DEFAULT NULL,
  totp_secret VARCHAR(64) NULL,
  totp_enabled TINYINT NOT NULL DEFAULT 0,
  totp_recovery JSON NULL,
  permissions JSON NULL,
  school_scope JSON NULL,
  access_expires_at DATETIME NULL,
  notes VARCHAR(500) NULL,
  updated_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_control_email (email)
);

-- ---------------------------------------------------------------------------
-- control_sessions: platform sessions. Only the SHA-256 of the token is stored.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS control_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  ip VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  expires_at DATETIME NOT NULL,
  last_activity_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_control_token (token_hash),
  KEY idx_control_session_user (user_id),
  KEY idx_control_session_active (user_id, revoked_at, expires_at)
);

-- ---------------------------------------------------------------------------
-- control_audit_logs: every Control Center action.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS control_audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  action VARCHAR(80) NOT NULL,
  resource VARCHAR(190) NULL,
  metadata TEXT NULL,
  ip VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_control_audit_created (created_at),
  KEY idx_control_audit_user (user_id)
);

-- ---------------------------------------------------------------------------
-- control_login_attempts: brute-force guard for the platform credential.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS control_login_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(190) NOT NULL,
  ip VARCHAR(64) NULL,
  success TINYINT NOT NULL DEFAULT 0,
  attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_control_attempt_email_time (email, attempted_at)
);

-- ---------------------------------------------------------------------------
-- platform_settings: platform-wide key/value flags (maintenance, free-trial
-- thresholds, seeding markers). Superadmin-editable, never per-school.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_settings (
  key_name VARCHAR(64) NOT NULL,
  value_text TEXT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (key_name)
);

INSERT IGNORE INTO platform_settings (key_name, value_text) VALUES
  ('maintenance', '{"mode":"off","message":""}'),
  ('free_trial_days', '30'),
  ('free_trial_card_limit', '50'),
  ('plans_seeded', '1');

-- ---------------------------------------------------------------------------
-- subscription_plans: the plan catalog. `limits` is JSON so a new commercial
-- plan is a database change, not a deployment. null limit = unlimited.
-- Sirius meters: learners / users / cards / storage_mb.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_plans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(80) NOT NULL,
  tier INT NOT NULL DEFAULT 0,
  limits JSON NULL,
  features JSON NULL,
  is_active TINYINT NOT NULL DEFAULT 1,
  price DECIMAL(14, 2) NOT NULL DEFAULT 0,
  installation_fee DECIMAL(14, 2) NOT NULL DEFAULT 0,
  currency VARCHAR(8) NOT NULL DEFAULT 'UGX',
  billing_cycle VARCHAR(16) NOT NULL DEFAULT 'annual',
  installments INT NOT NULL DEFAULT 1,
  deliverables JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_plan_code (code)
);

INSERT IGNORE INTO subscription_plans
  (code, name, tier, limits, features, is_active, price, installation_fee, currency, billing_cycle, installments, deliverables)
VALUES
  ('starter', 'Starter', 1,
   '{"learners":300,"users":5,"cards":300,"storage_mb":2000}',
   '["clearance","cards"]', 1, 1200000, 800000, 'UGX', 'annual', 3,
   '["Up to 300 learners","Clearance cards","Email support"]'),
  ('standard', 'Standard', 2,
   '{"learners":800,"users":15,"cards":800,"storage_mb":5000}',
   '["clearance","cards","finance"]', 1, 2400000, 1500000, 'UGX', 'annual', 3,
   '["Up to 800 learners","Clearance + fee verification","Parent portal","Priority support"]'),
  ('professional', 'Professional', 3,
   '{"learners":2000,"users":40,"cards":2000,"storage_mb":20000}',
   '["clearance","cards","finance","analytics"]', 1, 4800000, 2500000, 'UGX', 'annual', 3,
   '["Up to 2,000 learners","All Standard features","Analytics","On-site setup"]'),
  ('enterprise', 'Enterprise', 4,
   '{"learners":null,"users":null,"cards":null,"storage_mb":100000}',
   '["clearance","cards","finance","analytics","hr"]', 1, 9600000, 5000000, 'UGX', 'annual', 4,
   '["Unlimited learners","Dedicated account manager","SLA support"]');
