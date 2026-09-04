"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LogoutButton from "../LogoutButton";

export default function ImportPage() {
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/auth/session").then((response) => {
      if (response.status === 401) window.location.href = "/login";
    });
  }, []);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMessage("");
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/imports", { method: "POST", body: formData });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) setMessage(result.error);
    else setPreview(result);
  }

  async function commit() {
    setBusy(true);
    const response = await fetch("/api/imports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: preview.fileName, rows: preview.rows }) });
    const result = await response.json();
    setBusy(false);
    setMessage(response.ok ? `${result.imported} students imported successfully. ${result.skipped} invalid rows skipped.` : result.error);
    if (response.ok) setPreview(null);
  }

  const invalid = preview?.rows.filter((row) => !row.valid) || [];
    return <div className="app-shell"><header className="topbar"><Link className="brand" href="/"><span className="brand-mark">S</span><span>Sirius</span></Link><nav className="main-nav" aria-label="Main navigation"><Link href="/">Overview</Link><Link href="/students">Students</Link><Link className="active" href="/import">Import</Link><Link href="/#cards">Cards</Link></nav><LogoutButton /></header><main className="dashboard import-page"><div className="page-title"><div><p className="eyebrow">Student records</p><h1>Import students</h1><p className="intro-copy">Upload a spreadsheet, review the rows, then add valid records.</p></div></div><label className="upload-zone"><span className="upload-icon">↥</span><strong>{busy ? "Processing spreadsheet..." : "Choose an Excel spreadsheet"}</strong><small>Supported formats: .xlsx, .xls, .csv</small><input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} disabled={busy} /></label>{message && <div className="import-message">{message}</div>}{preview && <section className="import-preview panel"><div className="panel-heading"><div><p className="eyebrow">Review before importing</p><h2>{preview.fileName}</h2></div><span className="preview-count">{preview.valid} of {preview.total} valid</span></div><div className="preview-table">{preview.rows.slice(0, 100).map((row) => <div className={`preview-row ${row.valid ? "" : "invalid-row"}`} key={row.rowNumber}><span>Row {row.rowNumber}</span><strong>{row.first_name} {row.last_name}</strong><span>{row.admission_number || "Missing admission number"}</span><span>{row.valid ? "Ready" : row.errors.join(", ")}</span></div>)}</div>{preview.total > 100 && <p className="preview-note">Showing the first 100 rows. All {preview.total} rows will be validated and processed.</p>}<button className="button button-primary import-submit" type="button" disabled={busy || preview.valid === 0} onClick={commit}>Import {preview.valid} valid students</button>{invalid.length > 0 && <p className="preview-note">Invalid rows will remain out of the import and are listed above for correction.</p>}</section>}</main></div>;
}