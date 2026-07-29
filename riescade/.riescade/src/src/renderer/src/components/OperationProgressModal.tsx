import React from "react";
import { CheckCircle2, Loader2, Minimize2, RefreshCw, XCircle } from "lucide-react";

type Metric = { value: React.ReactNode; label: string; icon: React.ReactNode };

export interface OperationProgressModalProps {
  mode: "single" | "batch";
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  source?: string;
  currentItem?: string;
  status?: string;
  percent: number;
  completed: number;
  failed: number;
  total: number;
  metrics?: Metric[];
  cancelling?: boolean;
  onClose?: () => void;
  onMinimize?: () => void;
}

export function OperationProgressModal({
  mode,
  icon,
  title,
  subtitle,
  source,
  currentItem,
  status,
  percent,
  completed,
  failed,
  total,
  metrics,
  cancelling,
  onClose,
  onMinimize
}: OperationProgressModalProps) {
  const safePercent = Math.min(100, Math.max(0, Math.round(percent || 0)));
  const remaining = Math.max(0, total - completed - failed);
  const items = metrics || [
    { value: completed, label: "Sucessos", icon: <CheckCircle2 className="text-emerald-400" /> },
    { value: failed, label: "Falhas", icon: <XCircle className="text-rose-400" /> },
    ...(mode === "batch"
      ? [{ value: remaining, label: "Restantes", icon: <RefreshCw className="text-white/45" /> }]
      : [])
  ];

  return (
    <div className={`w-[min(1010px,calc(100vw-32px))] select-none rounded-[18px] border border-white/10 bg-[#0d0e13]/98 text-white shadow-[0_24px_90px_rgba(0,0,0,.72)] ${mode === "single" ? "p-7" : "p-5"}`}>
      <div className={`flex ${mode === "single" ? "items-start gap-7" : "items-start gap-5"}`}>
        <div className={`flex shrink-0 items-center justify-center rounded-[14px] border border-white/10 bg-black/20 text-accent shadow-inner drop-shadow-[0_0_12px_var(--accent-color)] [&>svg]:h-[68%] [&>svg]:w-[68%] ${mode === "single" ? "h-[102px] w-[100px]" : "h-[90px] w-[98px]"}`}>
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <h3 className="truncate text-[25px] font-extrabold leading-tight tracking-tight">{title}</h3>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent shadow-[0_0_10px_var(--accent-color)]" />
              </div>

              {mode === "single" ? (
                <>
                  <p className="mt-2 truncate text-[17px] font-semibold text-white/45">{subtitle}</p>
                  <p className="mt-1 truncate text-[24px] font-bold leading-tight" title={currentItem}>{currentItem}</p>
                </>
              ) : (
                source && <p className="mt-2 truncate text-[13px] font-bold uppercase tracking-[0.08em] text-white/40">{source}</p>
              )}
            </div>

            {onMinimize && (
              <button type="button" onClick={onMinimize} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] text-white/55 transition hover:bg-white/10 hover:text-white cursor-pointer" title="Minimizar">
                <Minimize2 className="h-5 w-5" />
              </button>
            )}
          </div>

          {mode === "single" ? (
            <>
              <div className="mt-4 flex items-center gap-5">
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                  <div className="h-full rounded-full bg-accent shadow-[0_0_14px_var(--accent-color)] transition-[width] duration-300" style={{ width: `${safePercent}%` }} />
                </div>
                <span className="w-14 shrink-0 text-right text-[25px] font-bold text-accent">{safePercent}%</span>
              </div>
              <div className="mt-4 flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-accent text-accent">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[17px] font-semibold">{status || "Buscando metadados..."}</p>
                  {source && <p className="mt-0.5 truncate text-[11px] font-bold uppercase tracking-wide text-white/35">{source}</p>}
                </div>
              </div>
            </>
          ) : (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.025] px-5 py-4">
              <div className="flex items-end justify-between gap-6">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-white/40">Progresso geral</p>
                  <p className="mt-1 text-[19px] font-bold"><span className="text-emerald-400">{completed}</span> <span className="text-white/45">/</span> {total} jogos</p>
                </div>
                <div className="min-w-0 text-right">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-white/40">Atualmente</p>
                  <p className="mt-1 truncate text-[16px] font-semibold" title={currentItem}>{currentItem}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-4">
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                  <div className="h-full rounded-full bg-accent shadow-[0_0_14px_var(--accent-color)] transition-[width] duration-300" style={{ width: `${safePercent}%` }} />
                </div>
                <span className="w-12 shrink-0 text-right text-[19px] font-bold text-accent">{safePercent}%</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={`${mode === "single" ? "mt-5 border-t border-white/10 pt-4" : "mt-2 pl-[118px]"} grid items-stretch gap-3 ${mode === "batch" ? "grid-cols-[repeat(3,minmax(0,1fr))_1.4fr]" : "grid-cols-[repeat(2,minmax(0,1fr))_1.4fr]"}`}>
        {items.map((metric) => (
          <div key={metric.label} className={`flex min-w-0 items-center gap-4 rounded-xl border px-5 py-3 ${metric.label === "Sucessos" ? "border-emerald-500/20 bg-emerald-500/[0.07]" : metric.label === "Falhas" ? "border-rose-500/20 bg-rose-500/[0.07]" : "border-white/10 bg-white/[0.035]"}`}>
            <span className="shrink-0 [&>svg]:h-8 [&>svg]:w-8">{metric.icon}</span>
            <div className="min-w-0">
              <p className={`truncate text-[11px] font-bold uppercase tracking-wide ${metric.label === "Sucessos" ? "text-emerald-400" : metric.label === "Falhas" ? "text-rose-400" : "text-white/45"}`}>{metric.label}</p>
              <p className={`mt-0.5 text-[20px] font-semibold leading-none ${metric.label === "Sucessos" ? "text-emerald-400" : metric.label === "Falhas" ? "text-rose-400" : "text-white/55"}`}>{metric.value}</p>
            </div>
          </div>
        ))}
        <button type="button" disabled={cancelling} onClick={onClose} className="flex min-h-[58px] items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] px-5 text-[15px] font-semibold text-white/55 transition hover:border-rose-500/20 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-40 cursor-pointer">
          {cancelling ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Cancelando...</> : "Cancelar Operação"}
        </button>
      </div>
    </div>
  );
}
