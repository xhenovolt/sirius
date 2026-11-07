"use client";

/** /control/audit — every operator action: who/what/when/where. Paginated + searchable. */
import { useEffect, useState } from "react";
import { Loader2, Search, ChevronLeft, ChevronRight } from "@/components/control/icons";

const fetcher = (u) => fetch(u, { cache: "no-store" }).then((r) => r.json());

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  // Debounce the search box → one query when typing pauses; reset to page 1.
  useEffect(() => {
    const t = setTimeout(() => { setQ(input.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [input]);

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams({ page: String(page), limit: "50" });
    if (q) params.set("q", q);
    setError(null);
    fetcher(`/api/control-center/audit?${params}`)
      .then((j) => { if (alive) setData(j); })
      .catch(() => { if (alive) setError("Failed to load the audit log."); });
    return () => { alive = false; };
  }, [q, page]);

  const rows = data?.rows || [];
  const pg = data?.pagination || { page: 1, total: 0, totalPages: 1, limit: 50 };
  const from = pg.total === 0 ? 0 : (pg.page - 1) * pg.limit + 1;
  const to = Math.min(pg.page * pg.limit, pg.total);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Audit Log</h1>
          <p className="text-sm text-slate-400">Who did what in the Control Center.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={input} onChange={(e) => setInput(e.target.value)}
              placeholder="Search action, resource, operator, IP…"
              className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 w-full outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <p className="text-sm text-slate-400 whitespace-nowrap">
            {pg.total === 0 ? "No entries" : `${from.toLocaleString()}–${to.toLocaleString()} of ${Number(pg.total).toLocaleString()}`}
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      {/* Cards on phone, table from md up — six dense columns don't fit a phone width. */}
      <div className="md:hidden space-y-2">
        {!data && <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-center"><Loader2 className="w-5 h-5 animate-spin text-indigo-400 inline" /></div>}
        {data && !rows.length && <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-center text-slate-500 text-sm">No matching audit entries.</div>}
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border border-slate-800 bg-slate-900 p-3 space-y-1 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-indigo-300 font-mono">{r.action}</span>
              <span className="text-slate-500 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</span>
            </div>
            <div className="text-slate-300">{r.user_name || "—"}{r.ip ? <span className="text-slate-600 font-mono"> · {r.ip}</span> : null}</div>
            {r.resource && <div className="text-slate-400 font-mono break-all">{r.resource}</div>}
            {r.metadata && <div className="text-slate-500 break-words">{r.metadata}</div>}
          </div>
        ))}
      </div>

      <div className="hidden md:block bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-slate-500 border-b border-slate-800">
            <tr>
              <th className="px-3 py-2 text-left">When</th><th className="px-3 py-2 text-left">Who</th>
              <th className="px-3 py-2 text-left">Action</th><th className="px-3 py-2 text-left">Resource</th>
              <th className="px-3 py-2 text-left">Detail</th><th className="px-3 py-2 text-left">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {!data && <tr><td colSpan={6} className="px-3 py-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-indigo-400 inline" /></td></tr>}
            {data && !rows.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">No matching audit entries.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-3 py-2 text-slate-300">{r.user_name || "—"}</td>
                <td className="px-3 py-2 text-indigo-300 font-mono">{r.action}</td>
                <td className="px-3 py-2 text-slate-400 font-mono">{r.resource || ""}</td>
                <td className="px-3 py-2 text-slate-500 max-w-[240px] truncate">{r.metadata || ""}</td>
                <td className="px-3 py-2 text-slate-600 font-mono">{r.ip || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button disabled={pg.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-700">
          <ChevronLeft className="w-3.5 h-3.5" /> Prev
        </button>
        <span className="text-xs text-slate-500">Page {pg.page} of {pg.totalPages}</span>
        <button disabled={pg.page >= pg.totalPages} onClick={() => setPage((p) => p + 1)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-700">
          Next <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
