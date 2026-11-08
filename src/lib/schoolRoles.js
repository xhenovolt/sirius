import { queryTenant, withTenantTransaction } from "./dbTenant.js";
import { DEFAULT_ROLE_PERMISSIONS, sanitizeSchoolPermissions } from "./schoolPermissions.js";

const RESERVED_ROLE_SLUGS = new Set(["superadmin", "admin", "bursar", "operator"]);

export function schoolRoleSlug(name) {
  return String(name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

export async function listSchoolRoles(schoolId) {
  const [rows] = await queryTenant(
    schoolId,
    `SELECT r.id, r.name, r.slug, r.description, r.is_super_admin,
            GROUP_CONCAT(rp.permission_key ORDER BY rp.permission_key SEPARATOR ',') AS permission_keys,
            EXISTS (
              SELECT 1 FROM user_roles ur
               WHERE ur.school_id = r.school_id AND ur.role_id = r.id AND ur.is_active = 1
            ) AS assigned
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.school_id = r.school_id AND rp.role_id = r.id
      WHERE r.school_id = ? AND r.is_active = 1
      GROUP BY r.id, r.name, r.slug, r.description, r.is_super_admin
      ORDER BY CASE r.slug WHEN 'superadmin' THEN 0 WHEN 'admin' THEN 1 WHEN 'bursar' THEN 2 WHEN 'operator' THEN 3 ELSE 4 END,
               r.name`,
    [schoolId],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    slug: row.slug,
    description: row.description || "",
    isSuperAdmin: Number(row.is_super_admin) === 1,
    isSystem: RESERVED_ROLE_SLUGS.has(row.slug),
    assigned: Number(row.assigned) === 1,
    permissions: row.is_super_admin
      ? ["*"]
      : row.permission_keys ? row.permission_keys.split(",") : [],
  }));
}

async function saveRolePermissions(scoped, schoolId, roleId, permissions) {
  await scoped.query("DELETE FROM role_permissions WHERE school_id = ? AND role_id = ?", [schoolId, roleId]);
  for (const permission of permissions) {
    await scoped.query(
      "INSERT INTO role_permissions (school_id, role_id, permission_key) VALUES (?, ?, ?)",
      [schoolId, roleId, permission],
    );
  }
}

export async function createSchoolRole(schoolId, values) {
  const name = typeof values?.name === "string" ? values.name.trim() : "";
  const description = typeof values?.description === "string" ? values.description.trim() : "";
  const permissions = sanitizeSchoolPermissions(values?.permissions);
  const slug = schoolRoleSlug(name);
  if (!name || name.length > 100 || !slug || slug.length > 64 || RESERVED_ROLE_SLUGS.has(slug)) {
    return { ok: false, status: 400, reason: "Enter a role name of up to 100 characters that does not use a reserved role name." };
  }
  if (description.length > 255) return { ok: false, status: 400, reason: "Role description must be 255 characters or fewer." };
  if (!permissions) return { ok: false, status: 400, reason: "Choose valid permissions for this role." };

  try {
    const id = await withTenantTransaction(schoolId, async (scoped) => {
      const [result] = await scoped.query(
        `INSERT INTO roles (school_id, name, slug, description, is_super_admin, is_active)
         VALUES (?, ?, ?, ?, 0, 1)`,
        [schoolId, name, slug, description || null],
      );
      await saveRolePermissions(scoped, schoolId, result.insertId, permissions);
      return Number(result.insertId);
    });
    return { ok: true, id, slug, permissions };
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return { ok: false, status: 409, reason: "A role with that name already exists." };
    throw error;
  }
}

export async function updateSchoolRole(schoolId, values) {
  const id = Number(values?.id);
  const name = typeof values?.name === "string" ? values.name.trim() : "";
  const description = typeof values?.description === "string" ? values.description.trim() : "";
  const permissions = sanitizeSchoolPermissions(values?.permissions);
  const slug = schoolRoleSlug(name);
  if (!Number.isInteger(id) || id < 1) return { ok: false, status: 400, reason: "A valid role is required." };
  if (!name || name.length > 100 || !slug || slug.length > 64 || RESERVED_ROLE_SLUGS.has(slug)) {
    return { ok: false, status: 400, reason: "Enter a valid custom role name." };
  }
  if (description.length > 255) return { ok: false, status: 400, reason: "Role description must be 255 characters or fewer." };
  if (!permissions) return { ok: false, status: 400, reason: "Choose valid permissions for this role." };

  try {
    const found = await withTenantTransaction(schoolId, async (scoped) => {
      const [roles] = await scoped.query(
        "SELECT id, slug FROM roles WHERE school_id = ? AND id = ? AND is_active = 1 FOR UPDATE",
        [schoolId, id],
      );
      if (!roles[0] || RESERVED_ROLE_SLUGS.has(roles[0].slug)) return false;
      await scoped.query(
        "UPDATE roles SET name = ?, slug = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE school_id = ? AND id = ?",
        [name, slug, description || null, schoolId, id],
      );
      await saveRolePermissions(scoped, schoolId, id, permissions);
      return true;
    });
    if (!found) return { ok: false, status: 404, reason: "Custom role not found." };
    return { ok: true, id, slug, permissions };
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return { ok: false, status: 409, reason: "A role with that name already exists." };
    throw error;
  }
}

export async function deleteSchoolRole(schoolId, idValue) {
  const id = Number(idValue);
  if (!Number.isInteger(id) || id < 1) return { ok: false, status: 400, reason: "A valid role is required." };
  return withTenantTransaction(schoolId, async (scoped) => {
    const [roles] = await scoped.query(
      "SELECT id, slug FROM roles WHERE school_id = ? AND id = ? AND is_active = 1 FOR UPDATE",
      [schoolId, id],
    );
    if (!roles[0] || RESERVED_ROLE_SLUGS.has(roles[0].slug)) {
      return { ok: false, status: 404, reason: "Custom role not found." };
    }
    const [members] = await scoped.query(
      "SELECT id FROM user_roles WHERE school_id = ? AND role_id = ? AND is_active = 1 LIMIT 1",
      [schoolId, id],
    );
    if (members.length) return { ok: false, status: 409, reason: "Reassign users before deleting this role." };
    await scoped.query("DELETE FROM roles WHERE school_id = ? AND id = ?", [schoolId, id]);
    return { ok: true };
  });
}

export function defaultPermissionsForRole(slug) {
  return DEFAULT_ROLE_PERMISSIONS[slug] || [];
}
