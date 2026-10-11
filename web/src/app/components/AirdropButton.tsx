// "Get test SOL": requestAirdrop of 1 SOL from the configured RPC, retried up to 3 times. Public
// airdrops are often rate limited, so after the last failure the button points to the Solana
// faucet instead.
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { lamports, type Address } from "@solana/kit";
import type { Copy } from "../../translations";
import { explorerTxUrl } from "../../tx/explorer";
import type { EloteRpc } from "../../tx/rpc";
import { useRpc } from "../../tx/RpcProvider";
import { LAMPORTS_PER_SOL } from "../balances";
import { useAppConfig } from "../configContext";
import { BALANCE_REFRESH_DELAYS_MS, secondaryButton } from "./FaucetButton";

export const SOLANA_FAUCET_URL = "https://faucet.solana.com";
/** Retries after the first request. */
export const AIRDROP_RETRIES = 3;

export type AirdropResult = { kind: "sent"; signature: string } | { kind: "failed" };

/** One airdrop of 1 SOL, retried; never throws. */
export async function requestSol(
  rpc: EloteRpc,
  address: Address,
  opts: { retries?: number; delayMs?: number } = {},
): Promise<AirdropResult> {
  const retries = opts.retries ?? AIRDROP_RETRIES;
  const delayMs = opts.delayMs ?? 1_500;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const signature = await rpc.requestAirdrop(address, lamports(LAMPORTS_PER_SOL)).send();
      return { kind: "sent", signature };
    } catch {
      if (attempt < retries) await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
  return { kind: "failed" };
}

export function AirdropButton({ address, t, retryDelayMs }: { address: Address; t: Copy; retryDelayMs?: number }) {
  const f = t.app.faucet;
  const rpc = useRpc();
  const { explorerCluster } = useAppConfig();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<AirdropResult | null>(null);

  const onClick = async () => {
    setPending(true);
    setResult(null);
    const next = await requestSol(rpc, address, retryDelayMs === undefined ? {} : { delayMs: retryDelayMs });
    setResult(next);
    setPending(false);
    if (next.kind === "sent") {
      for (const ms of BALANCE_REFRESH_DELAYS_MS) {
        setTimeout(() => void queryClient.invalidateQueries({ queryKey: ["balances"] }), ms);
      }
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <button type="button" onClick={() => void onClick()} disabled={pending} aria-busy={pending} data-testid="airdrop-button" className={secondaryButton}>
        {pending ? f.solGetting : f.sol}
      </button>
      <div aria-live="polite" data-testid="airdrop-status" data-result={result?.kind ?? ""} className="text-[15px] leading-[1.5]">
        {result?.kind === "sent" ? (
          <p className="m-0 text-ink">
            {f.solSent}{" "}
            <a
              href={explorerTxUrl(result.signature, explorerCluster)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center font-semibold text-teal-700 underline underline-offset-4"
            >
              {f.viewExplorer}
              <span className="sr-only"> ({f.newTab})</span>
            </a>
          </p>
        ) : result?.kind === "failed" ? (
          <p className="m-0 text-chili-700">
            {f.solFailed}{" "}
            <a
              href={SOLANA_FAUCET_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center font-semibold text-teal-700 underline underline-offset-4"
            >
              {f.solFaucet}
              <span className="sr-only"> ({f.newTab})</span>
            </a>
          </p>
        ) : null}
      </div>
    </div>
  );
}
