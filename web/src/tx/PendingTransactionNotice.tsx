// Shows transactions from an earlier visit that are still settling, with explorer links, so a
// person who closed the tab mid-transaction knows not to repeat it. Also says when part of the
// record could not be read and was set aside. When an entry settles it refreshes the reads a
// transaction changes, also when the form that sent it is no longer on screen.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useAppConfig } from "../app/configContext";
import { truncateMiddle } from "../pool/format";
import type { Copy } from "../translations";
import { explorerTxUrl } from "./explorer";
import { useJournalRecovery, type JournalRecoveryOptions } from "./useJournalRecovery";
import { isFollowedByTx, TX_INVALIDATES } from "./useTx";

const buttonClass = "app-btn app-btn-teal shrink-0 self-start sm:self-center";

export function PendingTransactionNotice({ t, recovery }: { t: Copy; recovery?: JournalRecoveryOptions }) {
  const { explorerCluster, rpcUrl } = useAppConfig();
  const { pending, unavailable, checking, checkNow, dismissUnavailable } = useJournalRecovery(recovery);
  const queryClient = useQueryClient();
  const p = t.app.tx.pending;

  // An entry that left the list was settled (confirmed, expired or failed): refresh what it changes,
  // unless the useTx that sent it is still on screen and refreshes for it (one refresh, not two).
  const listed = pending.map((e) => e.signature).join(",");
  const previous = useRef<string[]>([]);
  useEffect(() => {
    const now = listed === "" ? [] : listed.split(",");
    const settled = previous.current.some((sig) => !now.includes(sig) && !isFollowedByTx(sig));
    previous.current = now;
    if (settled) for (const queryKey of TX_INVALIDATES) void queryClient.invalidateQueries({ queryKey: [...queryKey] });
  }, [listed, queryClient]);

  // Its height feeds --pending-h, so sticky submits sit above it and nothing covers the bottom bar.
  const ref = useRef<HTMLElement>(null);
  const shown = unavailable || pending.length > 0;
  useLayoutEffect(() => {
    const root = document.documentElement;
    const node = ref.current;
    if (!shown || !node) {
      root.style.removeProperty("--pending-h");
      return;
    }
    const set = () => root.style.setProperty("--pending-h", `${node.offsetHeight}px`);
    set();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(set);
    observer?.observe(node);
    return () => {
      observer?.disconnect();
      root.style.removeProperty("--pending-h");
    };
  }, [shown]);

  if (!shown) return null;

  return (
    <aside
      ref={ref}
      role="status"
      aria-live="polite"
      className="on-paper fixed inset-x-0 bottom-[var(--bottom-bar-offset,0px)] z-30 flex max-h-[45vh] flex-col gap-2 overflow-y-auto border-t-[3px] border-corn-300 bg-corn-100 px-4 py-2.5 text-ink md:right-4 md:bottom-[calc(var(--footer-height)+1rem)] md:left-auto md:w-[min(28rem,calc(100vw-2rem))] md:gap-3 md:rounded-[18px] md:border-[1.5px] md:p-4 md:shadow-[var(--shadow-soft)]"
    >
      {unavailable ? (
        <>
          <p className="m-0 text-[15px] leading-[1.5]">{p.unavailable}</p>
          <button type="button" onClick={dismissUnavailable} className={buttonClass}>
            {t.app.tx.dismiss}
          </button>
        </>
      ) : null}
      {pending.length > 0 ? (
        <>
          <p className="m-0 font-display text-[16px] font-semibold">{p.title}</p>
          <p className="m-0 text-[15px] leading-[1.5] text-ink-soft max-md:sr-only">{p.body}</p>
          <ul className="m-0 flex list-none flex-col gap-0 p-0 md:gap-2">
            {pending.map((entry) => (
              <li key={entry.signature} className="flex flex-wrap items-center justify-between gap-x-3 text-[15px]">
                <span>
                  <span className="font-semibold">{t.app.tx.ops[entry.op]}</span>
                  <span className="text-ink-soft">: {entry.status === "signed" ? p.signed : p.sent}</span>
                </span>
                <a
                  href={explorerTxUrl(entry.signature, explorerCluster, rpcUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="num inline-flex min-h-[44px] items-center text-[14px] text-teal-700 underline decoration-teal-700/40 underline-offset-4"
                >
                  {truncateMiddle(entry.signature, 6, 6)}
                  <span className="sr-only">, {t.app.tx.viewExplorer}</span>
                </a>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => void checkNow()} disabled={checking} aria-busy={checking} className={buttonClass}>
            {checking ? p.checking : p.check}
          </button>
        </>
      ) : null}
    </aside>
  );
}
