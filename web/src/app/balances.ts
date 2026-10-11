// The connected wallet's balances: SOL, the test token and pool shares, in ONE getMultipleAccounts
// for the owner account and its two associated token accounts. A token account that does not
// exist yet is a zero balance, not an error.
import { getTokenDecoder } from "@solana-program/token";
import { parseBase64RpcAccount, type Address, type MaybeEncodedAccount } from "@solana/kit";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { Lang } from "../translations";
import { ataOf } from "../tx/ops";
import type { EloteRpc } from "../tx/rpc";
import { useRpc } from "../tx/RpcProvider";
import { derivePoolAccounts, type PoolAccounts } from "./config";
import { useAppConfig } from "./configContext";

export type Balances = {
  owner: Address;
  /** SOL of the owner account, in lamports. */
  lamports: bigint;
  /** Test token (tMXN) base units in the owner's associated token account. */
  asset: bigint;
  /** Pool share base units in the owner's associated token account. */
  shares: bigint;
  assetAccount: Address;
  shareAccount: Address;
  slot: bigint;
};

/** Lamports in one SOL. */
export const LAMPORTS_PER_SOL = 1_000_000_000n;
/** Below this the page warns that network fees may not be covered (0.01 SOL). */
export const LOW_SOL_LAMPORTS = 10_000_000n;

export const balancesQueryKey = (owner: Address | null) => ["balances", owner] as const;

function tokenAmount(account: MaybeEncodedAccount | undefined, mint: Address): bigint {
  if (!account?.exists) return 0n;
  try {
    const token = getTokenDecoder().decode(account.data);
    return token.mint === mint ? token.amount : 0n;
  } catch {
    return 0n;
  }
}

/** One request: the owner account, its test token account and its share account. */
export async function readBalances(
  rpc: EloteRpc,
  args: { owner: Address; assetMint: Address; shareMint: Address },
  abortSignal?: AbortSignal,
): Promise<Balances> {
  const { owner, assetMint, shareMint } = args;
  const [assetAccount, shareAccount] = await Promise.all([ataOf(owner, assetMint), ataOf(owner, shareMint)]);
  const addresses = [owner, assetAccount, shareAccount];
  const { context, value } = await rpc.getMultipleAccounts(addresses, { encoding: "base64" }).send({ abortSignal });
  const [ownerRaw, assetRaw, shareRaw] = addresses.map((a, i) => parseBase64RpcAccount(a, value[i] ?? null));
  return {
    owner,
    lamports: ownerRaw?.exists ? BigInt(ownerRaw.lamports) : 0n,
    asset: tokenAmount(assetRaw, assetMint),
    shares: tokenAmount(shareRaw, shareMint),
    assetAccount,
    shareAccount,
    slot: context.slot,
  };
}

const accountsCache = new Map<string, Promise<PoolAccounts>>();
function poolAccounts(pool: Address): Promise<PoolAccounts> {
  let hit = accountsCache.get(pool);
  if (!hit) {
    hit = derivePoolAccounts(pool);
    hit.catch(() => accountsCache.delete(pool));
    accountsCache.set(pool, hit);
  }
  return hit;
}

/** Balances of `owner`; disabled while no wallet is connected. A confirmed tx invalidates ["balances"]. */
export function useBalancesQuery(owner: Address | null): UseQueryResult<Balances> {
  const rpc = useRpc();
  const { poolAddress, assetMint } = useAppConfig();
  return useQuery({
    queryKey: balancesQueryKey(owner),
    queryFn: async ({ signal }) => {
      if (!owner) throw new Error("no wallet connected");
      const { shareMint } = await poolAccounts(poolAddress);
      return readBalances(rpc, { owner, assetMint, shareMint }, signal);
    },
    enabled: owner !== null,
  });
}

/** Lamports as SOL with up to 4 decimals, rounded down: 1_234_500_000n gives "1.2345". */
export function formatSol(lamports: bigint, lang: Lang = "en"): string {
  const whole = lamports / LAMPORTS_PER_SOL;
  const frac = ((lamports % LAMPORTS_PER_SOL) / 100_000n).toString().padStart(4, "0").replace(/0+$/, "");
  const grouped = new Intl.NumberFormat(lang === "es" ? "es-MX" : "en-US").format(whole);
  return `${grouped}${frac ? `.${frac}` : ""}`;
}
