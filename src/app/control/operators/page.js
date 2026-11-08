"use client";

/** /control/operators — Control Center users and exactly what each may do. */
import { useCallback, useEffect, useState } from "react";
import { useControlAccess } from "@/components/control/ControlAccess";
import { Loader2, ShieldOff } from "@/components/control/icons";
import { confirmDialog } from "@/lib/sweetAlert";

const ROLES = ["XHENVOLT_SUPER_ADMIN", "XHENVOLT_OPERATOR", "XHENVOLT_VIEWER"];

const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const BLANK = {
  id: null, name: "", email: "", password: "", role: "XHENVOLT_OPERATOR", status: "active",
  permissions: [], school_scope: null, scope_all: true, access_expires_at: "", notes: "", revoke_sessions: false,
};

export default function OperatorsPage() {
  const { can } = useControlAccess();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    const r = await fetch("/api/control-center/users", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) { setError(j.error || "Failed to load"); return; }
    setData(j);
  }, []);
  useEffect(() => { load(); }, [load]);

  const startEdit = useCallback((row) => {
    setEditing({
      id: row.id, name: row.name, email: row.email, password: "", role: row.role, status: row.status,
      permissions: row.permissions ?? row.effective_permissions ?? [],
      school_scope: row.school_scope, scope_all: !row.school_scope,
      access_expires_at: toLocalInput(row.access_expires_at), notes: row.notes ?? "", revoke_sessions: false,
    });
  }, []);

  const save = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const base = {
        name: editing.name, role: editing.role, status: editing.status,
        permissions: editing.role === "XHENVOLT_SUPER_ADMIN" ? undefined : editing.permissions,
        school_scope: editing.scope_all ? null : (editing.school_scope ?? []),
        access_expires_at: editing.access_expires_at ? new Date(editing.access_expires_at).toISOString() : null,
        notes: editing.notes, revoke_sessions: editing.revoke_sessions || undefined,
      };
      let r;
      if (editing.id) {
        const body = { ...base, id: editing.id };
        if (editing.password) body.password = editing.password;
        r = await fetch("/api/control-center/users", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      } else {
        r = await fetch("/api/control-center/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...base, email: editing.email, password: editing.password }) });
      }
      const j = await r.json();
      if (!r.ok) { setError(j.error || "Failed to save"); return; }
      setEditing(null);
      await load();
    } finally { setBusy(false); }
  }, [editing, load]);

  const remove = useCallback(async (row) => {
    if (!(await confirmDialog(`Remove ${row.name} (${row.email})? Their sessions end immediately.`, {
      title: "Remove Control Center user?",
      confirmText: "Remove user",
      danger: true,
    }))) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/control-center/users?id=${row.id}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) { setError(j.error || "Failed"); return; }
      await load();
    } finally { setBusy(false); }
  }, [load]);

  const togglePermission = (p) => {
    setEditing((e) => {
      const set = new Set(e.permissions);
      set.has(p) ? set.delete(p) : set.add(p);
      return { ...e, permissions: [...set] };
    });
  };
  const applyPreset = (preset) => setEditing((e) => ({ ...e, permissions: [...preset.permissions] }));

  const input = "px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-indigo-500 w-full";

  if (!data) return <div className="flex items-center gap-2 text-slate-400"><Loader2 className="w-5 h-5 animate-spin text-indigo-400" /> Loading…</div>;
  const { catalog, me } = data;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Operators</h1>
          <p className="text-sm text-slate-400">Who can sign in to the Control Center, and what each of them may do.</p>
        </div>
        {me.can.create && (
          <button onClick={() => setEditing({ ...BLANK, permissions: [...catalog.presets.operator.permissions] })}
            className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm text-white">Add operator</button>
        )}
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      {editing && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-xs text-slate-400 space-y-1">Name
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={input} />
            </label>
            <label className="text-xs text-slate-400 space-y-1">Email
              <input value={editing.email} disabled={!!editing.id} onChange={(e) => setEditing({ ...editing, email: e.target.value })} type="email" className={`${input} disabled:opacity-60`} />
            </label>
            <label className="text-xs text-slate-400 space-y-1">{editing.id ? "Reset password (leave blank to keep)" : "Password (min 10)"}
              <input value={editing.password} onChange={(e) => setEditing({ ...editing, password: e.target.value })} type="password" className={input} />
            </label>
            <label className="text-xs text-slate-400 space-y-1">Role
              <select value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })} className={input}>
                {ROLES.map((r) => <option key={r} value={r}>{r.replace("XHENVOLT_", "").toLowerCase()}</option>)}
              </select>
            </label>
            {editing.id && (
              <label className="text-xs text-slate-400 space-y-1">Status
                <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })} className={input}>
                  <option value="active">active</option>
                  <option value="suspended">suspended</option>
                </select>
              </label>
            )}
            <label className="text-xs text-slate-400 space-y-1">Access expires (blank = never)
              <input value={editing.access_expires_at} onChange={(e) => setEditing({ ...editing, access_expires_at: e.target.value })} type="datetime-local" className={input} />
            </label>
          </div>

          <label className="text-xs text-slate-400 space-y-1 block">Notes
            <input value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} className={input} placeholder="e.g. Finance contractor, ends Q3" />
          </label>

          {/* School scope */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input id="scope_all" type="checkbox" checked={editing.scope_all} onChange={(e) => setEditing({ ...editing, scope_all: e.target.checked })} />
              <label htmlFor="scope_all" className="text-sm">All schools</label>
            </div>
            {!editing.scope_all && (
              <div className="flex flex-wrap gap-2 pl-1">
                {data.schools.map((s) => {
                  const on = (editing.school_scope ?? []).includes(s.school_id);
                  return (
                    <button key={s.school_id} type="button"
                      onClick={() => setEditing((e) => {
                        const set = new Set(e.school_scope ?? []);
                        on ? set.delete(s.school_id) : set.add(s.school_id);
                        return { ...e, school_scope: [...set] };
                      })}
                      className={`px-2.5 py-1 rounded-lg text-xs border ${on ? "border-indigo-500 bg-indigo-500/15 text-indigo-200" : "border-slate-700 text-slate-300"}`}>
                      {s.school_name}
                    </button>
                  );
                })}
                {!data.schools.length && <span className="text-xs text-slate-500">No schools yet.</span>}
              </div>
            )}
            {!editing.scope_all && <p className="text-[11px] text-slate-500">A school-scoped operator stays out of platform-wide areas (dashboard, plans, operators, audit, settings).</p>}
          </div>

          {/* Permissions */}
          {editing.role !== "XHENVOLT_SUPER_ADMIN" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-sm font-medium">Permissions</span>
                <div className="flex gap-2">
                  {Object.entries(catalog.presets).map(([key, p]) => (
                    <button key={key} type="button" onClick={() => applyPreset(p)} title={p.description}
                      className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px]">{p.label}</button>
                  ))}
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {catalog.areas.map((area) => (
                  <div key={area.key} className="rounded-xl border border-slate-800 p-3 space-y-1.5">
                    <div className="text-xs font-semibold text-slate-300">{area.label}
                      {catalog.platformWideAreas.includes(area.key) && editing.scope_all === false && (
                        <span className="ml-1 text-[10px] text-amber-400">platform-wide</span>
                      )}
                    </div>
                    {Object.entries(area.actions).map(([act, desc]) => {
                      const p = `${area.key}.${act}`;
                      if (catalog.superAdminOnly.includes(p)) return null;
                      return (
                        <label key={p} className="flex items-start gap-2 text-[12px] text-slate-400">
                          <input type="checkbox" className="mt-0.5" checked={editing.permissions.includes(p)} onChange={() => togglePermission(p)} />
                          <span><span className="text-slate-300">{act}</span> — {desc}</span>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-amber-300 flex items-center gap-1.5"><ShieldOff className="w-4 h-4" /> A super admin holds every permission, always.</p>
          )}

          {editing.id && (
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input type="checkbox" checked={editing.revoke_sessions} onChange={(e) => setEditing({ ...editing, revoke_sessions: e.target.checked })} />
              Also end this operator's active sessions now
            </label>
          )}

          <div className="flex gap-2">
            <button onClick={save} disabled={busy} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm text-white disabled:opacity-50">
              {busy ? "Saving…" : editing.id ? "Save operator" : "Create operator"}
            </button>
            <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg bg-slate-800 text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/70 text-slate-400">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Operator</th>
              <th className="text-left px-3 py-2 font-medium">Role</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-left px-3 py-2 font-medium">Scope</th>
              <th className="text-left px-3 py-2 font-medium">Permissions</th>
              <th className="text-left px-3 py-2 font-medium">Last activity</th>
              <th className="text-right px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-800/70">
                <td className="px-3 py-2">
                  <div className="font-medium">{row.name} {row.id === me.id && <span className="text-[10px] text-indigo-300">(you)</span>}</div>
                  <div className="text-[11px] text-slate-500">{row.email}</div>
                </td>
                <td className="px-3 py-2 text-slate-300 text-xs">{row.role.replace("XHENVOLT_", "").toLowerCase()}</td>
                <td className="px-3 py-2">
                  <span className={`text-[11px] px-2 py-0.5 rounded capitalize ${row.status === "active" ? "text-emerald-300 bg-emerald-500/10" : "text-rose-300 bg-rose-500/10"}`}>{row.status}</span>
                  {row.expired && <span className="ml-1 text-[11px] text-amber-300">expired</span>}
                </td>
                <td className="px-3 py-2 text-xs text-slate-400">{row.school_scope ? `${row.school_scope.length} school(s)` : "All schools"}</td>
                <td className="px-3 py-2 text-xs text-slate-400">
                  {row.role === "XHENVOLT_SUPER_ADMIN" ? "all" : `${row.effective_permissions?.length ?? 0}`}
                  {row.active_sessions > 0 && <span className="ml-1 text-[11px] text-sky-300">· {row.active_sessions} session(s)</span>}
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">{row.last_activity ? new Date(row.last_activity).toLocaleString() : "never"}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {me.can.edit && <button onClick={() => startEdit(row)} className="text-xs text-indigo-300 hover:underline mr-3">Edit</button>}
                  {me.can.delete && row.id !== me.id && <button onClick={() => remove(row)} className="text-xs text-rose-300 hover:underline">Remove</button>}
                </td>
              </tr>
            ))}
            {!data.rows.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">No operators yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
