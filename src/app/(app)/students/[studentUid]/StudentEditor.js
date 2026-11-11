"use client";

import { useState } from "react";

const fields = [
  ["student_account_no", "Student account number"],
  ["first_name", "First name"],
  ["last_name", "Last name"],
  ["gender", "Gender"],
  ["class_name", "Class"],
  ["stream", "Stream"],
  ["parent_name", "Parent or guardian"],
  ["parent_phone", "Parent phone"],
  ["fee_balance", "Fee balance"],
];

export default function StudentEditor({ student }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    payload.version = student.version;
    try {
      const response = await fetch(`/api/students/${encodeURIComponent(student.student_uid)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Unable to update the student.");
        return;
      }
      window.location.reload();
    } catch (requestError) {
      console.error("Student update request failed", requestError);
      setError("Unable to update the student. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="student-editor">
      <button className="text-link" type="button" onClick={() => { setEditing((current) => !current); setError(""); }}>
        {editing ? "Cancel editing" : "Edit student details"}
      </button>
      {editing && (
        <form className="student-edit-form" onSubmit={submit}>
          {fields.map(([name, label]) => (
            <label key={name}>{label}<input name={name} required={name === "student_account_no" || name === "first_name" || name === "last_name"} defaultValue={student[name] ?? (name === "fee_balance" ? "0.00" : "")} /></label>
          ))}
          <div className="student-edit-actions">
            {error && <p className="error-message" role="alert">{error}</p>}
            <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving..." : "Save changes"}</button>
          </div>
        </form>
      )}
    </div>
  );
}
