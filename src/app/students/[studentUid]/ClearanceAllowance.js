"use client";

import { useEffect, useState } from "react";

export default function ClearanceAllowance({ studentUid }) {
  const [allowances, setAllowances] = useState([]);
  const [allowedUntil, setAllowedUntil] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const url = `/api/students/${encodeURIComponent(studentUid)}/clearance-allowance`;

  async function loadAllowances() {
    const response = await fetch(url);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to load allowances.");
    setAllowances(result.allowances || []);
  }

  useEffect(() => {
    loadAllowances().catch((error) => {
      console.error("Clearance allowance request failed", error);
      setMessage(error.message);
    });
  }, [url]);

  async function grant(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowedUntil, reason }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error || "Unable to grant the allowance.");
        return;
      }
      setAllowedUntil("");
      setReason("");
      await loadAllowances();
      setMessage("Clearance allowance granted.");
    } catch (error) {
      console.error("Clearance allowance grant failed", error);
      setMessage("Unable to grant the allowance. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(allowanceId) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(url, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowanceId }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error || "Unable to revoke the allowance.");
        return;
      }
      await loadAllowances();
      setMessage("Clearance allowance revoked.");
    } catch (error) {
      console.error("Clearance allowance revoke failed", error);
      setMessage("Unable to revoke the allowance. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel clearance-allowance">
      <div className="panel-heading"><div><p className="eyebrow">Clearance override</p><h2>Temporary allowance</h2></div></div>
      <p className="settings-help">An active allowance overrides balance thresholds until its expiry date. Each grant replaces the student&apos;s previous active allowance.</p>
      <form className="clearance-allowance-form" onSubmit={grant}>
        <label>Allowed through<input type="date" value={allowedUntil} onChange={(event) => setAllowedUntil(event.target.value)} required /></label>
        <label>Reason<input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} required /></label>
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving..." : "Grant allowance"}</button>
      </form>
      <div className="clearance-rule-list">
        {allowances.length === 0 ? <p className="empty-inline">No active allowance.</p> : allowances.map((allowance) => (
          <div className="clearance-rule-row" key={allowance.id}>
            <span><strong>Until {String(allowance.allowed_until).slice(0, 10)}</strong><small>{allowance.reason}</small></span>
            <button type="button" onClick={() => revoke(allowance.id)} disabled={busy}>Revoke</button>
          </div>
        ))}
      </div>
      {message && <p className="settings-message" role="status">{message}</p>}
    </section>
  );
}
