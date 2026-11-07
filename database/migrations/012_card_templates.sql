-- Migration 012: versioned, school-scoped card design templates.

CREATE TABLE IF NOT EXISTS card_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id VARCHAR(64) NOT NULL,
  template_name VARCHAR(100) NOT NULL,
  version INT UNSIGNED NOT NULL,
  template_json JSON NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY card_template_school_name_version_unique (school_id, template_name, version),
  KEY card_template_school_created_index (school_id, created_at)
);
