import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { getDb } from "./db.js";

export const superAdminSlug = "superadmin";

/**
 * Roles seeded for every new school. `is_super_admin` is the only flag that
 * grants full access; authorisation reads this, never a column on users.
 */
export const defaultRoles = [
  { name: "SuperAdmin", slug: "superadmin", description: "School owner with full system access", isSuperAdmin: true },
  { name: "Admin", slug: "admin", description: "School administrator", isSuperAdmin: false },
  { name: "Bursar", slug: "bursar", description: "Finance officer who manages fee data", isSuperAdmin: false },
  { name: "Operator", slug: "operator", description: "General school staff", isSuperAdmin: false },
];

/** Opaque, non-sequential tenant id. Never derived from the school name. */
export function generateSchoolId() {
  return `sch_${randomBytes(9).toString("base64url")}`;
}

export async function seedSchoolRoles(connection, schoolId) {
  for (const role of defaultRoles) {
    await connection.query(
      `INSERT INTO roles (school_id, name, slug, description, is_super_admin, is_active)
       VALUES (?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE name = VALUES(name), is_super_admin = VALUES(is_super_admin)`,
      [schoolId, role.name, role.slug, role.description, role.isSuperAdmin ? 1 : 0],
    );
  }
}

export async function findRoleId(connection, schoolId, slug) {
  const [rows] = await connection.query(
    "SELECT id FROM roles WHERE school_id = ? AND slug = ? LIMIT 1",
    [schoolId, slug],
  );
  return rows[0] ? rows[0].id : null;
}

export async function assignRole(connection, { userId, roleId, schoolId, assignedBy = null }) {
  await connection.query(
    `INSERT INTO user_roles (user_id, role_id, school_id, is_active, assigned_at, assigned_by)
     VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP, ?)
     ON DUPLICATE KEY UPDATE is_active = 1`,
    [userId, roleId, schoolId, assignedBy],
  );
}

/**
 * Signup flow, mirroring DRAIS: create the school, seed its roles, create the
 * owner user as active, and assign the school's SuperAdmin role. All of it in
 * one transaction — a half-created school is never left behind.
 *
 * Returns { schoolId, userId }. The caller mints the session.
 */
export async function createSchoolWithSuperAdmin({
  schoolName,
  schoolCode = null,
  email,
  password,
  displayName,
  phone = null,
}) {
  const connection = await getDb().getConnection();
  try {
    await connection.beginTransaction();

    const schoolId = generateSchoolId();
    await connection.query(
      "INSERT INTO schools (school_id, school_name, school_code, status) VALUES (?, ?, ?, 'active')",
      [schoolId, schoolName, schoolCode],
    );

    await seedSchoolRoles(connection, schoolId);

    const passwordHash = await bcrypt.hash(password, 12);
    const [userResult] = await connection.query(
      `INSERT INTO users (school_id, email, phone, display_name, password_hash, role, status)
       VALUES (?, ?, ?, ?, ?, 'admin', 'active')`,
      [schoolId, String(email).toLowerCase(), phone || "", displayName, passwordHash],
    );
    const userId = userResult.insertId;

    const superAdminRoleId = await findRoleId(connection, schoolId, superAdminSlug);
    await assignRole(connection, { userId, roleId: superAdminRoleId, schoolId });

    await connection.commit();
    return { schoolId, userId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
