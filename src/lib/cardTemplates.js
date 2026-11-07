import { assertTenantId, queryTenant, withTenantTransaction } from "./dbTenant.js";
import { CardTemplateError } from "./cardTemplateSchema.js";
import { validateCardTemplate } from "./cardTemplateSchema.js";
export { CardTemplateError, cardFields, defaultCardTemplate, validateCardTemplate } from "./cardTemplateSchema.js";

function parseTemplate(value) {
  if (value && typeof value === "object") return validateCardTemplate(value);
  try {
    return validateCardTemplate(JSON.parse(value));
  } catch {
    throw new Error("Stored card template JSON is invalid.");
  }
}

export async function listCardTemplates(schoolId) {
  const [rows] = await queryTenant(
    schoolId,
    `SELECT id, template_name, version, template_json, created_at
       FROM card_templates
      WHERE school_id = ?
      ORDER BY template_name ASC, version DESC`,
    [schoolId],
  );
  return rows.map((row) => ({
    id: String(row.id),
    name: row.template_name,
    version: Number(row.version),
    template: parseTemplate(row.template_json),
    createdAt: row.created_at,
  }));
}

export async function saveCardTemplate(schoolId, name, value, createdBy) {
  assertTenantId(schoolId);
  if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
    throw new CardTemplateError("Template name must be between 1 and 100 characters.");
  }
  const template = validateCardTemplate(value);
  return withTenantTransaction(schoolId, async (scoped) => {
    const [schools] = await scoped.query(
      "SELECT school_id FROM schools WHERE school_id = ? FOR UPDATE",
      [schoolId],
    );
    if (!schools.length) throw new CardTemplateError("School not found.");
    const [versions] = await scoped.query(
      `SELECT COALESCE(MAX(version), 0) AS latest_version
         FROM card_templates
        WHERE school_id = ? AND template_name = ?`,
      [schoolId, name.trim()],
    );
    const version = Number(versions[0].latest_version || 0) + 1;
    const [result] = await scoped.query(
      `INSERT INTO card_templates
        (school_id, template_name, version, template_json, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [schoolId, name.trim(), version, JSON.stringify(template), createdBy || null],
    );
    return {
      id: String(result.insertId),
      name: name.trim(),
      version,
      template,
    };
  });
}
