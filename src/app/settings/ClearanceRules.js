"use client";

import { useEffect, useState } from "react";

export default function ClearanceRules({ canManage = true }) {
  const [rules, setRules] = useState([]);
  const [form, setForm] = useState({ threshold: "", className: "", term: "", expiresAt: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function loadRules() {
    const response = await fetch("/api/clearance/rules");
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to load clearance rules.");
    setRules(result.rules || []);
  }

  useEffect(() => {
    loadRules().catch((error) => {
      console.error("Clearance rules request failed", error);
      setMessage(error.message);
    });
  }, []);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/clearance/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error || "Unable to create the rule.");
        return;
      }
      setForm({ threshold: "", className: "", term: "", expiresAt: "" });
      await loadRules();
      setMessage("Clearance threshold saved.");
    } catch (error) {
      console.error("Clearance rule save failed", error);
      setMessage("Unable to save the rule. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/clearance/rules", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error || "Unable to remove the rule.");
        return;
      }
      await loadRules();
      setMessage("Clearance threshold removed.");
    } catch (error) {
      console.error("Clearance rule removal failed", error);
      setMessage("Unable to remove the rule. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel settings-panel clearance-rules">
      <div className="panel-heading">
        <div><p className="eyebrow">Clearance</p><h2>Fee-balance thresholds</h2></div>
      </div>
      <p className="settings-help">A matching active rule allows students whose balance is at or below its threshold. Set the school&apos;s current term in School details to use term-scoped rules.</p>
      {canManage && <form className="settings-form clearance-rule-form" onSubmit={save}>
        <label>Maximum balance<input type="number" min="0" step="0.01" value={form.threshold} onChange={(event) => setForm({ ...form, threshold: event.target.value })} required /></label>
        <label>Class scope (optional)<input maxLength={64} value={form.className} onChange={(event) => setForm({ ...form, className: event.target.value })} /></label>
        <label>Term scope (optional)<input maxLength={64} value={form.term} onChange={(event) => setForm({ ...form, term: event.target.value })} /></label>
        <label>Expiry date (optional)<input type="date" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} /></label>
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving..." : "Add threshold"}</button>
      </form>}
      <div className="clearance-rule-list">
        {rules.length === 0 ? <p className="empty-inline">No active thresholds.</p> : rules.map((rule) => (
          <div className="clearance-rule-row" key={rule.id}>
            <span><strong>{rule.threshold}</strong><small>{[rule.class_name || "All classes", rule.term || "All terms", rule.expires_at ? `Until ${String(rule.expires_at).slice(0, 10)}` : "No expiry"].join(" · ")}</small></span>
            {canManage && <button type="button" onClick={() => remove(rule.id)} disabled={busy}>Remove</button>}
          </div>
        ))}
      </div>
      {message && <p className="settings-message" role="status">{message}</p>}
    </section>
  );
}
