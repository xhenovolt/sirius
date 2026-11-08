"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestCode(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const value = new FormData(event.currentTarget).get("identifier");
    setIdentifier(value);
    try {
      const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "request", identifier: value }) });
      const result = await response.json();
      if (!response.ok) setError(result.error || "Unable to send a password recovery code.");
      else setSent(true);
    } catch {
      setError("Unable to reach the password recovery service. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function reset(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const body = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) setError(result.error || "Unable to reset the password.");
      else setDone(true);
    } catch {
      setError("Unable to reach the password recovery service. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-page"><div className="auth-box"><div className="brand"><span className="brand-mark">S</span><span>Sirius</span></div><p className="eyebrow">Password recovery</p><h1>{done ? "Password updated" : "Forgot password?"}</h1>{done ? <><p className="intro-copy">You can now sign in with your new password.</p><Link className="button button-primary" href="/login">Back to sign in</Link></> : !sent ? <form onSubmit={requestCode}><p className="intro-copy">If an active account matches and has a valid Uganda mobile number, we will send a one-time code. If you cannot receive the SMS, ask your school administrator to update your phone number or reset your password.</p><label>Email or phone<input name="identifier" required autoComplete="username" /></label>{error && <p className="auth-error">{error}</p>}<button className="button button-primary" type="submit" disabled={busy}>{busy ? "Sending code..." : "Send SMS code"}</button></form> : <form onSubmit={reset}><p className="intro-copy">Enter the six-digit code sent by SMS.</p><label>Email or phone<input name="identifier" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required /></label><label>SMS code<input name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength="6" required /></label><label>New password<input name="password" type="password" minLength="12" required autoComplete="new-password" /></label>{error && <p className="auth-error">{error}</p>}<button className="button button-primary" type="submit" disabled={busy}>{busy ? "Updating password..." : "Update password"}</button></form>}<p className="auth-switch"><Link href="/login">Back to sign in</Link></p><small className="signature">Sirius by Xhenvolt</small></div></main>;
}
