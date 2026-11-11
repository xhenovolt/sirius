"use client";

import { useState } from "react";
import { useSchoolPasswordPolicy } from "@/components/SchoolPasswordPolicy";
import { schoolPasswordPolicyError } from "@/lib/passwordPolicyRules";
import { confirmDialog, promptDialog } from "@/lib/sweetAlert";

export default function UsersPanel({ users, roles = [], currentUserId, isSuperAdmin = false }) {
  const { policy } = useSchoolPasswordPolicy();
  const [message, setMessage] = useState("");

  async function userAction(userId, action, values = {}, confirmText = null) {
    if (confirmText && !(await confirmDialog(confirmText, { danger: ["delete", "disable", "reset_password"].includes(action) }))) return;
    setMessage("");
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action, ...values }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error || "Unable to update user.");
        return;
      }
      window.location.reload();
    } catch {
      setMessage("Unable to update user. Check your connection and try again.");
    }
  }

  async function editUser(user) {
    const displayName = await promptDialog("Edit user name", { value: user.display_name, confirmText: "Continue" });
    if (displayName === null) return;
    const phone = await promptDialog("Edit phone number", { value: user.phone || "", confirmText: "Save" });
    if (phone === null) return;
    void userAction(user.id, "edit", { displayName, phone });
  }

  async function resetPassword(user) {
    const password = await promptDialog(`Reset password for ${user.display_name}`, {
      input: "password",
      confirmText: "Continue",
      validator: (value) => schoolPasswordPolicyError(value, policy) || undefined,
    });
    if (password === null) return;
    void userAction(
      user.id,
      "reset_password",
      { password },
      `Reset ${user.display_name}'s password and end their active sessions?`,
    );
  }

  function changeRole(user, role) {
    if (role === (user.role_slug || user.role)) return;
    void userAction(
      user.id,
      "set_role",
      { role },
      `Change ${user.display_name}'s role to ${role}?`,
    );
  }

  return (
    <section className="panel settings-panel">
      <div className="panel-heading">
        <div><p className="eyebrow">Access control</p><h2>Users</h2></div>
        <span className="preview-count">{users.length} user{users.length === 1 ? "" : "s"}</span>
      </div>
      <div className="user-list">
        {users.length === 0 && <p className="empty-inline">No active school users.</p>}
        {users.map((user) => {
          const isSelf = Number(user.id) === Number(currentUserId);
          const removed = Boolean(user.deleted_at);
          const enabled = user.status === "active" && !removed;
          const role = user.role_slug || user.role;
          const isSuperAdminTarget = role === "superadmin";
          const canManageTarget = !removed && (!isSuperAdminTarget || isSuperAdmin);
          return (
            <div className="user-row" key={user.id}>
              <span className="avatar">{(user.display_name || "?").slice(0, 1).toUpperCase()}</span>
              <span>
                <strong>{user.display_name}{isSelf ? " (you)" : ""}</strong>
                <small>{user.email} · {user.phone || "No phone"}</small>
                <small>{role} · {removed ? "Deleted" : enabled ? "Enabled" : "Disabled"}</small>
                <small>
                  {user.is_online
                    ? `Online now (${Number(user.online_sessions || 0)} active session${Number(user.online_sessions) === 1 ? "" : "s"})`
                    : user.last_seen_at ? `Offline · last seen ${new Date(user.last_seen_at).toLocaleString()}` : "Offline · never signed in"}
                </small>
              </span>
              {canManageTarget && (
                <span className="user-actions">
                  <button type="button" onClick={() => editUser(user)}>Edit</button>
                  <button type="button" onClick={() => resetPassword(user)}>Reset password</button>
                  {!isSelf && isSuperAdmin && (
                    <label className="user-role-control">
                      <span className="sr-only">Role for {user.display_name}</span>
                      <select value={role} onChange={(event) => changeRole(user, event.target.value)}>
                        {roles.map((availableRole) => (
                          <option key={availableRole.id} value={availableRole.slug}>{availableRole.name}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {!isSelf && !isSuperAdmin && ["admin", "operator"].includes(role) && (
                    <button
                      type="button"
                      onClick={() => userAction(user.id, role === "admin" ? "demote" : "promote")}
                    >
                      {role === "admin" ? "Demote" : "Promote"}
                    </button>
                  )}
                  {!isSelf && <>
                    <button type="button" onClick={() => userAction(user.id, enabled ? "disable" : "enable")}>
                      {enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      onClick={() => userAction(user.id, "logout")}
                      disabled={!Number(user.online_sessions || 0)}
                    >
                      Log out
                    </button>
                    <button
                      type="button"
                      onClick={() => userAction(user.id, "delete", {}, `Permanently delete ${user.display_name}? Their school-user account, sessions, role assignments, and password reset codes will be removed. This cannot be undone. Audit history will remain.`)}
                    >
                      Delete
                    </button>
                  </>}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {message && <p className="settings-message" role="status">{message}</p>}
    </section>
  );
}