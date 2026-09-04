"use client";

import { useState } from "react";

export default function UserCreateForm() {
  const [form, setForm] = useState({ displayName: "", email: "", phone: "", password: "", role: "operator" });
  const [message, setMessage] = useState("");

  async function submit(event) {
    event.preventDefault();
    const response = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const result = await response.json();
    if (response.ok) window.location.reload();
    else setMessage(result.error || "Unable to create account.");
  }

  return <form className="settings-form user-create-form" onSubmit={submit}><p className="eyebrow">Add account</p><input placeholder="Full name" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} required /><input placeholder="Email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /><input placeholder="Phone (optional)" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /><input placeholder="Temporary password (12+ characters)" type="password" minLength="12" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="operator">Operator</option><option value="admin">Administrator</option></select><button className="button button-primary" type="submit">Create account</button>{message && <p className="settings-message">{message}</p>}</form>;
}
