// "Get test tokens": asks the server faucet (POST {apiUrl}/api/faucet with {address}) to send test
// tokens to the connected wallet. 200 gives a signature (explorer link, balances refreshed); 429
// is the one-request-per-wallet-per-day limit; 503 means the faucet is off; anything else,
// including a network or CORS failure, is a friendly retry message. The result is announced.
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Address } from "@solana/kit";
import type { Copy } from "../../translations";
import { explorerTxUrl } from "../../tx/explorer";
import { useAppConfig } from "../configContext";

export type FaucetResult =
  | { kind: "sent"; signature: string }
  | { kind: "limited" }
  | { kind: "unavailable" }
  | { kind: "failed" };

/** One faucet request. Never throws. */
export async function requestTestTokens(apiUrl: string, address: Address, fetchImpl: typeof fetch = fetch): Promise<FaucetResult> {
  let response: Response;
  try {
    response = await fetchImpl(`${apiUrl}/api/faucet`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 429) return { kind: "limited" };
  if (response.status === 503) return { kind: "unavailable" };
  if (!response.ok) return { kind: "failed" };
  try {
    const body = (await response.json()) as { signature?: unknown };
    return typeof body.signature === "string" && body.signature.length > 0 ? { kind: "sent", signature: body.signature } : { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}

/** Refreshes balances now and again shortly, while the faucet transfer lands. */
export const BALANCE_REFRESH_DELAYS_MS = [0, 4_000, 10_000];

export const secondaryButton =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-teal-700 bg-white px-4 font-display text-[16px] font-semibold text-teal-700 hover:bg-teal-50 disabled:cursor-wait disabled:opacity-70";

export function FaucetButton({ address, t }: { address: Address; t: Copy }) {
  const f = t.app.faucet;
  const { apiUrl, explorerCluster } = useAppConfig();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<FaucetResult | null>(null);

  const onClick = async () => {
    setPending(true);
    setResult(null);
    const next = await requestTestTokens(apiUrl, address);
    setResult(next);
    setPending(false);
    if (next.kind === "sent") {
      for (const ms of BALANCE_REFRESH_DELAYS_MS) {
        setTimeout(() => void queryClient.invalidateQueries({ queryKey: ["balances"] }), ms);
      }
    }
  };

  const message =
    result?.kind === "sent" ? f.sent : result?.kind === "limited" ? f.limited : result?.kind === "unavailable" ? f.unavailable : result ? f.failed : "";

  return (
    <div className="flex flex-col items-start gap-2">
      <button type="button" onClick={() => void onClick()} disabled={pending} aria-busy={pending} data-testid="faucet-button" className={secondaryButton}>
        {pending ? f.getting : f.get}
      </button>
      <div aria-live="polite" data-testid="faucet-status" data-result={result?.kind ?? ""} className="text-[15px] leading-[1.5]">
        {result ? (
          <p className={`m-0 ${result.kind === "sent" ? "text-ink" : "text-chili-700"}`}>
            {message}{" "}
            {result.kind === "sent" ? (
              <a
                href={explorerTxUrl(result.signature, explorerCluster)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center font-semibold text-teal-700 underline underline-offset-4"
              >
                {f.viewExplorer}
                <span className="sr-only"> ({f.newTab})</span>
              </a>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}
