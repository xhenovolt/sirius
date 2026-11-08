"use client";

import { useState } from "react";
import { useSchoolPasswordPolicy } from "@/components/SchoolPasswordPolicy";
import { describeSchoolPasswordPolicy } from "@/lib/passwordPolicyRules";

export default function UserCreateForm({ roles = [], isSuperAdmin = false }) {
  const { policy, loadError } = useSchoolPasswordPolicy();
  const [form, setForm] = useState({ displayName: "", email: "", phone: "", password: "", role: "operator" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const result = await response.json();
      if (response.ok) window.location.reload();
      else setMessage(result.error || "Unable to create user.");
    } catch {
      setMessage("Unable to create user. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="settings-form user-create-form" onSubmit={submit}>
      <p className="eyebrow">Add user</p>
      <input placeholder="Full name" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} required />
      <input placeholder="Email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
      <input placeholder="Uganda mobile number (for password recovery)" type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required />
      <input placeholder="Temporary password" type="password" minLength={policy.minLength} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
      <p className="settings-message">{describeSchoolPasswordPolicy(policy)}</p>
      {loadError && <p className="settings-message">{loadError}</p>}
      <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
        {roles.filter((role) => isSuperAdmin || ["admin", "operator"].includes(role.slug)).map((role) => (
          <option key={role.id} value={role.slug}>{role.name}</option>
        ))}
      </select>
      <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Creating user…" : "Create user"}</button>
      {message && <p className="settings-message" role="status">{message}</p>}
    </form>
  );
}
