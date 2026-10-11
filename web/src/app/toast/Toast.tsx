// The toast region: always mounted, role="status" with aria-live="polite", so every step change,
// confirmation and failure is announced. Sits at the top of the viewport, clear of the pending
// transaction notice and the sticky submit buttons at the bottom. No slide-in: toasts appear in
// place, and the step spinner holds still when the reader prefers reduced motion.
import { useEffect, type ReactNode } from "react";
import { useAppConfig } from "../configContext";
import { truncateMiddle } from "../../pool/format";
import type { Copy } from "../../translations";
import { explorerTxUrl } from "../../tx/explorer";
import { ToastContext, useToastState, type Toast, type ToastStep } from "./useToast";

const TONE: Record<Toast["tone"], string> = {
  info: "border-teal-700/40 bg-white",
  success: "border-green-700/40 bg-white",
  error: "border-chili-700/40 bg-chili-50",
};

function StepIcon({ status }: { status: ToastStep["status"] }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true, focusable: false } as const;
  if (status === "active") {
    return (
      <svg {...common} className="shrink-0 text-teal-700 motion-safe:animate-spin">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (status === "done") {
    return (
      <svg {...common} className="shrink-0 text-green-700">
        <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === "error") {
    return (
      <svg {...common} className="shrink-0 text-chili-700">
        <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...common} className="shrink-0 text-fog-dim">
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  );
}

function ToastCard({ toast, t, onDismiss }: { toast: Toast; t: Copy; onDismiss: () => void }) {
  const { explorerCluster, rpcUrl } = useAppConfig();
  return (
    <div
      data-testid="toast"
      data-tone={toast.tone}
      className={`pointer-events-auto flex w-full items-start gap-3 rounded-[18px] border-[1.5px] p-4 text-ink shadow-[var(--shadow-soft)] ${TONE[toast.tone]}`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="m-0 font-display text-[17px] font-bold leading-snug">{toast.title}</p>
        {toast.message ? (
          <p data-testid="toast-message" className={`m-0 text-[15px] leading-[1.5] ${toast.tone === "error" ? "text-chili-700" : "text-ink-soft"}`}>
            {toast.message}
          </p>
        ) : null}
        {toast.steps ? (
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0" data-testid="toast-steps">
            {toast.steps.map((step) => (
              <li key={step.label} data-status={step.status} className="flex items-center gap-2 text-[15px]">
                <StepIcon status={step.status} />
                <span className={step.status === "waiting" ? "text-ink-soft" : step.status === "error" ? "text-chili-700" : "text-ink"}>
                  {step.label}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
        {toast.signature || toast.action ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {toast.signature ? (
              <a
                href={explorerTxUrl(toast.signature, explorerCluster, rpcUrl)}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="toast-explorer"
                className="inline-flex min-h-[44px] items-center text-[15px] font-semibold text-teal-700 underline decoration-teal-700/40 underline-offset-4 hover:decoration-teal-700"
              >
                {t.app.tx.viewExplorer}
                <span className="num sr-only">{` ${truncateMiddle(toast.signature, 6, 6)}, ${t.app.newTab}`}</span>
              </a>
            ) : null}
            {toast.action ? (
              <button
                type="button"
                onClick={toast.action.onClick}
                className="inline-flex min-h-[44px] items-center rounded-[12px] border-[1.5px] border-teal-700 bg-white px-4 font-display text-[15px] font-semibold text-teal-700 hover:bg-teal-50"
              >
                {toast.action.label}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t.app.toast.dismiss}
        className="-mt-1 -mr-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] text-ink-soft hover:bg-mist hover:text-ink"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}

function AutoDismiss({ toast, dismiss }: { toast: Toast; dismiss: (id: string) => void }) {
  useEffect(() => {
    if (toast.autoDismissMs === undefined) return;
    const timer = setTimeout(() => dismiss(toast.id), toast.autoDismissMs);
    return () => clearTimeout(timer);
  }, [toast.id, toast.autoDismissMs, dismiss]);
  return null;
}

/** Holds the toasts and renders their live region after `children`. */
export function ToastProvider({ t, children }: { t: Copy; children: ReactNode }) {
  const api = useToastState();
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        aria-label={t.app.toast.region}
        data-testid="toast-region"
        className="pointer-events-none fixed top-3 right-3 left-3 z-40 flex flex-col gap-3 sm:left-auto sm:w-[min(26rem,calc(100vw-1.5rem))]"
      >
        {api.toasts.map((toast) => (
          <div key={toast.id}>
            <AutoDismiss toast={toast} dismiss={api.dismiss} />
            <ToastCard toast={toast} t={t} onDismiss={() => api.dismiss(toast.id)} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
