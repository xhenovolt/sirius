-- Migration 010: saved deterministic column mappings per school.

CREATE TABLE IF NOT EXISTS import_mapping_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id VARCHAR(64) NOT NULL,
  template_name VARCHAR(100) NOT NULL,
  mapping JSON NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY import_mapping_template_name_unique (school_id, template_name),
  KEY import_mapping_template_school_index (school_id)
);
