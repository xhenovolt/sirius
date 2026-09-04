"use client";

import { useState } from "react";

export default function LogoUpload({ logoUrl }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function upload(event) {
    const file = event.target.files?.[0]; if (!file) return;
    setBusy(true); setMessage(""); const formData = new FormData(); formData.append("logo", file);
    const response = await fetch("/api/settings/logo", { method: "POST", body: formData }); const result = await response.json(); setBusy(false);
    if (!response.ok) setMessage(result.error); else window.location.reload();
  }
  return <div className="logo-upload"><div className="logo-preview">{logoUrl ? <img src={logoUrl} alt="School logo" /> : "S"}</div><label className="button button-light">{busy ? "Uploading..." : logoUrl ? "Change logo" : "Add school logo"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={busy} /></label>{message && <small>{message}</small>}</div>;
}