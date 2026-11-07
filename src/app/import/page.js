"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LogoutButton from "../LogoutButton";

const editableFields = [
  { key: "student_account_no", label: "Student account no." },
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "gender", label: "Gender" },
  { key: "class_name", label: "Class" },
  { key: "stream", label: "Stream" },
  { key: "photo_url", label: "Photo URL", wide: true },
  { key: "parent_name", label: "Parent name" },
  { key: "parent_phone", label: "Parent phone" },
];

const pageSize = 50;

function seedDrafts(rows) {
  const drafts = {};
  for (const row of rows) {
    const draft = {};
    for (const field of editableFields) draft[field.key] = row.extracted[field.key] || "";
    drafts[row.id] = draft;
  }
  return drafts;
}

function isDirty(row, draft) {
  if (!draft) return false;
  return editableFields.some((field) => (draft[field.key] || "") !== (row.extracted[field.key] || ""));
}

export default function ImportPage() {
  const [batch, setBatch] = useState(null);
  const [rows, setRows] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth/session").then((response) => {
      if (response.status === 401) window.location.href = "/login";
    });
  }, []);

  function applyPayload(payload) {
    setBatch(payload.batch);
    setRows(payload.rows);
    setDrafts(seedDrafts(payload.rows));
    setTotal(payload.total);
    setPage(payload.page);
  }

  async function loadBatch(batchId, nextPage, nextFilter) {
    const response = await fetch(`/api/imports/${batchId}?page=${nextPage}&pageSize=${pageSize}&filter=${nextFilter}`);
    const result = await response.json();
    if (!response.ok) {
      setError(result.error);
      return false;
    }
    applyPayload(result);
    setFilter(nextFilter);
    return true;
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    setMessage("");
    setBatch(null);
    setRows([]);
    setDrafts({});
    setTotal(0);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/imports", { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error);
        return;
      }
      setMessage(`${result.total} rows staged from ${result.fileName}. Nothing is saved to students until you commit.`);
      await loadBatch(result.batchId, 1, result.invalid > 0 ? "invalid" : "all");
    } finally {
      setBusy(false);
    }
  }

  function editRow(rowId, key, value) {
    setDrafts((current) => ({ ...current, [rowId]: { ...current[rowId], [key]: value } }));
  }

  const dirtyRows = rows.filter((row) => isDirty(row, drafts[row.id]));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  async function saveChanges() {
    if (dirtyRows.length === 0) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/imports/${batch.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: dirtyRows.map((row) => ({ id: row.id, ...drafts[row.id] })), page, pageSize, filter }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error);
        return;
      }
      applyPayload(result);
      setMessage(`${dirtyRows.length} row${dirtyRows.length === 1 ? "" : "s"} saved. ${result.batch.validRows} of ${result.batch.totalRows} rows are ready.`);
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (dirtyRows.length > 0) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/imports/${batch.id}`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error);
        return;
      }
      setMessage(`${result.imported} students imported. ${result.skipped} invalid rows were skipped.`);
      setBatch(null);
      setRows([]);
      setDrafts({});
      setTotal(0);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/"><span className="brand-mark">S</span><span>Sirius</span></Link>
        <nav className="main-nav" aria-label="Main navigation">
          <Link href="/">Overview</Link>
          <Link href="/students">Students</Link>
          <Link className="active" href="/import">Import</Link>
          <Link href="/#cards">Cards</Link>
        </nav>
        <LogoutButton />
      </header>
      <main className="dashboard import-page">
        <div className="page-title">
          <div>
            <p className="eyebrow">Student records</p>
            <h1>Import students</h1>
            <p className="intro-copy">Upload a spreadsheet, review every row, then commit the valid records.</p>
          </div>
        </div>

        <label className="upload-zone">
          <span className="upload-icon">↥</span>
          <strong>{busy ? "Reading spreadsheet..." : "Choose a spreadsheet"}</strong>
          <small>Supported formats: .xlsx, .csv</small>
          <input type="file" accept=".xlsx,.csv" onChange={handleFile} disabled={busy} />
        </label>

        {message && <div className="import-message">{message}</div>}
        {error && <div className="import-message import-error">{error}</div>}

        {batch && (
          <section className="import-preview panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Review before committing</p>
                <h2>{batch.fileName}</h2>
              </div>
              <span className="preview-count">{batch.validRows} of {batch.totalRows} ready</span>
            </div>

            <div className="review-toolbar">
              <div className="review-filters">
                <button type="button" className={filter === "all" ? "active" : ""} onClick={() => loadBatch(batch.id, 1, "all")} disabled={busy}>All rows</button>
                <button type="button" className={filter === "invalid" ? "active" : ""} onClick={() => loadBatch(batch.id, 1, "invalid")} disabled={busy}>Needs attention ({batch.invalidRows})</button>
              </div>
              <span className="preview-note">Fix any value in place, then save. Invalid rows are left out of the commit.</span>
            </div>

            {rows.length === 0 ? (
              <p className="empty-inline" style={{ padding: "0 25px 12px" }}>
                {filter === "invalid" ? "No rows need attention." : "This import has no rows."}
              </p>
            ) : (
              <div className="review-table-wrap">
                <table className="review-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      {editableFields.map((field) => <th key={field.key} className={field.wide ? "review-wide" : ""}>{field.label}</th>)}
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const draft = drafts[row.id] || {};
                      const dirty = isDirty(row, draft);
                      const locked = batch.status === "completed";
                      return (
                        <tr key={row.id} className={dirty ? "dirty-row" : row.status === "invalid" ? "invalid-row" : ""}>
                          <td className="review-row-number">{row.rowNumber}</td>
                          {editableFields.map((field) => (
                            <td key={field.key} className={field.wide ? "review-wide" : ""}>
                              <input
                                className={`review-input ${dirty ? "dirty" : ""}`}
                                value={draft[field.key] || ""}
                                onChange={(event) => editRow(row.id, field.key, event.target.value)}
                                disabled={busy || locked}
                                aria-label={`${field.label} for row ${row.rowNumber}`}
                              />
                            </td>
                          ))}
                          <td>
                            <span className={`review-status ${row.status === "invalid" ? "invalid" : "valid"}`}>
                              {row.status === "invalid" ? "Invalid" : row.status === "committed" ? "Imported" : "Ready"}
                            </span>
                            {row.errors.length > 0 && <div className="review-errors">{row.errors.join(", ")}</div>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="review-actions">
              <div className="review-pager">
                <button type="button" onClick={() => loadBatch(batch.id, page - 1, filter)} disabled={busy || page <= 1}>Previous</button>
                <span>Page {page} of {totalPages}</span>
                <button type="button" onClick={() => loadBatch(batch.id, page + 1, filter)} disabled={busy || page >= totalPages}>Next</button>
              </div>
              <div className="review-actions-buttons">
                <button className="button" type="button" onClick={saveChanges} disabled={busy || dirtyRows.length === 0}>
                  Save {dirtyRows.length > 0 ? `${dirtyRows.length} change${dirtyRows.length === 1 ? "" : "s"}` : "changes"}
                </button>
                <button className="button button-primary" type="button" onClick={commit} disabled={busy || batch.validRows === 0 || dirtyRows.length > 0}>
                  Commit {batch.validRows} valid students
                </button>
              </div>
            </div>

            {batch.invalidRows > 0 && <p className="preview-note">{batch.invalidRows} invalid rows will remain out of the import and stay available here for correction.</p>}
          </section>
        )}
      </main>
    </div>
  );
}
