"use client";

import Link from "next/link";
import { useState } from "react";

export default function SignupPage() {
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) setError(result.error);
    else setDone(true);
  }

  return <main className="auth-page"><div className="auth-box"><div className="brand"><span className="brand-mark">S</span><span>Sirius</span></div><p className="eyebrow">Xhenvolt student identity</p><h1>Create account</h1>{done ? <><p className="intro-copy">Your account is ready.</p><Link className="button button-primary" href="/login">Continue to sign in</Link></> : <form onSubmit={submit}><label>School name<input name="schoolName" required autoComplete="organization" /></label><label>Your name<input name="displayName" required autoComplete="name" /></label><label>Email<input name="email" type="email" required autoComplete="email" /></label><label>Uganda mobile number<input name="phone" placeholder="07XXXXXXXX" required autoComplete="tel" /></label><label>Password<input name="password" type="password" minLength="12" required autoComplete="new-password" /></label>{error && <p className="auth-error">{error}</p>}<button className="button button-primary" type="submit" disabled={busy}>{busy ? "Creating account..." : "Create account"}</button><p className="auth-switch">Already registered? <Link href="/login">Sign in</Link></p></form>}<small className="signature">Sirius by Xhenvolt</small></div></main>;
}
