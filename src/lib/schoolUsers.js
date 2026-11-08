import bcrypt from "bcryptjs";
import { queryTenant, withTenantTransaction } from "./dbTenant.js";
import { normalizeUgandaPhone } from "./passwordResetIdentity.js";
import { assertSchoolPassword } from "./schoolPassword.js";

const RESERVED_ROLES = new Set(["superadmin", "admin", "bursar", "operator"]);

export function schoolUserActionPolicy({
  action,
  actorId,
  targetId,
  targetRole,
  nextRole,
  nextRoleIsAdmin = ["superadmin", "admin"].includes(nextRole),
  actorIsSuperAdmin = false,
  targetIsSuperAdmin = false,
  targetIsAdmin,
  activeAdminCount,
}) {
  const isSelf = Number(actorId) === Number(targetId);
  const removesAdmin = targetIsAdmin && (
    ["demote", "disable", "delete"].includes(action)
    || (action === "set_role" && !nextRoleIsAdmin)
  );

  if (isSelf && ["demote", "disable", "delete"].includes(action)) {
    return { ok: false, status: 400, reason: "You cannot remove or disable your own access." };
  }
  if (isSelf && action === "set_role" && nextRole !== targetRole) {
    return { ok: false, status: 400, reason: "You cannot change your own school role." };
  }
  if (targetIsSuperAdmin && !actorIsSuperAdmin) {
    return { ok: false, status: 403, reason: "Only a school SuperAdmin can manage another SuperAdmin." };
  }
  if (!actorIsSuperAdmin && action === "set_role" && !["admin", "operator"].includes(nextRole)) {
    return { ok: false, status: 403, reason: "Only a school SuperAdmin can assign that role." };
  }
  if (!actorIsSuperAdmin && ["promote", "demote"].includes(action) && !["admin", "operator"].includes(targetRole)) {
    return { ok: false, status: 403, reason: "Only a school SuperAdmin can change that user's role." };
  }
  if (action === "set_role" && nextRole === "superadmin" && !actorIsSuperAdmin) {
    return { ok: false, status: 403, reason: "Only a school SuperAdmin can assign the SuperAdmin role." };
  }
  if (removesAdmin && activeAdminCount <= 1) {
    return { ok: false, status: 409, reason: "The last active school administrator cannot be demoted, disabled, or deleted." };
  }
  return { ok: true };
}

async function endUserSessions(scoped, userId, schoolId) {
  await scoped.query(
    "UPDATE sessions SET is_active = 0 WHERE user_id = ? AND school_id = ? AND is_active = 1",
    [userId, schoolId],
  );
}

