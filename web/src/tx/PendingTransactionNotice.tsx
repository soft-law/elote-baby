// Shows transactions from an earlier visit that are still settling, with explorer links, so a
// person who closed the tab mid-transaction knows not to repeat it. Also says when part of the
// record could not be read and was set aside. When an entry settles it refreshes the reads a
// transaction changes, also when the form that sent it is no longer on screen.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useAppConfig } from "../app/configContext";
import { truncateMiddle } from "../pool/format";
import type { Copy } from "../translations";
import { explorerTxUrl } from "./explorer";
import { useJournalRecovery, type JournalRecoveryOptions } from "./useJournalRecovery";
import { isFollowedByTx, TX_INVALIDATES } from "./useTx";

const buttonClass =
  "inline-flex min-h-[44px] items-center justify-center self-start rounded-[12px] border-[1.5px] border-teal-700 px-4 font-display text-[15px] font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-70";

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

  if (!unavailable && pending.length === 0) return null;

  return (
    <aside
      role="status"
      aria-live="polite"
      className="fixed right-4 bottom-4 left-4 z-30 flex flex-col gap-3 rounded-[18px] border-[1.5px] border-teal-700 bg-white p-4 text-ink shadow-[var(--shadow-soft)] sm:left-auto sm:w-[min(26rem,calc(100vw-2rem))]"
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
          <p className="m-0 font-display text-[17px] font-bold">{p.title}</p>
          <p className="m-0 text-[15px] leading-[1.5] text-ink-soft">{p.body}</p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
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
                  className="num inline-flex min-h-[44px] items-center text-[14px] text-teal-700"
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
