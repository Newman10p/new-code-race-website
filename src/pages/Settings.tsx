import { useState } from "react";
import { Check, Loader2, Monitor, Moon, RefreshCw, Sun } from "lucide-react";
import { Badge, Button, Segmented } from "../components/ui";
import { ACCENTS } from "../hooks/useAppearance";
import type { Appearance } from "../hooks/useAppearance";
import { refreshConnection, useConnection } from "../hooks/useTutor";
import { apiUrl, currentPolicy } from "../lib/ai";
import { settings } from "../lib/store";
import { cn } from "../utils/cn";

export function Settings({ appearance: a }: { appearance: Appearance }) {
  const s = settings.use();
  const conn = useConnection();
  const [url, setUrl] = useState(s.apiUrl);
  const policy = currentPolicy();
  const effective = apiUrl();

  const saveUrl = () => {
    const v = url.trim();
    if (v && !/^https?:\/\//.test(v)) return;
    settings.set((p) => ({ ...p, apiUrl: v }));
    void refreshConnection();
  };

  return (
    <div className="mx-auto w-full max-w-[860px] px-5 pb-20 pt-9 md:px-8">
      <header className="animate-fade-up mb-7">
        <h1 className="font-display text-[38px] leading-[1.08] text-primary">Preferences</h1>
      </header>

      <div className="space-y-5">
        <Panel title="AI connection" desc="Lumen talks to a CodeQuest backend that holds provider keys server-side. No API key is ever entered or stored in the browser.">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveUrl()}
              placeholder={window.CODEQUEST?.apiUrl || import.meta.env.VITE_LUMEN_API_URL || "https://codequest.example/api/tutor"}
              aria-label="Backend URL"
              className="h-9 min-w-[260px] flex-1 rounded-md border border-strong bg-surface px-3 font-mono text-[12.5px] text-primary outline-none focus:border-accent"
            />
            <Button onClick={saveUrl} disabled={url.trim() === s.apiUrl || (!!url.trim() && !/^https?:\/\//.test(url.trim()))}>Save</Button>
            <Button variant="ghost" onClick={() => refreshConnection()}><RefreshCw className={cn("size-3.5", conn.status === "checking" && "spin")} />Test</Button>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[12.5px]">
            {conn.status === "checking" && <><Loader2 className="size-3.5 spin text-muted" /><span className="text-secondary">Checking…</span></>}
            {conn.status === "ok" && <><span className="size-2 rounded-full bg-accent-2" /><span className="text-primary">Connected</span><span className="font-mono text-[11.5px] text-muted">{effective}</span></>}
            {conn.status === "not_configured" && <><span className="size-2 rounded-full bg-warn" /><span className="text-secondary">Not configured — conversations won't receive responses.</span></>}
            {conn.status === "error" && <><span className="size-2 rounded-full bg-danger" /><span className="text-secondary">{conn.error}</span></>}
          </div>
          {conn.status === "ok" && (
            <div className="mt-4 overflow-hidden rounded-lg border border-border">
              {conn.models.length === 0 && <p className="px-3 py-3 text-[12.5px] text-muted">The backend reports no models.</p>}
              {conn.models.map((m, i) => (
                <label key={m.id} className={cn("flex cursor-pointer items-center gap-3 px-3 py-2.5", i && "border-t border-border", !m.available && "cursor-not-allowed opacity-55")}>
                  <input type="radio" name="model" disabled={!m.available} checked={s.model === m.id} onChange={() => settings.set((p) => ({ ...p, model: m.id }))} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-primary">{m.name} <span className="font-mono text-[11px] font-normal text-muted">{m.id}</span></span>
                    {m.limits && <span className="block text-[11.5px] text-muted">{m.limits}</span>}
                  </span>
                  <span className="flex flex-wrap justify-end gap-1">
                    {m.capabilities.map((c) => <Badge key={c}>{c}</Badge>)}
                    {!m.available && <Badge tone="warn">unavailable</Badge>}
                  </span>
                </label>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11.5px] text-muted">Protocol: <span className="font-mono">GET /models</span> and streaming <span className="font-mono">POST /chat</span> — see docs/BACKEND.md.</p>
        </Panel>

        <Panel title="Appearance">
          <Row label="Theme">
            <div className="grid grid-cols-3 gap-2">
              {([["dark", "Dark", Moon], ["light", "Light", Sun], ["system", "System", Monitor]] as const).map(([v, l, I]) => (
                <button key={v} onClick={() => a.set("mode", v)} className={cn("flex items-center gap-2 rounded-md border px-3 py-2 text-[12.5px] font-medium", a.mode === v ? "border-accent bg-accent-soft text-primary" : "border-border text-secondary hover:border-strong")}>
                  <I className="size-3.5" />{l}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Accent">
            <div className="flex flex-wrap gap-1.5">
              {ACCENTS.map((c) => (
                <button key={c.id} onClick={() => a.set("accent", c.id)} title={c.label} aria-label={c.label} className={cn("flex size-8 items-center justify-center rounded-md border", a.accent === c.id ? "border-accent" : "border-border hover:border-strong")}>
                  <span className="flex size-4 items-center justify-center rounded-full" style={{ background: a.isLight ? c.light : c.dark }}>{a.accent === c.id && <Check className="size-2.5 text-white" strokeWidth={3} />}</span>
                </button>
              ))}
            </div>
          </Row>
          <Row label="Density"><Segmented value={a.density} onChange={(v) => a.set("density", v)} options={[{ value: "compact", label: "Compact" }, { value: "default", label: "Default" }, { value: "comfortable", label: "Comfortable" }]} /></Row>
          <Row label="Font size"><Segmented value={a.fontSize} onChange={(v) => a.set("fontSize", v)} options={[{ value: "sm", label: "Small" }, { value: "md", label: "Medium" }, { value: "lg", label: "Large" }]} /></Row>
          <Row label="Motion"><Segmented value={a.motion} onChange={(v) => a.set("motion", v)} options={[{ value: "full", label: "Full" }, { value: "reduced", label: "Reduced" }, { value: "none", label: "None" }]} /></Row>
        </Panel>

        <Panel title="Code execution" desc="Student code never runs on the application server.">
          <ul className="space-y-1.5 text-[12.5px] text-secondary">
            <li><strong className="font-medium text-primary">JavaScript / TypeScript</strong> — sandboxed iframe with no same-origin access, 5 s limit.</li>
            <li><strong className="font-medium text-primary">HTML / CSS</strong> — sandboxed live preview with console capture.</li>
            <li><strong className="font-medium text-primary">Python</strong> — Pyodide in an isolated Web Worker, 10 s limit (runtime downloads once, ~10 MB).</li>
          </ul>
        </Panel>

        <Panel title="Storage & policy">
          <p className="text-[12.5px] leading-5 text-secondary">
            Conversations, projects, notes and diagrams are saved in this browser{window.CODEQUEST?.student?.id ? ` for student ${window.CODEQUEST.student.id}` : ""}. Clearing site data removes them — export projects as ZIP to keep copies.
          </p>
          <p className="mt-2 text-[12.5px] text-secondary">
            Current AI-assistance policy: <Badge tone={policy.policy === "open" ? "mint" : policy.policy === "prohibited" ? "danger" : "warn"}>{policy.policy.replace("_", " ")}</Badge>
          </p>
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="animate-fade-up rounded-xl border border-border bg-surface p-5">
      <h2 className="text-[14px] font-semibold text-primary">{title}</h2>
      {desc && <p className="mt-0.5 text-[12.5px] leading-5 text-muted">{desc}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 first:pt-0 last:border-0 last:pb-0">
      <span className="text-[13px] text-primary">{label}</span>
      {children}
    </div>
  );
}