export async function performSchoolUserAction({
  schoolId,
  actorId,
  actorIsSuperAdmin = false,
  userId,
  action,
  values = {},
}) {
  if (["reset-password", "resetPassword", "reset"].includes(action)) action = "reset_password";
  const targetId = Number(userId);
  if (!Number.isInteger(targetId) || targetId < 1) {
    return { ok: false, status: 400, reason: "A valid user is required." };
  }

  if (action === "edit") {
    const displayName = String(values.displayName || "").trim();
    const phone = normalizeUgandaPhone(values.phone);
    if (!displayName || displayName.length > 150 || !phone) {
      return { ok: false, status: 400, reason: "A name (up to 150 characters) and valid Uganda mobile number are required." };
    }
  } else if (action === "reset_password") {
    try {
      await assertSchoolPassword(String(values.password || ""));
    } catch (error) {
      return { ok: false, status: error.status || 400, reason: error.message };
    }
  } else if (action === "set_role") {
    if (typeof values.role !== "string" || !/^[a-z0-9_]{1,64}$/.test(values.role)) {
      return { ok: false, status: 400, reason: "Choose a valid school role." };
    }
    if (!actorIsSuperAdmin && !["admin", "operator"].includes(values.role)) {
      return { ok: false, status: 403, reason: "Only a school SuperAdmin can assign this role." };
    }
  } else if (action === "promote" || action === "demote") {
    // Both actions have fixed role assignments.
  } else if (!["disable", "enable", "delete", "logout"].includes(action)) {
    return { ok: false, status: 400, reason: "Unknown user action." };
  }

  const passwordHash = action === "reset_password"
    ? await bcrypt.hash(String(values.password), 12)
    : null;

  return withTenantTransaction(schoolId, async (scoped) => {
    const [schoolRows] = await scoped.query(
      "SELECT school_id FROM schools WHERE school_id = ? FOR UPDATE",
      [schoolId],
    );
    if (!schoolRows.length) return { ok: false, status: 404, reason: "School not found." };

    const [targetRows] = await scoped.query(
      `SELECT u.id, u.status, u.deleted_at,
                COALESCE((
                  SELECT r.slug
                    FROM user_roles ur
                    JOIN roles r ON r.id = ur.role_id AND r.school_id = ur.school_id
                   WHERE ur.user_id = u.id AND ur.school_id = u.school_id
                     AND ur.is_active = 1 AND r.is_active = 1
                   ORDER BY CASE r.slug WHEN 'superadmin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END
                   LIMIT 1
                ), u.role) AS role_slug,
                EXISTS (
                  SELECT 1
                    FROM user_roles ur
                    JOIN roles r ON r.id = ur.role_id AND r.school_id = ur.school_id AND r.is_active = 1
                   WHERE ur.user_id = u.id AND ur.school_id = u.school_id
                     AND ur.is_active = 1 AND r.slug = 'superadmin'
                ) AS is_superadmin,
                EXISTS (
                  SELECT 1
                  FROM user_roles ur
                  JOIN roles r ON r.id = ur.role_id AND r.school_id = ur.school_id AND r.is_active = 1
                  LEFT JOIN role_permissions rp
                    ON rp.role_id = r.id AND rp.school_id = r.school_id
                 WHERE ur.user_id = u.id AND ur.school_id = u.school_id
                   AND ur.is_active = 1
                   AND (r.slug IN ('superadmin', 'admin') OR rp.permission_key = 'users.manage')
              ) AS is_admin
         FROM users u
        WHERE u.id = ? AND u.school_id = ?
        FOR UPDATE`,
      [targetId, schoolId],
    );
    const target = targetRows[0];
    if (!target || target.deleted_at) {
      return { ok: false, status: 404, reason: "User not found." };
    }

    const [adminRows] = await scoped.query(
      `SELECT COUNT(DISTINCT u.id) AS count
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id AND ur.school_id = u.school_id AND ur.is_active = 1
         JOIN roles r ON r.id = ur.role_id AND r.school_id = ur.school_id AND r.is_active = 1
         LEFT JOIN role_permissions rp ON rp.role_id = r.id AND rp.school_id = r.school_id
        WHERE u.school_id = ? AND u.deleted_at IS NULL AND u.status = 'active'
          AND (r.slug IN ('superadmin', 'admin') OR rp.permission_key = 'users.manage')`,
      [schoolId],
    );
    let selectedRole = null;
    if (action === "set_role") {
      const [roleRows] = await scoped.query(
        `SELECT r.id,
                (r.slug IN ('superadmin', 'admin') OR EXISTS (
                  SELECT 1 FROM role_permissions rp
                   WHERE rp.school_id = r.school_id AND rp.role_id = r.id
                     AND rp.permission_key = 'users.manage'
                )) AS manages_users
           FROM roles r
          WHERE r.school_id = ? AND r.slug = ? AND r.is_active = 1
          LIMIT 1`,
        [schoolId, values.role],
      );
      selectedRole = roleRows[0] || null;
      if (!selectedRole) return { ok: false, status: 400, reason: "That role is not available for this school." };
    }
    const policy = schoolUserActionPolicy({
      action,
      actorId,
      targetId,
      targetRole: target.role_slug,
      nextRole: values.role,
      nextRoleIsAdmin: action === "set_role" && Number(selectedRole?.manages_users) === 1,
      actorIsSuperAdmin,
      targetIsSuperAdmin: Boolean(target.is_superadmin),
      targetIsAdmin: Boolean(target.is_admin) && target.status === "active",
      activeAdminCount: Number(adminRows[0]?.count || 0),
    });
    if (!policy.ok) return policy;

    if (action === "promote" || action === "demote" || action === "set_role") {
      const roleSlug = action === "set_role"
        ? values.role
        : action === "promote" ? "admin" : "operator";
      const [roleRows] = action === "set_role"
        ? [[selectedRole]]
        : await scoped.query(
          "SELECT id FROM roles WHERE school_id = ? AND slug = ? AND is_active = 1 LIMIT 1",
          [schoolId, roleSlug],
        );
      if (!roleRows[0]) {
        return { ok: false, status: 400, reason: "That role is not available for this school." };
      }
      await scoped.query(
        "UPDATE user_roles SET is_active = 0 WHERE user_id = ? AND school_id = ?",
        [targetId, schoolId],
      );
      await scoped.query(
        `INSERT INTO user_roles (user_id, role_id, school_id, is_active, assigned_at, assigned_by)
         VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP, ?)
         ON DUPLICATE KEY UPDATE is_active = 1, assigned_at = CURRENT_TIMESTAMP, assigned_by = VALUES(assigned_by)`,
        [targetId, roleRows[0].id, schoolId, actorId],
      );
      await scoped.query(
        "UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?",
        [roleSlug === "operator" ? "operator" : "admin", targetId, schoolId],
      );
    } else if (action === "edit") {
      await scoped.query(
        "UPDATE users SET display_name = ?, phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?",
        [String(values.displayName).trim(), normalizeUgandaPhone(values.phone), targetId, schoolId],
      );
    } else if (action === "reset_password") {
      await scoped.query(
        "UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?",
        [passwordHash, targetId, schoolId],
      );
      await endUserSessions(scoped, targetId, schoolId);
    } else if (action === "disable") {
      await scoped.query(
        "UPDATE users SET status = 'disabled', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?",
        [targetId, schoolId],
      );
      await endUserSessions(scoped, targetId, schoolId);
    } else if (action === "enable") {
      await scoped.query(
        "UPDATE users SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?",
        [targetId, schoolId],
      );
    } else if (action === "delete") {
      await scoped.query(
        "DELETE FROM users WHERE id = ? AND school_id = ?",
        [targetId, schoolId],
      );
    } else if (action === "logout") {
      await endUserSessions(scoped, targetId, schoolId);
    }

    return { ok: true };
  });
}

