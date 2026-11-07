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
  { key: "fee_balance", label: "Fee balance" },
];
const requiredMappingFields = ["student_account_no", "first_name", "last_name"];

const pageSize = 50;

async function fetchImportHistory() {
  const response = await fetch("/api/imports");
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to load import history.");
  return result;
}

function seedDrafts(rows) {
  const drafts = {};
  for (const row of rows) {
    const draft = {};
    for (const field of editableFields) draft[field.key] = row.extracted[field.key] || "";
    drafts[row.id] = draft;
  }
  return drafts;
}

function seedDecisions(rows) {
  const decisions = {};
  for (const row of rows) {
    decisions[row.id] = {
      acceptedFields: row.reviewDecisions?.acceptedFields || [],
      rowDecision: row.reviewDecisions?.rowDecision || null,
    };
  }
  return decisions;
}

function isDirty(row, draft) {
  if (!draft) return false;
  return editableFields.some((field) => (draft[field.key] || "") !== (row.extracted[field.key] || ""));
}

function isDecisionDirty(row, decision) {
  const saved = row.reviewDecisions || {};
  const fields = [...(decision?.acceptedFields || [])].sort();
  const savedFields = [...(saved.acceptedFields || [])].sort();
  return decision?.rowDecision !== (saved.rowDecision || null) || fields.join(",") !== savedFields.join(",");
}

