"use client";

import { useCallback, useEffect, useState } from "react";
import { confirmDialog } from "@/lib/sweetAlert";

const EMPTY_ROLE = { name: "", description: "", permissions: [] };

export default function SchoolRoleManager({ permissionCatalog }) {
  const [roles, setRoles] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(EMPTY_ROLE);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/settings/roles", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load roles.");
      setRoles(result.roles);
    } catch (loadError) {
      console.error("School roles load failed", loadError);
      setError(loadError.message || "Unable to load school roles.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function selectRole(role) {
    if (!role || role.isSystem) {
      setSelectedId(null);
      setForm(EMPTY_ROLE);
      return;
    }
    setSelectedId(role.id);
    setForm({ name: role.name, description: role.description, permissions: [...role.permissions] });
    setError("");
    setMessage("");
  }

  function togglePermission(key) {
    const permissions = new Set(form.permissions);
    if (permissions.has(key)) permissions.delete(key);
    else permissions.add(key);
    setForm({ ...form, permissions: [...permissions] });
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/settings/roles", {
        method: selectedId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, ...(selectedId ? { id: selectedId } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save role.");
      setMessage(selectedId ? "Role updated." : "Role created.");
      setSelectedId(null);
      setForm(EMPTY_ROLE);
      await load();
      window.location.reload();
    } catch (saveError) {
      console.error("School role save failed", saveError);
      setError(saveError.message || "Unable to save role.");
    } finally {
      setBusy(false);
    }
  }

  async function removeRole(role) {
    if (!(await confirmDialog(`Delete the ${role.name} role? Users must be reassigned first.`, {
      title: "Delete custom role?",
      confirmText: "Delete role",
      danger: true,
    }))) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/settings/roles", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: role.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to delete role.");
      await load();
      window.location.reload();
    } catch (removeError) {
      console.error("School role deletion failed", removeError);
      setError(removeError.message || "Unable to delete role.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel settings-panel">
      <div className="panel-heading">
        <div><p className="eyebrow">Role-based access</p><h2>School roles &amp; permissions</h2></div>
      </div>
      <p className="intro-copy">Create school-specific user types and assign granular access. Built-in roles are protected; custom roles can be edited or deleted when no users are assigned.</p>
      {error && <p className="settings-message" role="alert">{error}</p>}
      {message && <p className="settings-message" role="status">{message}</p>}
      <div className="user-list">
        {roles.map((role) => (
          <div className="user-row" key={role.id}>
            <span>
              <strong>{role.name}</strong>
              <small>{role.description || role.slug} · {role.isSystem ? "Built-in" : `${role.permissions.length} permissions`}</small>
            </span>
            {!role.isSystem && <>
              <button type="button" onClick={() => selectRole(role)} disabled={busy}>Edit</button>
              <button type="button" onClick={() => removeRole(role)} disabled={busy || role.assigned}>Delete</button>
            </>}
          </div>
        ))}
      </div>
      <form className="settings-form" onSubmit={save}>
        <p className="eyebrow">{selectedId ? "Edit role" : "Create custom role"}</p>
        <label>Role name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength="100" required /></label>
        <label>Description<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} maxLength="255" /></label>
        <div className="grid sm:grid-cols-2 gap-2">
          {permissionCatalog.map(({ key, label }) => (
            <label key={key} className="flex items-start gap-2">
              <input type="checkbox" checked={form.permissions.includes(key)} onChange={() => togglePermission(key)} />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving…" : selectedId ? "Save role" : "Create role"}</button>
          {selectedId && <button type="button" onClick={() => selectRole(null)} disabled={busy}>Cancel</button>}
        </div>
      </form>
    </section>
  );
}
