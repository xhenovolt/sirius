"use client";

/** /control/sessions — the operator's own active Control Center sessions. */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Monitor, Smartphone, CheckCircle2, Shield } from "@/components/control/icons";

function describe(userAgent) {
  const ua = String(userAgent || "");
  const browser = /Edg\//i.test(ua) ? "Edge" : /OPR\//i.test(ua) ? "Opera" : /Chrome\//i.test(ua) ? "Chrome" : /Firefox\//i.test(ua) ? "Firefox" : /Safari\//i.test(ua) ? "Safari" : "Unknown browser";
  const os = /Windows/i.test(ua) ? "Windows" : /Android/i.test(ua) ? "Android" : /iPhone|iPad|iOS/i.test(ua) ? "iOS" : /Mac OS X|Macintosh/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "Unknown OS";
  return { browser, os, mobile: /Android|iPhone|iPad|Mobile/i.test(ua) };
}

export default function SessionsPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    const r = await fetch("/api/control-center/sessions", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) { setError(j.error || "Failed to load"); return; }
    setData(j.sessions);
  }, []);
  useEffect(() => { load(); }, [load]);

  const revoke = useCallback(async (id) => {
    if (!window.confirm("Revoke this Control Center session immediately?")) return;
    setBusy(id); setError(null);
    try {
      const r = await fetch(`/api/control-center/sessions?id=${id}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) { setError(j.error || "Failed"); return; }
      await load();
    } finally { setBusy(null); }
  }, [load]);

  const revokeAction = useCallback(async (action) => {
    const prompt = action === "revoke_all" ? "Revoke every Control Center session, including this one?" : "Revoke all other Control Center sessions?";
    if (!window.confirm(prompt)) return;
    setBusy(action); setError(null);
    try {
      const r = await fetch("/api/control-center/sessions", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j.error || "Failed"); return; }
      if (action === "revoke_all") router.replace("/control");
      else await load();
    } finally { setBusy(null); }
  }, [load, router]);

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Active sessions</h1>
          <p className="text-sm text-slate-400 mt-1">Review and revoke sessions for your Control Center account.</p>
        </div>
        <div className="flex gap-2 text-xs">
          <button onClick={() => revokeAction("revoke_others")} disabled={busy !== null}
            className="px-3 py-2 rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:opacity-50">Sign out other sessions</button>
          <button onClick={() => revokeAction("revoke_all")} disabled={busy !== null}
            className="px-3 py-2 rounded-lg bg-rose-700 text-white hover:bg-rose-600 disabled:opacity-50">Sign out all</button>
        </div>
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      {!data ? (
        <div className="flex items-center gap-2 text-slate-400"><Loader2 className="w-5 h-5 animate-spin text-indigo-400" /> Loading…</div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl divide-y divide-slate-800">
          {!data.length && <div className="p-8 text-center text-sm text-slate-500">No active sessions.</div>}
          {data.map((session) => {
            const device = describe(session.user_agent);
            return (
              <div key={session.id} className="p-4 flex items-start gap-3">
                {device.mobile ? <Smartphone className="w-5 h-5 text-slate-400 mt-1" /> : <Monitor className="w-5 h-5 text-slate-400 mt-1" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-100">
                    {device.browser} · {device.os}
                    {session.is_current && <span className="inline-flex items-center gap-1 text-emerald-300 text-xs"><CheckCircle2 className="w-3.5 h-3.5" /> This computer</span>}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Logged in: {new Date(session.created_at).toLocaleString()} · Last active: {session.last_activity_at ? new Date(session.last_activity_at).toLocaleString() : "Unknown"}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">IP: {session.ip || "Unknown"} · Session ref: {session.session_ref}</div>
                </div>
                {!session.is_current && (
                  <button onClick={() => revoke(session.id)} disabled={busy !== null}
                    className="px-3 py-1.5 rounded-lg border border-rose-800 text-rose-300 text-xs hover:bg-rose-950 disabled:opacity-50">
                    {busy === session.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Revoke"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-slate-500 flex items-center gap-2"><Shield className="w-4 h-4" /> Session references are non-secret identifiers. Raw session tokens are never displayed or stored.</p>
    </div>
  );
}
