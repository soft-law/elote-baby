// Fills "{name}" slots in a translated string. `fillText` returns a string; `fill` accepts React
// nodes (for example an <Amount>) and returns fragments, so copy never has to be split by hand.
import { Fragment, type ReactNode } from "react";

const SLOT = /\{(\w+)\}/g;

export function fillText(template: string, values: Record<string, string>): string {
  return template.replace(SLOT, (whole, name: string) => values[name] ?? whole);
}

export function fill(template: string, values: Record<string, ReactNode>): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of template.matchAll(SLOT)) {
    const name = match[1]!;
    const index = match.index ?? 0;
    if (index > last) out.push(template.slice(last, index));
    out.push(<Fragment key={`${name}-${index}`}>{name in values ? values[name] : match[0]}</Fragment>);
    last = index + match[0].length;
  }
  if (last < template.length) out.push(template.slice(last));
  return <>{out}</>;
}
