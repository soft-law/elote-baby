// Dialog rendered in a portal on document.body: labelled by its title, closes on Escape, on the
// close button and on a click outside the panel; keeps Tab inside the panel; moves focus in on
// open and back to the opener on close; locks page scroll while open. No entry animation, so
// reduced motion needs nothing special.
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type ModalProps = {
  title: string;
  /** Accessible name of the close button (translated by the caller). */
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
};

export function Modal({ title, closeLabel, onClose, children, className = "" }: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    (panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-night/60 p-0 sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCloseRef.current();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex max-h-[90dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-[24px] bg-paper text-ink shadow-[var(--shadow-soft)] outline-none sm:rounded-[24px] ${className}`.trim()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 id={titleId} className="m-0 text-[20px] font-bold leading-tight">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => onCloseRef.current()}
            aria-label={closeLabel}
            className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] text-ink-soft hover:bg-mist hover:text-ink"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
