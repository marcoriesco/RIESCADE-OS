import React from "react";
import { CheckCircle2, Loader2, Maximize2, Minimize2, RefreshCw, X, XCircle } from "lucide-react";
import { OperationProgressModal } from "./OperationProgressModal";

export interface OperationProgressCardProps {
  mode?: "single" | "batch";
  presentation?: "notification" | "modal";
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  source?: string;
  currentItem?: string;
  status?: string;
  percent: number;
  completed?: number;
  failed?: number;
  total?: number;
  details?: React.ReactNode;
  actions?: React.ReactNode;
  metrics?: Array<{
    value: React.ReactNode;
    label: string;
    icon: React.ReactNode;
  }>;
  cancelling?: boolean;
  onClose?: () => void;
  onPresentationChange?: () => void;
}

export function OperationProgressCard({
  mode = "single",
  presentation = "notification",
  icon,
  title,
  subtitle,
  source,
  currentItem,
  status,
  percent,
  completed = 0,
  failed = 0,
  total = 0,
  details,
  actions,
  metrics,
  cancelling = false,
  onClose,
  onPresentationChange
}: OperationProgressCardProps) {
  const safePercent = Math.min(100, Math.max(0, Math.round(percent || 0)));
  const remaining = Math.max(0, total - completed - failed);
  const isModal = presentation === "modal";

  if (isModal) {
    return (
      <OperationProgressModal
        mode={mode}
        icon={icon}
        title={title}
        subtitle={subtitle}
        source={source}
        currentItem={currentItem}
        status={status}
        percent={safePercent}
        completed={completed}
        failed={failed}
        total={total}
        metrics={metrics}
        cancelling={cancelling}
        onClose={onClose}
        onMinimize={onPresentationChange}
      />
    );
  }


  return (
    <div className="glass-strong w-[min(390px,calc(100vw-24px))] select-none rounded-xl border border-white/10 p-4 text-white shadow-2xl">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center text-accent drop-shadow-[0_0_12px_var(--accent-color)] [&>svg]:h-full [&>svg]:w-full">
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-extrabold tracking-tight text-white">
                {title}
              </h3>
              {subtitle && (
                <p className="truncate text-xs font-semibold text-white/55">{subtitle}</p>
              )}
              {currentItem && (
                <p className="truncate text-xs text-white/55" title={currentItem}>
                  {mode === "batch" ? `Agora: ${currentItem}` : currentItem}
                </p>
              )}
            </div>

            {onPresentationChange && (
              <button
                type="button"
                onClick={onPresentationChange}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/45 transition hover:bg-white/10 hover:text-white cursor-pointer"
                title={isModal ? "Minimizar" : "Expandir"}
              >
                {isModal ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            )}

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                disabled={cancelling}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/45 transition hover:bg-white/10 hover:text-white disabled:opacity-40 cursor-pointer"
                title={cancelling ? "Cancelando..." : "Cancelar"}
              >
                {cancelling
                  ? <Loader2 className="h-5 w-5 animate-spin" />
                  : <X className="h-6 w-6" />}
              </button>
            )}
          </div>

          <div className="mt-3 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-accent shadow-[0_0_18px_var(--accent-color)] transition-[width] duration-300"
                style={{ width: `${safePercent}%` }}
              />
            </div>
            <span className="w-10 shrink-0 text-right text-sm font-bold text-white/90">
              {safePercent}%
            </span>
          </div>

          {status && (
            <div className="mt-2 flex items-center gap-2 text-xs text-white/55">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent" />
              <span className="truncate">{status}</span>
            </div>
          )}

          {mode === "batch" && (
            <div className="mt-3 grid grid-cols-3 divide-x divide-white/10">
              {(metrics || [
                {
                  value: completed,
                  label: "concluídos",
                  icon: <CheckCircle2 className="h-7 w-7 shrink-0 text-emerald-400" />
                },
                {
                  value: failed,
                  label: "falhas",
                  icon: <XCircle className="h-7 w-7 shrink-0 text-rose-400" />
                },
                {
                  value: remaining,
                  label: "restantes",
                  icon: <RefreshCw className="h-7 w-7 shrink-0 text-white/45" />
                }
              ]).map((metric, index) => (
                <div
                  key={metric.label}
                  className={`flex items-center gap-1.5 ${index === 0 ? "pr-2" : index === 1 ? "px-2" : "pl-2"}`}
                >
                  <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">{metric.icon}</span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold leading-none">{metric.value}</p>
                    <p className="mt-1 truncate text-[9px] text-white/45">{metric.label}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {details && <div className="mt-4 text-xs text-white/50">{details}</div>}
          {actions && <div className="mt-4 flex items-center justify-end gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
