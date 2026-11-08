"use client";

/** /control/settings — platform-wide rules: maintenance mode and free-trial thresholds. */
import { useCallback, useEffect, useState } from "react";
import { useControlAccess } from "@/components/control/ControlAccess";
import { Loader2 } from "@/components/control/icons";

const MODE_HELP = {
  off: "Normal operation.",
  banner: "Show a notice to every school; access is unrestricted.",
  read_only: "Show a notice AND block school writes — reads still work. The Control Center is never blocked.",
};

export default function SettingsPage() {
  const { can } = useControlAccess();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch("/api/control-center/settings", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) { setError(j.error || "Failed to load"); return; }
      setData(j.settings);
      setForm({
        maintenance_mode: j.settings.maintenance.mode,
        maintenance_message: j.settings.maintenance.message,
        free_trial_days: j.settings.free_trial_days,
        free_trial_card_limit: j.settings.free_trial_card_limit ?? "",
        app_base_url: j.settings.app_base_url ?? "",
        school_password_policy: j.settings.school_password_policy,
      });
    } catch (loadError) {
      console.error("Control settings load failed", loadError);
      setError("Unable to load platform settings.");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = useCallback(async () => {
    setBusy(true); setError(null); setSaved(false);
    try {
      const r = await fetch("/api/control-center/settings", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          maintenance_mode: form.maintenance_mode,
          maintenance_message: form.maintenance_message,
          free_trial_days: form.free_trial_days,
          free_trial_card_limit: form.free_trial_card_limit === "" ? 0 : form.free_trial_card_limit,
          app_base_url: form.app_base_url,
          school_password_policy: {
            ...form.school_password_policy,
            minLength: Number(form.school_password_policy.minLength),
          },
        }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j.error || "Failed to save"); return; }
      setData(j.settings);
      setForm((current) => ({ ...current, app_base_url: j.settings.app_base_url }));
      setSaved(true);
    } catch (saveError) {
      console.error("Control settings save failed", saveError);
      setError("Unable to save platform settings.");
    } finally { setBusy(false); }
  }, [form]);

  const input = "px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-indigo-500 w-full";

  if (!data || !form) return <div className="flex items-center gap-2 text-slate-400"><Loader2 className="w-5 h-5 animate-spin text-indigo-400" /> Loading…</div>;

  const editable = can("settings.edit");

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold">Platform Settings</h1>
        <p className="text-sm text-slate-400">Rules that apply to every school. Changing these needs no deployment.</p>
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}
      {saved && <p className="text-sm text-emerald-400">Settings saved.</p>}

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
        <h2 className="font-semibold">Public website URL for QR codes</h2>
        <p className="text-xs text-slate-500">
          This is the Sirius website hostname encoded in newly generated student QR codes. It is not a TiDB or API path. Use the public domain only; existing printed cards keep their original URL.
        </p>
        <label className="text-xs text-slate-400 space-y-1 block">
          Public website hostname
          <input
            value={form.app_base_url}
            disabled={!editable}
            onChange={(e) => setForm({ ...form, app_base_url: e.target.value })}
            className={input}
            placeholder="sirius-psi-three.vercel.app"
            autoComplete="url"
            maxLength={255}
          />
        </label>
        <p className="text-xs text-slate-500">
          {data.app_base_url_source === "control_panel"
            ? "Managed here in Control Center."
            : data.app_base_url_source === "environment"
              ? "Currently using the deployment environment value. Saving here overrides it."
              : "Not configured. Set this before generating QR cards."}
          {" "}HTTPS is required in production. Leave blank to use the deployment environment value, if one is set.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
        <h2 className="font-semibold">Maintenance mode</h2>
        <div className="grid sm:grid-cols-3 gap-2">
          {data.maintenance_modes.map((m) => (
            <button
              key={m} type="button" disabled={!editable}
              onClick={() => setForm({ ...form, maintenance_mode: m })}
              className={`px-3 py-2 rounded-lg text-sm border text-left ${
                form.maintenance_mode === m ? "border-indigo-500 bg-indigo-500/15 text-indigo-200" : "border-slate-700 bg-slate-900 text-slate-300"
              } disabled:opacity-60`}
            >
              <div className="capitalize font-medium">{m.replace("_", " ")}</div>
              <div className="text-[11px] text-slate-500">{MODE_HELP[m]}</div>
            </button>
          ))}
        </div>
        <label className="text-xs text-slate-400 space-y-1 block">
          Notice shown to schools
          <input value={form.maintenance_message} disabled={!editable} onChange={(e) => setForm({ ...form, maintenance_message: e.target.value })} className={input} placeholder="Sirius is undergoing scheduled maintenance…" />
        </label>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
        <h2 className="font-semibold">Free trial</h2>
        <p className="text-xs text-slate-500">A school without a paid plan may generate this many cards before it must subscribe.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-xs text-slate-400 space-y-1">Trial length (days)
            <input value={form.free_trial_days} disabled={!editable} onChange={(e) => setForm({ ...form, free_trial_days: e.target.value })} type="number" min="0" className={input} />
          </label>
          <label className="text-xs text-slate-400 space-y-1">Free-trial card limit (blank = unlimited)
            <input value={form.free_trial_card_limit} disabled={!editable} onChange={(e) => setForm({ ...form, free_trial_card_limit: e.target.value })} type="number" min="0" className={input} />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
        <h2 className="font-semibold">School account password policy</h2>
        <p className="text-xs text-slate-500">Applies to school sign-up, new school users, administrator resets, and self-service resets. Existing passwords remain valid until changed. Control Center operator passwords use a separate policy.</p>
        <label className="text-xs text-slate-400 space-y-1 block max-w-xs">
          Minimum length
          <input
            value={form.school_password_policy.minLength}
            disabled={!editable}
            onChange={(e) => setForm({
              ...form,
              school_password_policy: { ...form.school_password_policy, minLength: e.target.value },
            })}
            type="number"
            min="6"
            max="72"
            className={input}
          />
        </label>
        <div className="grid sm:grid-cols-2 gap-2">
          {[
            ["requireUppercase", "Require an uppercase letter"],
            ["requireLowercase", "Require a lowercase letter"],
            ["requireNumber", "Require a number"],
            ["requireSymbol", "Require a symbol"],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={form.school_password_policy[key]}
                disabled={!editable}
                onChange={(e) => setForm({
                  ...form,
                  school_password_policy: { ...form.school_password_policy, [key]: e.target.checked },
                })}
              />
              {label}
            </label>
          ))}
        </div>
        <p className="text-xs text-slate-500">The current default is six characters with no extra character-type requirements.</p>
      </section>

      {editable && (
        <button onClick={save} disabled={busy} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm text-white disabled:opacity-50">
          {busy ? "Saving…" : "Save settings"}
        </button>
      )}
      {!editable && <p className="text-xs text-slate-500">You have read-only access to platform settings.</p>}
    </div>
  );
}
