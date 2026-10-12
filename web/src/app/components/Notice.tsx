// A page notice (warning or error, with an optional action) and the "Try again" button that goes in it.
import type { ReactNode } from "react";

export function Notice({ tone, role, children, testId }: { tone: "warn" | "error"; role: "status" | "alert"; children: ReactNode; testId?: string }) {
  const style = tone === "warn" ? "border-corn-300 bg-corn-100 text-ink" : "border-2 border-chili-700 bg-chili-50 text-ink";
  return (
    <div
      role={role}
      data-testid={testId}
      className={`flex flex-col gap-3 rounded-[18px] border px-4 py-3.5 text-[16px] leading-[1.5] sm:flex-row sm:items-center sm:justify-between ${style}`}
    >
      {children}
    </div>
  );
}

export function RetryButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="app-btn app-btn-line shrink-0 bg-paper"
    >
      {label}
    </button>
  );
}
