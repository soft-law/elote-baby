// Header wallet control. Absent: a button that opens the list of Solana wallets found in this
// browser. Connected: the truncated address, with copy and disconnect. Wrong chain: the same,
// with the reason. Disclosure pattern: Escape and outside clicks close it, focus returns.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { truncateMiddle } from "../pool/format";
import type { Copy } from "../translations";
import { isTxCancelled } from "../tx/errors";
import { hasBraveWallet, useWallet, walletErrorDetail, WalletNoAccountError, wrongChainText } from "./useWallet";
import type { UiWallet } from "@wallet-standard/react";

const PHANTOM_URL = "https://phantom.com/";

function Svg({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const IconWallet = () => (
  <Svg>
    <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" />
    <rect x="4" y="8" width="16" height="11" rx="2.5" />
    <path d="M16 13.5h1.5" />
  </Svg>
);
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
const IconLogout = () => (
  <Svg>
    <path d="M14 4.5h3.5A1.5 1.5 0 0 1 19 6v12a1.5 1.5 0 0 1-1.5 1.5H14" />
    <path d="M10 8l-4 4 4 4M6 12h9" />
  </Svg>
);
const IconAlert = () => (
  <Svg>
    <path d="M12 4l9 16H3z" />
    <path d="M12 10v4M12 17h.01" />
  </Svg>
);

const triggerBase =
  "inline-flex min-h-[44px] items-center gap-2 rounded-[12px] border-[1.5px] px-3.5 font-display text-[15px] font-semibold transition-colors";
const itemBase =
  "flex min-h-[44px] w-full items-center gap-3 rounded-[12px] px-3 text-left font-display text-[16px] font-semibold text-ink hover:bg-mist focus-visible:outline-teal-700";

export function ConnectButton({ t }: { t: Copy }) {
  const w = t.app.wallet;
  const { status, address, account, chain, wallets, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  /** Why the last connect failed: no account shared, or another error with the wallet's own words. */
  const [failed, setFailed] = useState<null | { kind: "noAccount" } | { kind: "other"; detail: string | null }>(null);
  const [copied, setCopied] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    setOffset(null);
    setFailed(null);
    setCopied(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  // Keeps the panel inside the viewport wherever the header wrapped the trigger.
  const [offset, setOffset] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const root = rootRef.current;
      const panel = panelRef.current;
      if (!root || !panel) return;
      const rect = root.getBoundingClientRect();
      const width = panel.offsetWidth;
      const viewport = document.documentElement.clientWidth;
      const preferred = rect.width - width; // right edges aligned
      setOffset(Math.min(Math.max(preferred, 16 - rect.left), viewport - 16 - width - rect.left));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  const placed = offset !== null;
  useEffect(() => {
    if (!open || !placed) return;
    panelRef.current?.querySelector<HTMLElement>("button, a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, placed, close]);

  const onConnect = async (wallet: UiWallet) => {
    setFailed(null);
    try {
      await connect(wallet);
      close(true);
    } catch (error) {
      // Declining in the wallet is a choice, not a failure.
      if (isTxCancelled(error)) return;
      // Kept for a bug report; the person sees the cause below.
      console.warn("Wallet connection failed", error);
      setFailed(error instanceof WalletNoAccountError ? { kind: "noAccount" } : { kind: "other", detail: walletErrorDetail(error) });
    }
  };

  const onCopy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const onDisconnect = async () => {
    await disconnect();
    close(true);
  };

  const hasAccount = status === "connected" || status === "wrong-chain";
  const label =
    status === "connecting" ? w.connecting : hasAccount && address ? truncateMiddle(address) : t.app.header.connect;
  const tone =
    status === "wrong-chain"
      ? "border-chili-700 bg-chili-50 text-chili-700"
      : hasAccount
        ? "border-neon text-neon hover:bg-neon/15"
        : "border-neon bg-neon text-on-neon hover:bg-neon-hover";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="true"
        aria-busy={status === "connecting"}
        disabled={status === "connecting"}
        onClick={() => (open ? close(false) : setOpen(true))}
        className={`${triggerBase} ${tone} disabled:cursor-wait disabled:opacity-80`}
      >
        {status === "wrong-chain" ? <IconAlert /> : <IconWallet />}
        <span className={hasAccount ? "num" : undefined}>{label}</span>
        {hasAccount ? <span className="sr-only">, {w.menu}</span> : null}
      </button>

      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="group"
          aria-label={hasAccount ? w.menu : w.choose}
          style={offset === null ? { visibility: "hidden" } : { left: offset }}
          className="absolute top-full z-40 mt-2 flex w-[min(320px,calc(100vw-2rem))] flex-col gap-1 rounded-[18px] border border-line bg-white p-2 text-ink shadow-[var(--shadow-soft)]"
        >
          {hasAccount && address ? (
            <>
              <div className="px-3 pt-2 pb-1">
                <p className="label m-0 text-ink-soft">{w.connectedAs}</p>
                <p className="num m-0 break-all text-[14px] leading-[1.5]">{address}</p>
              </div>
              {status === "wrong-chain" ? (
                <p role="alert" className="m-0 rounded-[12px] bg-chili-50 px-3 py-2 text-[15px] leading-[1.5] text-chili-700">
                  {wrongChainText(account, chain, w, t.app.header.network)}
                </p>
              ) : null}
              <button type="button" onClick={onCopy} className={itemBase}>
                {copied ? <IconCheck /> : <IconCopy />}
                {copied ? w.copied : w.copy}
              </button>
              <span className="sr-only" aria-live="polite">
                {copied ? w.copied : ""}
              </span>
              <button type="button" onClick={onDisconnect} className={itemBase}>
                <IconLogout />
                {w.disconnect}
              </button>
            </>
          ) : (
            <>
              <p className="label m-0 px-3 pt-2 pb-1 text-ink-soft">{w.choose}</p>
              {wallets.length === 0 ? (
                <div className="flex flex-col gap-2 px-3 pb-2">
                  <p className="m-0 text-[15px] leading-[1.5] text-ink-soft">{w.none}</p>
                  <a
                    href={PHANTOM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[44px] items-center font-display text-[16px] font-semibold text-teal-700 focus-visible:outline-teal-700"
                  >
                    {w.getWallet}
                  </a>
                </div>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {wallets.map((wallet) => (
                    <li key={wallet.name}>
                      <button type="button" onClick={() => void onConnect(wallet)} className={itemBase}>
                        <img src={wallet.icon} alt="" width={28} height={28} className="rounded-[8px]" />
                        {wallet.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!wallets.some((wallet) => /phantom/i.test(wallet.name)) && hasBraveWallet() ? (
                <p data-testid="wallet-brave-hint" className="m-0 px-3 py-2 text-[15px] leading-[1.5] text-ink-soft">
                  {w.braveHint}
                </p>
              ) : null}
              {failed ? (
                <div role="alert" data-testid="wallet-connect-failed" className="flex flex-col gap-1 px-3 py-2 text-[15px] leading-[1.5] text-chili-700">
                  {failed.kind === "noAccount" ? (
                    <p className="m-0">{w.noAccount.replace("{network}", t.app.header.network)}</p>
                  ) : (
                    <>
                      <p className="m-0">{w.connectFailed}</p>
                      {failed.detail ? (
                        <p className="m-0 break-words text-ink-soft" data-testid="wallet-error-detail">
                          {w.walletSaid.replace("{message}", failed.detail)}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
