"use client";

/** /control/schools — every school, its usage, plan and lifecycle. */
import { useCallback, useEffect, useState } from "react";
import { useControlAccess } from "@/components/control/ControlAccess";
import { Loader2 } from "@/components/control/icons";

const SEV = {
  ok: "text-emerald-300 bg-emerald-500/10",
  warn: "text-amber-300 bg-amber-500/10",
  critical: "text-orange-300 bg-orange-500/10",
  exceeded: "text-rose-300 bg-rose-500/10",
};

export default function SchoolsPage() {
  const { can } = useControlAccess();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [showProvision, setShowProvision] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ school_name: "", school_code: "", admin_name: "", admin_email: "", admin_password: "" });

  const load = useCallback(async () => {
    setError(null);
    const r = await fetch(`/api/control-center/schools?q=${encodeURIComponent(q)}&page=${page}`, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) { setError(j.error || "Failed to load"); return; }
    setData(j);
  }, [q, page]);

  useEffect(() => { load(); }, [load]);

  const act = useCallback(async (payload, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/control-center/schools", {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) { setError(j.error || "Action failed"); return; }
      await load();
    } finally { setBusy(false); }
  }, [load]);

  const provision = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/control-center/schools", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!r.ok) { setError(j.error || "Failed"); return; }
      setShowProvision(false);
      setForm({ school_name: "", school_code: "", admin_name: "", admin_email: "", admin_password: "" });
      setPage(1);
      await load();
    } finally { setBusy(false); }
  }, [form, load]);

  const input = "px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Schools</h1>
          <p className="text-sm text-slate-400">{data ? `${data.total} school(s)` : "—"}</p>
        </div>
        <div className="flex items-center gap-2">
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search name, code or id" className={`${input} w-56`} />
          {can("schools.create") && (
            <button onClick={() => setShowProvision((v) => !v)} className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm text-white">
              {showProvision ? "Cancel" : "Provision school"}
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      {showProvision && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 grid sm:grid-cols-2 gap-3">
          <input value={form.school_name} onChange={(e) => setForm({ ...form, school_name: e.target.value })} placeholder="School name" className={input} />
          <input value={form.school_code} onChange={(e) => setForm({ ...form, school_code: e.target.value })} placeholder="School code (optional)" className={input} />
          <input value={form.admin_name} onChange={(e) => setForm({ ...form, admin_name: e.target.value })} placeholder="Administrator name" className={input} />
          <input value={form.admin_email} onChange={(e) => setForm({ ...form, admin_email: e.target.value })} placeholder="Administrator email" type="email" className={input} />
          <input value={form.admin_password} onChange={(e) => setForm({ ...form, admin_password: e.target.value })} placeholder="Administrator password (min 8)" type="password" className={input} />
          <div className="sm:col-span-2">
            <button onClick={provision} disabled={busy} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm text-white disabled:opacity-50">
              {busy ? "Provisioning…" : "Create school + administrator"}
            </button>
          </div>
        </div>
      )}

      {!data ? (
        <div className="flex items-center gap-2 text-slate-400"><Loader2 className="w-5 h-5 animate-spin text-indigo-400" /> Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/70 text-slate-400">
              <tr>
                <th className="text-left px-3 py-2 font-medium">School</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">Plan</th>
                <th className="text-right px-3 py-2 font-medium">Learners</th>
                <th className="text-right px-3 py-2 font-medium">Cards</th>
                <th className="text-right px-3 py-2 font-medium">Users (enabled · online)</th>
                <th className="text-left px-3 py-2 font-medium">Capacity</th>
                <th className="text-right px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.schools.map((s) => (
                <tr key={s.school_id} className="border-t border-slate-800/70">
                  <td className="px-3 py-2">
                    <div className="font-medium">{s.school_name}</div>
                    <div className="text-[11px] text-slate-500">{s.school_code || s.school_id}</div>
                  </td>
                  <td className="px-3 py-2 capitalize text-slate-300">{s.status}</td>
                  <td className="px-3 py-2">
                    {can("schools.edit") ? (
                      <select
                        value={s.subscription_plan || ""}
                        onChange={(e) => act({ school_id: s.school_id, action: "assign_plan", plan: e.target.value })}
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs"
                      >
                        <option value="">— no plan (trial) —</option>
                        {data.plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
                      </select>
                    ) : <span className="capitalize text-slate-300">{s.subscription_plan || "trial"}</span>}
                  </td>
                  <td className="px-3 py-2 text-right">{s.learners}</td>
                  <td className="px-3 py-2 text-right">{s.cards}</td>
                  <td className="px-3 py-2 text-right">{s.users} · {s.online_users}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded capitalize ${SEV[s.capacity] || SEV.ok}`}>{s.capacity}</span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {can("schools.suspend") && (
                      <button
                        onClick={() => act({ school_id: s.school_id, action: s.status === "suspended" ? "reactivate" : "suspend" },
                          s.status === "suspended" ? null : `Suspend ${s.school_name}?`)}
                        className="text-xs text-amber-300 hover:underline mr-3"
                      >
                        {s.status === "suspended" ? "Reactivate" : "Suspend"}
                      </button>
                    )}
                    {can("schools.delete") && (
                      <button onClick={() => act({ school_id: s.school_id, action: "soft_delete" }, `Archive ${s.school_name}? Its data is kept but it is hidden.`)}
                        className="text-xs text-rose-300 hover:underline">Archive</button>
                    )}
                  </td>
                </tr>
              ))}
              {!data.schools.length && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">No schools match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > data.page_size && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded-lg bg-slate-800 disabled:opacity-40">Prev</button>
          <span className="text-slate-400">Page {data.page}</span>
          <button disabled={page * data.page_size >= data.total} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg bg-slate-800 disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}
