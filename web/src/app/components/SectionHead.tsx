// Heading block of a page section: optional eyebrow, title (h2), optional lead and actions.
import type { ReactNode } from "react";

export type SectionHeadProps = {
  title: ReactNode;
  eyebrow?: string;
  sub?: ReactNode;
  actions?: ReactNode;
  /** Id of the h2, for aria-labelledby on the section. */
  id?: string;
};

export function SectionHead({ title, eyebrow, sub, actions, id }: SectionHeadProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-2">
        {eyebrow ? <p className="label m-0 text-ink-soft">{eyebrow}</p> : null}
        <h2 id={id} className="m-0 break-words text-[26px] font-bold leading-[1.15] tracking-[-0.01em] md:text-[32px]">
          {title}
        </h2>
        {sub ? <p className="m-0 max-w-[60ch] text-[17px] leading-[1.55] text-ink-soft">{sub}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
