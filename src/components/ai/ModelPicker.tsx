import { useState } from "react";
import { BrainCircuit, Check, ChevronDown, Cpu, Lock, Settings2, Sparkles } from "lucide-react";
import { cn } from "../../utils/cn";
import { settings } from "../../lib/store";
import type { Connection } from "../../lib/ai";
import { Popover } from "./primitives";

const FUTURE = [
  { id: "reasoning", name: "CodeQuest Reasoning", desc: "Deep, multi-step analysis", icon: BrainCircuit },
  { id: "coding", name: "CodeQuest Coding", desc: "Optimised for implementation", icon: Cpu },
  { id: "custom", name: "Custom Model", desc: "Bring your own endpoint", icon: Settings2 },
];

export function ModelPicker({
  conn,
  connected,
  onOpenPreferences,
  compact,
}: {
  conn: Connection;
  connected: boolean;
  onOpenPreferences: () => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const s = settings.use();
  const models = conn.status === "ok" ? conn.models : [];
  const currentModel = models.find((m) => m.id === s.model && m.available);
  const label = currentModel?.name ?? "CodeQuest Auto";

  const choose = (id: string) => {
    settings.set((p) => ({ ...p, model: id }));
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        id="cr-model-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`AI model: ${label}`}
        className="ring-focus flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface/60 pl-1.5 pr-2 text-left transition-colors hover:border-strong hover:bg-surface-2"
      >
        <span className="cr-gradient-brand flex size-5 flex-none items-center justify-center rounded-[5px] text-white">
          <Sparkles className="size-3" />
        </span>
        {!compact && (
          <span className="hidden max-w-[118px] truncate text-[11.5px] font-medium text-primary sm:inline">{label}</span>
        )}
        <span
          className={cn(
            "flex-none rounded-[3px] border px-1 py-px text-[8.5px] font-semibold uppercase tracking-[0.08em]",
            connected
              ? "border-[#34d399]/30 bg-[#34d399]/10 text-[#6ee7b7]"
              : "border-border bg-surface-2 text-muted"
          )}
        >
          {connected ? "Live" : "Demo"}
        </span>
        <ChevronDown className="size-3 flex-none text-muted" />
      </button>

      <Popover
        open={open}
        onClose={() => setOpen(false)}
        align="right"
        className="w-[300px] p-1.5"
        labelledBy="cr-model-trigger"
      >
        <p className="px-2 pb-1.5 pt-1 text-[9.5px] font-semibold uppercase tracking-[0.13em] text-muted">
          Model
        </p>

        <button
          role="menuitemradio"
          aria-checked={!currentModel}
          onClick={() => choose("")}
          className={cn(
            "ring-focus flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-2",
            !currentModel && "bg-accent-soft"
          )}
        >
          <span className="cr-gradient-brand mt-0.5 flex size-6 flex-none items-center justify-center rounded-md text-white">
            <Sparkles className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-medium text-primary">CodeQuest Auto</span>
            <span className="block text-[10.5px] leading-4 text-muted">
              {connected ? "Routes to the best available model" : "Demo workspace — no model connected"}
            </span>
          </span>
          {!currentModel && <Check className="mt-1 size-3.5 flex-none text-accent" />}
        </button>

        {models.length > 0 && (
          <>
            <p className="px-2 pb-1 pt-2.5 text-[9.5px] font-semibold uppercase tracking-[0.13em] text-muted">
              Connected models
            </p>
            {models.map((m) => {
              const active = currentModel?.id === m.id;
              return (
                <button
                  key={m.id}
                  role="menuitemradio"
                  aria-checked={active}
                  disabled={!m.available}
                  onClick={() => choose(m.id)}
                  className={cn(
                    "ring-focus flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
                    m.available ? "hover:bg-surface-2" : "cursor-not-allowed opacity-45",
                    active && "bg-accent-soft"
                  )}
                >
                  <span className="mt-0.5 flex size-6 flex-none items-center justify-center rounded-md border border-border bg-surface-2 text-[#a78bfa]">
                    <Cpu className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[12.5px] font-medium text-primary">{m.name}</span>
                      {!m.available && (
                        <span className="flex-none rounded-[3px] border border-border px-1 text-[8.5px] uppercase text-muted">Unavailable</span>
                      )}
                    </span>
                    <span className="block truncate font-mono text-[9.5px] text-muted">{m.id}</span>
                    {m.capabilities.length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {m.capabilities.slice(0, 4).map((c) => (
                          <span key={c} className="rounded-[3px] border border-border bg-surface px-1 text-[8.5px] uppercase tracking-wide text-muted">{c}</span>
                        ))}
                      </span>
                    )}
                  </span>
                  {active && <Check className="mt-1 size-3.5 flex-none text-accent" />}
                </button>
              );
            })}
          </>
        )}

        <p className="px-2 pb-1 pt-2.5 text-[9.5px] font-semibold uppercase tracking-[0.13em] text-muted">
          Future models
        </p>
        {FUTURE.map((m) => (
          <div
            key={m.id}
            aria-disabled="true"
            title="Not connected to this workspace"
            className="flex cursor-not-allowed items-start gap-2.5 rounded-lg px-2 py-2 opacity-45"
          >
            <span className="mt-0.5 flex size-6 flex-none items-center justify-center rounded-md border border-border bg-surface-2 text-muted">
              <m.icon className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[12.5px] font-medium text-primary">{m.name}</span>
                <Lock className="size-2.5 flex-none text-muted" />
              </span>
              <span className="block text-[10.5px] leading-4 text-muted">
                {m.desc} · <span className="uppercase tracking-wide">Not connected</span>
              </span>
            </span>
          </div>
        ))}

        <div className="mt-1.5 border-t border-border/70 px-2 pb-1 pt-2">
          <div className="flex items-center gap-1.5 text-[10px] text-muted">
            <span className={cn("size-1.5 rounded-full", connected ? "bg-accent-2" : "bg-warn")} />
            {conn.status === "ok"
              ? `${conn.models.filter((m) => m.available).length} model${conn.models.filter((m) => m.available).length === 1 ? "" : "s"} available`
              : conn.status === "checking"
              ? "Checking connection…"
              : conn.status === "error"
              ? conn.error
              : "No backend configured"}
          </div>
          <button
            onClick={() => {
              setOpen(false);
              onOpenPreferences();
            }}
            className="ring-focus mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-border py-1.5 text-[11px] font-medium text-secondary transition-colors hover:border-strong hover:text-primary"
          >
            <Settings2 className="size-3" /> AI preferences
          </button>
        </div>
      </Popover>
    </div>
  );
}
