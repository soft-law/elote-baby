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
    <div className="flex flex-col items-center gap-3 rounded-[18px] border border-dashed border-ink-soft bg-paper px-6 py-8 text-center">
      {icon ? (
        <span className="text-teal-700">{icon}</span>
      ) : (
        <span className="app-logo-tile !h-10 !w-10" aria-hidden="true">
          <img src="/corn-mark.png" alt="" width={30} height={30} className="!h-[30px] !w-[30px]" />
        </span>
      )}
      <p className="app-h3 m-0 text-ink">{title}</p>
      {body ? <p className="m-0 max-w-[48ch] text-[15px] leading-[1.55] text-ink-soft">{body}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
