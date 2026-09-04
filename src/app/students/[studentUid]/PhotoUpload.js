"use client";

import { useState } from "react";

export default function PhotoUpload({ studentUid }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function upload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true); setMessage("");
    const formData = new FormData(); formData.append("photo", file);
    const response = await fetch(`/api/students/${encodeURIComponent(studentUid)}/photo`, { method: "POST", body: formData });
    const result = await response.json(); setBusy(false);
    if (!response.ok) setMessage(result.error); else window.location.reload();
  }
  return <label className="photo-upload">{busy ? "Uploading..." : "Upload photo"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={busy} />{message && <small>{message}</small>}</label>;
}