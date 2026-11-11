"use client";

import { useState } from "react";

export default function SchoolDetailsForm({ school }) {
  const [form, setForm] = useState({
    schoolName: school.school_name || "",
    schoolCode: school.school_code || "",
    address: school.address || "",
    contactPhone: school.contact_phone || "",
    contactEmail: school.contact_email || "",
    currentTerm: school.current_term || "",
  });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
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
    } finally {
      setBusy(false);
    }
  }

  return (
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
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save school settings"}</button>
        {message && <p className="settings-message" role="status">{message}</p>}
      </form>
    </section>
  );
}