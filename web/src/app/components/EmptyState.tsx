// A section with nothing to show yet: what is missing, why, and one way forward.
import type { ReactNode } from "react";

export type EmptyStateProps = {
  title: string;
  body?: ReactNode;
  icon?: ReactNode;
  /** One action: a link or a button, already labeled. */
  action?: ReactNode;
};

export function EmptyState({ title, body, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[18px] border-[1.5px] border-dashed border-fog bg-white px-5 py-10 text-center">
      {icon ? <span className="text-teal-700">{icon}</span> : null}
      <p className="m-0 font-display text-[20px] font-semibold text-ink">{title}</p>
      {body ? <p className="m-0 max-w-[48ch] text-[17px] leading-[1.55] text-ink-soft">{body}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
