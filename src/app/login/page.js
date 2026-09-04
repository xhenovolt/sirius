"use client";

import { useState } from "react";
import Link from "next/link";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    const body = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) setError(result.error); else window.location.href = "/";
    setBusy(false);
  }

  return <main className="auth-page"><div className="auth-box"><div className="brand"><span className="brand-mark">S</span><span>Sirius</span></div><p className="eyebrow">Xhenvolt student identity</p><h1>Sign in</h1><p className="intro-copy">Access your school records securely.</p><form onSubmit={submit}><label>Email<input name="email" type="email" required autoComplete="email" /></label><label>Password<input name="password" type="password" required autoComplete="current-password" /></label>{error && <p className="auth-error">{error}</p>}<button className="button button-primary" type="submit" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button><p className="auth-switch"><Link href="/signup">Create an account</Link> · <Link href="/forgot-password">Forgot password?</Link></p></form><small className="signature">Sirius by Xhenvolt</small></div></main>;
}