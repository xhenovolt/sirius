"use client";

/** /control/dashboard — the platform at a glance. */
import { useEffect, useState } from "react";
import { Loader2, School, Users, CreditCard, ShieldCheck } from "@/components/control/icons";

function Tile({ label, value, sub, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-slate-500">{label}</span>
        {Icon && <Icon className="w-4 h-4 text-indigo-400" />}
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/control-center/overview", { cache: "no-store" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => { if (!ok) setError(j.error || "Failed to load"); else setData(j); })
      .catch(() => setError("Failed to load"));
  }, []);

  if (error) return <p className="text-sm text-rose-400">{error}</p>;
  if (!data) return <div className="flex items-center gap-2 text-slate-400"><Loader2 className="w-5 h-5 animate-spin text-indigo-400" /> Loading…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Dashboard</h1>
        <p className="text-sm text-slate-400">The platform at a glance.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile label="Schools" value={data.schools.total} sub={`${data.schools.active} active · ${data.schools.suspended} suspended`} icon={School} />
        <Tile label="Learners" value={data.learners} sub="active students" icon={Users} />
        <Tile label="Clearance cards" value={data.cards} sub="issued QR identities" icon={ShieldCheck} />
        <Tile label="Users" value={data.users} sub="active sign-ins" icon={CreditCard} />
      </div>

      {data.problems?.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-1">
          <div className="text-sm font-semibold text-amber-300">Needs attention</div>
          {data.problems.map((p, i) => <div key={i} className="text-xs text-amber-200/90">• {p.text}</div>)}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="text-sm font-semibold mb-3">Schools by plan</div>
          {data.plans?.length ? (
            <div className="space-y-1.5">
              {data.plans.map((p) => (
                <div key={p.code} className="flex items-center justify-between text-sm">
                  <span className="capitalize text-slate-300">{p.code}</span>
                  <span className="text-slate-400">{p.schools}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-slate-500">No school is on a plan yet.</p>}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="text-sm font-semibold mb-3">On free trial (no plan)</div>
          {data.no_plan_schools?.length ? (
            <div className="space-y-1.5">
              {data.no_plan_schools.map((s) => (
                <div key={s.school_id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-300 truncate">{s.school_name}</span>
                  <span className="text-xs text-slate-500">{s.school_id}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-slate-500">Every school has a plan.</p>}
        </div>
      </div>
    </div>
  );
}