export default function ImportPage() {
  const [batch, setBatch] = useState(null);
  const [rows, setRows] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [decisions, setDecisions] = useState({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [versions, setVersions] = useState([]);
  const [history, setHistory] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [mapping, setMapping] = useState({});
  const [templateName, setTemplateName] = useState("");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth/session").then((response) => {
      if (response.status === 401) window.location.href = "/login";
    });
    fetchImportHistory()
      .then((result) => {
        setHistory(result.batches || []);
        setTemplates(result.templates || []);
      })
      .catch((requestError) => {
        console.error("Import history request failed", requestError);
        setError("Unable to load import history. Refresh the page to try again.");
      });
  }, []);

  function applyPayload(payload) {
    setBatch(payload.batch);
    setRows(payload.rows);
    setDrafts(seedDrafts(payload.rows));
    setDecisions(seedDecisions(payload.rows));
    setTotal(payload.total);
    setPage(payload.page);
    setVersions(payload.versions || []);
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
    setAnalysis(null);
    setPendingFile(null);
    setMapping({});
    setBatch(null);
    setRows([]);
    setDrafts({});
    setTotal(0);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", "analyze");
      const response = await fetch("/api/imports", { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error);
        return;
      }
      setAnalysis(result);
      setPendingFile(file);
      setMapping(Object.fromEntries(Object.entries(result.suggestions).map(([field, suggestion]) => [field, suggestion.header])));
      setMessage(`Review the suggested column mapping for ${result.fileName} before staging any rows.`);
    } catch (requestError) {
      console.error("Spreadsheet analysis failed", requestError);
      setError("Unable to analyze the spreadsheet. Check the file and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function stageMappedFile() {
    if (!pendingFile || !analysis) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("file", pendingFile);
      formData.append("mode", "stage");
      formData.append("mapping", JSON.stringify(mapping));
      const response = await fetch("/api/imports", { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Unable to stage the spreadsheet.");
        return;
      }
      setAnalysis(null);
      setPendingFile(null);
      setMessage(`${result.total} rows staged from ${result.fileName}. Nothing is saved to students until you commit.`);
      await loadBatch(result.batchId, 1, result.invalid > 0 ? "invalid" : "all");
      const historyResult = await fetchImportHistory();
      setHistory(historyResult.batches || []);
      setTemplates(historyResult.templates || []);
    } catch (requestError) {
      console.error("Spreadsheet staging failed", requestError);
      setError("Unable to stage the spreadsheet. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function saveTemplate() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save-template", name: templateName, mapping }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Unable to save the mapping template.");
        return;
      }
      setTemplates(result.templates || []);
      setMessage(`Mapping template "${templateName.trim()}" saved for this school.`);
      setTemplateName("");
    } catch (requestError) {
      console.error("Mapping template save failed", requestError);
      setError("Unable to save the mapping template. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function applyTemplate(templateId) {
    const template = templates.find((item) => String(item.id) === templateId);
    if (!template || !analysis) return;
    setMapping(Object.fromEntries(editableFields.map(({ key }) => [
      key,
      analysis.headers.includes(template.mapping[key]) ? template.mapping[key] : "",
    ])));
  }

  function editRow(rowId, key, value) {
    setDrafts((current) => ({ ...current, [rowId]: { ...current[rowId], [key]: value } }));
  }

  function chooseRow(row, rowDecision) {
    setDecisions((current) => ({
      ...current,
      [row.id]: {
        acceptedFields: rowDecision === "accepted" ? editableFields.map((field) => field.key) : [],
        rowDecision,
      },
    }));
  }

  function toggleField(row, field, checked) {
    setDecisions((current) => {
      const currentDecision = current[row.id] || { acceptedFields: [], rowDecision: null };
      const fields = new Set(currentDecision.rowDecision === "accepted"
        ? editableFields.map((item) => item.key)
        : currentDecision.acceptedFields);
      if (checked) fields.add(field);
      else fields.delete(field);
      return {
        ...current,
        [row.id]: { acceptedFields: [...fields], rowDecision: null },
      };
    });
  }

  function chooseVisibleRows(rowDecision) {
    setDecisions((current) => {
      const next = { ...current };
      for (const row of rows) {
        if (row.status === "invalid" || row.status === "skipped" || row.status === "committed") continue;
        next[row.id] = {
          acceptedFields: rowDecision === "accepted" ? editableFields.map((field) => field.key) : [],
          rowDecision,
        };
      }
      return next;
    });
  }

  const dirtyRows = rows.filter((row) => isDirty(row, drafts[row.id]) || isDecisionDirty(row, decisions[row.id]));
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
        body: JSON.stringify({ rows: dirtyRows.map((row) => ({ id: row.id, ...drafts[row.id], ...decisions[row.id] })), page, pageSize, filter }),
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
      setMessage(`${result.imported} students imported. ${result.skipped} rejected or invalid rows were skipped.`);
      await loadBatch(batch.id, 1, "all");
      const historyResponse = await fetch("/api/imports");
      const historyResult = await historyResponse.json();
      if (historyResponse.ok) setHistory(historyResult.batches || []);
    } finally {
      setBusy(false);
    }
  }

  async function rollback() {
    if (!batch || batch.status !== "completed") return;
    if (!window.confirm("Roll back this import? This only works if its students have not changed since the commit.")) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/imports/${batch.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Unable to roll back the import.");
        return;
      }
      setMessage(`Import rolled back. ${result.restored} existing students restored; ${result.removed} new students removed.`);
      await loadBatch(batch.id, 1, "all");
      const historyResponse = await fetch("/api/imports");
      const historyResult = await historyResponse.json();
      if (!historyResponse.ok) throw new Error(historyResult.error || "Unable to refresh import history.");
      setHistory(historyResult.batches || []);
    } catch (requestError) {
      console.error("Import rollback request failed", requestError);
      setError("Unable to roll back the import. Check the connection and try again.");
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

        {analysis && (
          <section className="mapping-review panel">
            <div className="panel-heading">
              <div><p className="eyebrow">Confirm deterministic suggestions</p><h2>{analysis.fileName}</h2></div>
              <span className="preview-count">{analysis.headers.length} columns found</span>
            </div>
            {templates.length > 0 && (
              <label className="mapping-template-select">
                Use a saved school mapping
                <select defaultValue="" onChange={(event) => applyTemplate(event.target.value)} disabled={busy}>
                  <option value="">Choose template</option>
                  {templates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}
                </select>
              </label>
            )}
            <div className="mapping-table">
              {editableFields.map(({ key, label }) => {
                const suggestion = analysis.suggestions[key];
                const selectedElsewhere = new Set(Object.entries(mapping).filter(([field]) => field !== key).map(([, header]) => header));
                return (
                  <label className="mapping-row" key={key}>
                    <span><strong>{label}</strong><small>{suggestion.reason} · {Math.round(suggestion.confidence * 100)}% confidence</small></span>
                    <select value={mapping[key] || ""} onChange={(event) => setMapping((current) => ({ ...current, [key]: event.target.value }))} disabled={busy}>
                      <option value="">Not mapped</option>
                      {analysis.headers.map((header) => <option value={header} key={header} disabled={selectedElsewhere.has(header)}>{header}</option>)}
                    </select>
                  </label>
                );
              })}
            </div>
            <div className="mapping-actions">
              <label>Save as a school template<input value={templateName} onChange={(event) => setTemplateName(event.target.value)} maxLength={100} disabled={busy} /></label>
              <button type="button" onClick={saveTemplate} disabled={busy || !templateName.trim() || requiredMappingFields.some((field) => !mapping[field])}>Save template</button>
              <button className="button button-primary" type="button" onClick={stageMappedFile} disabled={busy || analysis.rowCount === 0 || requiredMappingFields.some((field) => !mapping[field])}>
                {busy ? "Working..." : `Stage ${analysis.rowCount} rows`}
              </button>
            </div>
            <p className="preview-note">{analysis.rowCount === 0 ? "No student data rows were found in this file." : "Low-confidence and shape-based matches require your confirmation. No student records change until you review and commit."}</p>
          </section>
        )}

        <section className="import-history panel">
          <div className="panel-heading"><div><p className="eyebrow">Saved imports</p><h2>Recent batches</h2></div></div>
          {history.length === 0 ? <p className="empty-inline">No imports yet.</p> : history.map((item) => (
            <div className="import-history-row" key={item.id}>
              <span><strong>{item.fileName}</strong><small>{item.status} · {item.totalRows} rows · {item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}</small></span>
              <button type="button" onClick={() => loadBatch(item.id, 1, "all")} disabled={busy}>Open</button>
            </div>
          ))}
        </section>

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
              <span className="preview-note">Compare each row with current records. Accept all, reject, or select fields; only accepted values are committed.</span>
            </div>
            <div className="review-bulk-actions">
              <button type="button" onClick={() => chooseVisibleRows("accepted")} disabled={busy || batch.status !== "preview"}>Accept visible valid rows</button>
              <button type="button" onClick={() => chooseVisibleRows("rejected")} disabled={busy || batch.status !== "preview"}>Reject visible valid rows</button>
            </div>
            <div className="import-downloads">
              <a href={`/api/imports/${batch.id}/download?source=original`}>Download original file</a>
              {versions.map((version) => (
                <span key={version.version_no}>
                  Version {version.version_no}:
                  {" "}<a href={`/api/imports/${batch.id}/download?version=${version.version_no}&format=xlsx`}>XLSX</a>
                  {" "}<a href={`/api/imports/${batch.id}/download?version=${version.version_no}&format=csv`}>CSV</a>
                </span>
              ))}
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
                      <th>Diff</th>
                      <th>Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const draft = drafts[row.id] || {};
                      const dirty = isDirty(row, draft);
                      const locked = batch.status !== "preview";
                      const decision = decisions[row.id] || { acceptedFields: [], rowDecision: null };
                      return (
                        <tr key={row.id} className={dirty ? "dirty-row" : row.status === "invalid" ? "invalid-row" : ""}>
                          <td className="review-row-number">{row.rowNumber}</td>
                          {editableFields.map((field) => (
                            <td key={field.key} className={field.wide ? "review-wide" : ""}>
                              {row.differences[field.key] && (
                                <>
                                  <small className="review-current-value">
                                    {row.diffType === "NEW" ? "New student" : `Current: ${row.differences[field.key].current || "—"}`}
                                  </small>
                                  <label className="review-field-decision">
                                    <input
                                      type="checkbox"
                                      checked={decision.rowDecision === "accepted" || decision.acceptedFields.includes(field.key)}
                                      onChange={(event) => toggleField(row, field.key, event.target.checked)}
                                      disabled={busy || locked || row.status === "invalid"}
                                    />
                                    Accept
                                  </label>
                                </>
                              )}
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
                            <span className={`review-status ${row.diffType.toLowerCase()}`}>{row.diffType}</span>
                            {row.errors.length > 0 && <div className="review-errors">{row.errors.join(", ")}</div>}
                          </td>
                          <td>
                            <div className="review-row-decisions">
                              <button type="button" onClick={() => chooseRow(row, "accepted")} disabled={busy || locked || row.status === "invalid"}>Accept row</button>
                              <button type="button" onClick={() => chooseRow(row, "rejected")} disabled={busy || locked || row.status === "invalid"}>Reject</button>
                              {row.status === "committed" ? "Imported" : row.status === "skipped" ? "Skipped" : decision.rowDecision || (decision.acceptedFields.length ? "Partial" : "Pending")}
                            </div>
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
                <button className="button button-primary" type="button" onClick={commit} disabled={busy || batch.status !== "preview" || dirtyRows.length > 0}>
                  {batch.status === "completed" ? "Import completed" : batch.status === "rolled_back" ? "Import rolled back" : "Commit accepted changes"}
                </button>
                {batch.status === "completed" && <button className="button" type="button" onClick={rollback} disabled={busy}>Roll back import</button>}
              </div>
            </div>

            {batch.invalidRows > 0 && <p className="preview-note">{batch.invalidRows} invalid rows will remain out of the import and stay available here for correction.</p>}
          </section>
        )}
      </main>
    </div>
  );
}
