"use client";

import { useState } from "react";

const fields = [
  ["student_account_no", "Student account number", true],
  ["first_name", "First name", true],
  ["last_name", "Last name", true],
  ["gender", "Gender"],
  ["class_name", "Class"],
  ["stream", "Stream"],
  ["parent_name", "Parent or guardian"],
  ["parent_phone", "Parent phone"],
  ["fee_balance", "Fee balance", false, "number"],
];

export default function StudentCreateForm({ open = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    try {
      const response = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Unable to create the student.");
        return;
      }
      window.location.assign(`/students/${encodeURIComponent(result.studentUid)}`);
    } catch (requestError) {
      console.error("Student creation request failed", requestError);
      setError("Unable to create the student. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="student-create" open={open}>
      <summary>Add one student</summary>
      <form className="student-edit-form" onSubmit={submit}>
        {fields.map(([name, label, required, type]) => (
          <label key={name}>{label}<input name={name} type={type || "text"} required={required} min={type === "number" ? "0" : undefined} step={type === "number" ? "0.01" : undefined} defaultValue={name === "fee_balance" ? "0.00" : ""} /></label>
        ))}
        <div className="student-edit-actions">
          {error && <p className="error-message" role="alert">{error}</p>}
          <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Creating..." : "Create student"}</button>
        </div>
      </form>
    </details>
  );
}
