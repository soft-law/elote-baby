// A page notice (warning or error, with an optional action) and the "Try again" button that goes in it.
import type { ReactNode } from "react";

export function Notice({ tone, role, children, testId }: { tone: "warn" | "error"; role: "status" | "alert"; children: ReactNode; testId?: string }) {
  const style = tone === "warn" ? "border-corn-300 bg-corn-100 text-ink" : "border-chili-700/30 bg-chili-50 text-chili-700";
  return (
    <div
      role={role}
      data-testid={testId}
      className={`flex flex-col gap-3 rounded-[18px] border-[1.5px] px-4 py-3 text-[17px] leading-[1.5] sm:flex-row sm:items-center sm:justify-between ${style}`}
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
      className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-[14px] border-[1.5px] border-teal-700 bg-white px-4 font-display text-[16px] font-semibold text-teal-700 hover:bg-teal-50"
    >
      {label}
    </button>
  );
}
