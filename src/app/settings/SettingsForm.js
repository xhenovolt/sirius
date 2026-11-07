"use client";

import { useState } from "react";

export default function SettingsForm({ school, users, currentUserId }) {
  const [form, setForm] = useState({
    schoolName: school.school_name || "",
    schoolCode: school.school_code || "",
    address: school.address || "",
    contactPhone: school.contact_phone || "",
    contactEmail: school.contact_email || "",
    currentTerm: school.current_term || "",
  });
  const [message, setMessage] = useState("");

  async function save(event) {
    event.preventDefault();
    setMessage("");
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      setMessage(response.ok ? "School settings saved." : result.error || "Unable to save settings.");
    } catch {
      setMessage("Unable to save settings. Check your connection and try again.");
    }
  }

  async function userAction(userId, action, values = {}, confirmText = null) {
    if (confirmText && !window.confirm(confirmText)) return;
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

  function editUser(user) {
    const displayName = window.prompt("User name", user.display_name);
    if (displayName === null) return;
    const phone = window.prompt("Phone number", user.phone || "");
    if (phone === null) return;
    void userAction(user.id, "edit", { displayName, phone });
  }

  function resetPassword(user) {
    const password = window.prompt(`New password for ${user.display_name} (at least 12 characters)`);
    if (password === null) return;
    void userAction(
      user.id,
      "reset_password",
      { password },
      `Reset ${user.display_name}'s password and end their active sessions?`,
    );
  }

  return (
    <div className="settings-grid">
      <section className="panel settings-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">School identity</p><h2>School details</h2></div>
        </div>
        <form className="settings-form" onSubmit={save}>
          {Object.entries({
            schoolName: "School name",
            schoolCode: "School code",
            address: "Address",
            contactPhone: "Contact phone",
            contactEmail: "Contact email",
            currentTerm: "Current term",
          }).map(([name, label]) => (
            <label key={name}>
              {label}
              <input
                name={name}
                value={form[name]}
                onChange={(event) => setForm({ ...form, [name]: event.target.value })}
                required={name === "schoolName"}
                type={name === "contactEmail" ? "email" : "text"}
              />
            </label>
          ))}
          <button className="button button-primary" type="submit">Save school settings</button>
          {message && <p className="settings-message" role="status">{message}</p>}
        </form>
      </section>

      <section className="panel settings-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Access control</p><h2>Users</h2></div>
          <span className="preview-count">{users.length} user{users.length === 1 ? "" : "s"}</span>
        </div>
        <div className="user-list">
          {users.map((user) => {
            const isSelf = Number(user.id) === Number(currentUserId);
            const removed = Boolean(user.deleted_at);
            const enabled = user.status === "active" && !removed;
            const role = user.role_slug || user.role;
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
                {!isSelf && !removed && (
                  <span className="user-actions">
                    <button type="button" onClick={() => editUser(user)}>Edit</button>
                    <button type="button" onClick={() => resetPassword(user)}>Reset password</button>
                    <button
                      type="button"
                      onClick={() => userAction(user.id, role === "admin" || role === "superadmin" ? "demote" : "promote")}
                    >
                      {role === "admin" || role === "superadmin" ? "Demote" : "Promote"}
                    </button>
                    <button
                      type="button"
                      onClick={() => userAction(user.id, enabled ? "disable" : "enable")}
                    >
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
                      onClick={() => userAction(user.id, "delete", {}, `Soft-delete ${user.display_name}? Their record will be retained and their sessions ended.`)}
                    >
                      Delete
                    </button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {message && <p className="settings-message" role="status">{message}</p>}
      </section>
    </div>
  );
}
