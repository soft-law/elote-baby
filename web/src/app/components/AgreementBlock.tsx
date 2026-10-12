// The agreement a line holds: its hash (mono, truncated, full value in title and sr text, copy
// button), and when the API knows the hash, the summary (template, status, signatures, date) and
// the evidence link. The lookup never blocks the card: without it only the hash shows.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useAgreementQuery, type AgreementSummary } from "../agreement";
import { fillText } from "../fill";
import { formatDate, truncateMiddle } from "../../pool/format";
import type { Copy, Lang } from "../../translations";
import { Field } from "./Field";

/** How long "Hash copied" shows before the button reads "Copy hash" again. */
export const COPIED_RESET_MS = 2_000;

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}
const IconCopy = () => (
  <Svg>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
    <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
  </Svg>
);
const IconCheck = () => (
  <Svg>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);
const IconExternal = () => (
  <Svg>
    <path d="M14 5h5v5M19 5l-8 8" />
    <path d="M17 13.5V18a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V8.5A1.5 1.5 0 0 1 6 7h4.5" />
  </Svg>
);


/** SQLite "YYYY-MM-DD HH:MM:SS" (UTC) or ISO; null when it does not parse. */
export function agreementCreatedSeconds(createdAt: string): number | null {
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(createdAt) ? `${createdAt.replace(" ", "T")}Z` : createdAt;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function agreementStatusLabel(status: string, t: Copy): string | null {
  const s = t.app.borrow.agreement.statuses;
  switch (status) {
    case "draft":
      return s.draft;
    case "pending_signatures":
      return s.pendingSignatures;
    case "signed":
      return s.signed;
    case "anchored":
      return s.anchored;
    default:
      return null;
  }
}

function AgreementDetails({ summary, t, lang }: { summary: AgreementSummary; t: Copy; lang: Lang }) {
  const a = t.app.borrow.agreement;
  const status = agreementStatusLabel(summary.status, t);
  const created = agreementCreatedSeconds(summary.createdAt);
  return (
    <div data-testid="agreement-summary" className="flex flex-col gap-3">
      <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2">
        <Field label={a.template}>
          <span className="num text-[15px]">
            {summary.template.id} {summary.template.version}
          </span>
        </Field>
        {status ? <Field label={a.status}>{status}</Field> : null}
        {summary.signaturesCount !== null ? (
          <Field label={a.signatures}>
            {summary.roles.length > 0
              ? fillText(a.signaturesValue, { count: String(summary.signaturesCount), total: String(summary.roles.length) })
              : String(summary.signaturesCount)}
          </Field>
        ) : null}
        {created !== null ? <Field label={a.created}>{formatDate(created, lang)}</Field> : null}
      </dl>
      {summary.evidenceUrl ? (
        <a
          href={summary.evidenceUrl}
          target="_blank"
          rel="noreferrer"
          data-testid="agreement-evidence"
          className="inline-flex min-h-[44px] w-fit items-center gap-2 font-display text-[16px] font-semibold text-teal-700 underline decoration-teal-700/40 underline-offset-4 hover:decoration-teal-700"
        >
          {a.evidence}
          <IconExternal />
          <span className="sr-only"> ({t.app.newTab})</span>
        </a>
      ) : null}
    </div>
  );
}

export function AgreementBlock({ hashHex, t, lang }: { hashHex: string; t: Copy; lang: Lang }) {
  const a = t.app.borrow.agreement;
  const query = useAgreementQuery(hashHex);
  const [copied, setCopied] = useState(false);
  const labelId = useId();
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );
  const onCopy = async () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    try {
      await navigator.clipboard.writeText(hashHex);
      setCopied(true);
      // Back to "Copy hash" after a moment, so the next copy is announced again.
      resetTimer.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      setCopied(false);
    }
  };
  const found = query.data?.kind === "found" ? query.data.summary : null;
  return (
    <section aria-labelledby={labelId} data-testid="agreement" className="app-panel-corn flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p id={labelId} className="label m-0 text-ink-soft">
          {a.hash}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code title={hashHex} data-testid="agreement-hash" className="num min-w-0 break-all rounded-[10px] border border-corn-300 bg-paper px-2.5 py-2 text-[13px] text-ink">
            <span aria-hidden="true">{truncateMiddle(hashHex, 10, 10)}</span>
            <span className="sr-only">{hashHex}</span>
          </code>
          <button
            type="button"
            onClick={() => void onCopy()}
            data-testid="agreement-copy"
            className="app-btn app-btn-line min-w-[44px] bg-paper px-3"
          >
            {copied ? <IconCheck /> : <IconCopy />}
            <span className="sr-only sm:not-sr-only">{copied ? a.copied : a.copy}</span>
          </button>
          <span role="status" className="sr-only">
            {copied ? a.copied : ""}
          </span>
        </div>
      </div>
      {found ? <AgreementDetails summary={found} t={t} lang={lang} /> : null}
    </section>
  );
}
