"use client";

/** /control/plans — the subscription plan catalog. */
import { useCallback, useEffect, useState } from "react";
import { useControlAccess } from "@/components/control/ControlAccess";
import { Loader2 } from "@/components/control/icons";

const EMPTY = {
  code: "", name: "", tier: 0, price: 0, installation_fee: 0, currency: "UGX",
  billing_cycle: "annual", installments: 1,
  limits: { learners: "", users: "", cards: "", storage_mb: "" },
};

export default function PlansPage() {
  const { can } = useControlAccess();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const r = await fetch("/api/control-center/plans", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) { setError(j.error || "Failed to load"); return; }
    setData(j);
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/control-center/plans", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(editing),
      });
      const j = await r.json();
      if (!r.ok) { setError(j.error || "Failed"); return; }
      setEditing(null);
      await load();
    } finally { setBusy(false); }
  }, [editing, load]);

  const remove = useCallback(async (code) => {
    if (!window.confirm(`Delete the "${code}" plan?`)) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/control-center/plans?code=${encodeURIComponent(code)}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) { setError(j.error || "Failed"); return; }
      await load();
    } finally { setBusy(false); }
  }, [load]);

  const input = "px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-indigo-500 w-full";

  if (!data) return <div className="flex items-center gap-2 text-slate-400"><Loader2 className="w-5 h-5 animate-spin text-indigo-400" /> Loading…</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Plans</h1>
          <p className="text-sm text-slate-400">A new commercial plan is a database change, not a deployment.</p>
        </div>
        {can("plans.create") && (
          <button onClick={() => setEditing({ ...EMPTY })} className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm text-white">New plan</button>
        )}
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      {editing && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 grid sm:grid-cols-3 gap-3">
          <label className="text-xs text-slate-400 space-y-1">Code
            <input value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} className={input} placeholder="starter" disabled={data.plans.some((p) => p.code === editing.code)} />
          </label>
          <label className="text-xs text-slate-400 space-y-1">Name
            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={input} placeholder="Starter" />
          </label>
          <label className="text-xs text-slate-400 space-y-1">Tier (order)
            <input value={editing.tier} onChange={(e) => setEditing({ ...editing, tier: e.target.value })} type="number" className={input} />
          </label>
          {data.limit_keys.map((key) => (
            <label key={key} className="text-xs text-slate-400 space-y-1 capitalize">{key.replace("_", " ")} (blank = unlimited)
              <input value={editing.limits?.[key] ?? ""} onChange={(e) => setEditing({ ...editing, limits: { ...editing.limits, [key]: e.target.value } })} type="number" className={input} />
            </label>
          ))}
          <label className="text-xs text-slate-400 space-y-1">Price
            <input value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} type="number" className={input} />
          </label>
          <label className="text-xs text-slate-400 space-y-1">Installation fee
            <input value={editing.installation_fee} onChange={(e) => setEditing({ ...editing, installation_fee: e.target.value })} type="number" className={input} />
          </label>
          <label className="text-xs text-slate-400 space-y-1">Currency
            <input value={editing.currency} onChange={(e) => setEditing({ ...editing, currency: e.target.value })} className={input} />
          </label>
          <label className="text-xs text-slate-400 space-y-1">Billing cycle
            <select value={editing.billing_cycle} onChange={(e) => setEditing({ ...editing, billing_cycle: e.target.value })} className={input}>
              {data.billing_cycles.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-400 space-y-1">Installments
            <input value={editing.installments} onChange={(e) => setEditing({ ...editing, installments: e.target.value })} type="number" className={input} />
          </label>
          <div className="sm:col-span-3 flex gap-2">
            <button onClick={save} disabled={busy} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm text-white disabled:opacity-50">Save plan</button>
            <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg bg-slate-800 text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {data.plans.map((p) => (
          <div key={p.code} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">{p.name}</div>
                <div className="text-[11px] text-slate-500">{p.code} · tier {p.tier}</div>
              </div>
              <span className="text-xs text-slate-400">{p.schools} school(s)</span>
            </div>
            <div className="text-sm space-y-0.5 text-slate-300">
              {data.limit_keys.map((k) => (
                <div key={k} className="flex justify-between"><span className="capitalize text-slate-500">{k.replace("_", " ")}</span><span>{p.limits?.[k] ?? "∞"}</span></div>
              ))}
            </div>
            <div className="text-xs text-slate-400">{p.currency} {p.price} / {p.billing_cycle} · setup {p.installation_fee}</div>
            <div className="flex gap-3 pt-1">
              {can("plans.edit") && <button onClick={() => setEditing({ ...p, limits: { ...EMPTY.limits, ...p.limits } })} className="text-xs text-indigo-300 hover:underline">Edit</button>}
              {can("plans.delete") && <button onClick={() => remove(p.code)} className="text-xs text-rose-300 hover:underline">Delete</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