export async function listSchoolUsers(schoolId) {
  const [rows] = await queryTenant(
    schoolId,
    `SELECT u.id, u.email, u.phone, u.display_name, u.role, u.status, u.deleted_at,
            u.last_login_at, u.created_at,
            COALESCE(
              (SELECT r.slug
                 FROM user_roles ur
                 JOIN roles r ON r.id = ur.role_id AND r.school_id = ur.school_id
                WHERE ur.user_id = u.id AND ur.school_id = u.school_id
                  AND ur.is_active = 1 AND r.is_active = 1
                ORDER BY CASE r.slug WHEN 'superadmin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END
                LIMIT 1),
              u.role
            ) AS role_slug,
            MAX(s.last_seen_at) AS last_seen_at,
            SUM(CASE WHEN s.is_active = 1 AND s.expires_at > CURRENT_TIMESTAMP
                      AND s.last_seen_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 5 MINUTE)
                     THEN 1 ELSE 0 END) AS online_sessions,
            MAX(CASE WHEN s.is_active = 1 AND s.expires_at > CURRENT_TIMESTAMP
                      AND s.last_seen_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 5 MINUTE)
                     THEN 1 ELSE 0 END) AS is_online
       FROM users u
       LEFT JOIN sessions s ON s.user_id = u.id AND s.school_id = u.school_id
      WHERE u.school_id = ? AND u.deleted_at IS NULL
      GROUP BY u.id, u.email, u.phone, u.display_name, u.role, u.status, u.deleted_at, u.last_login_at, u.created_at
      ORDER BY u.created_at ASC`,
    [schoolId],
  );
  return rows;
}

export { RESERVED_ROLES };
