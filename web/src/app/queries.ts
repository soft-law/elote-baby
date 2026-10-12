// Reads of the public pool state. Each query is one RPC request per refresh: the pool, its vault
// token account and its share token in one getMultipleAccounts; the credit lines in another
// (chunks of 100 addresses, so one request up to 100 lines). Lines are decoded through the
// tolerant adapter in pool/line.ts, never the generated CreditLine decoder, so a status or layout
// this code does not know renders as "unknown" instead of failing the page.
import {
  ELOTE_POOL_PROGRAM_ADDRESS,
  POOL_DISCRIMINATOR,
  findLinePda,
  getPoolDecoder,
  type Pool,
} from "@elote/pool-client";
import { getMintDecoder, getTokenDecoder } from "@solana-program/token";
import { parseBase64RpcAccount, type Address, type MaybeEncodedAccount, type ReadonlyUint8Array } from "@solana/kit";
import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { decodeLineView, type AnyLineView } from "../pool/line";
import { nav, perShare } from "../pool/math";
import type { EloteRpc } from "../tx/rpc";
import { useRpc } from "../tx/RpcProvider";
import { derivePoolAccounts, poolMatchesConfig, type AppConfig } from "./config";
import { useAppConfig } from "./configContext";
import { QUERY_REFETCH_MS } from "./providers";

/** Addresses per getMultipleAccounts request (the RPC limit). */
export const ACCOUNTS_PER_REQUEST = 100;

/** The pool as the pages show it. Amounts in base units of the test token (6 decimals). */
export type PoolView = {
  address: Address;
  version: number;
  admin: Address;
  assetMint: Address;
  vault: Address;
  shareMint: Address;
  deadShares: Address;
  /** Test tokens in the vault: the liquidity on hand. */
  vaultAmount: bigint;
  /** Total share supply, including the locked dead shares. */
  supply: bigint;
  /** Principal drawn and neither repaid nor written off. */
  outstandingPrincipal: bigint;
  /** vaultAmount + outstandingPrincipal (pool/math `nav`). */
  nav: bigint;
  /** Value of one whole share in base units (pool/math `perShare`); 0 while supply is 0. */
  perShare: bigint;
  interestCollected: bigint;
  /** Principal written off so far: the losses the pool has recognized. */
  writtenOff: bigint;
  lineCount: bigint;
  paused: boolean;
  /** Grace after a due date before late interest accrues, in seconds (Pool.reserved bytes 0..4, u32 LE). */
  graceSeconds: number;
  /** Slot the read was served at. */
  slot: bigint;
  /**
   * Chain clock minus the browser clock, in seconds, from the Clock sysvar read with the pool (the
   * clock the program's late interest uses). Null when the node did not return it: callers then
   * use the browser clock.
   */
  chainClockOffset: number | null;
};

/** Why the configured pool cannot be shown. A configuration problem, never retried. */
export type PoolMismatchReason = "poolMissing" | "notAPool" | "assetMismatch" | "accountsMismatch";

/**
 * The pool exists but its vault or share token was not returned (for example a node that is
 * behind on a fresh pool). Thrown, so the query retries and the page offers "Try again".
 */
export class PoolAccountsMissingError extends Error {
  constructor(readonly missing: Array<"vault" | "shareMint">) {
    super(`pool accounts not found: ${missing.join(", ")}`);
    this.name = "PoolAccountsMissingError";
  }
}

export type PoolReadResult = { kind: "ok"; pool: PoolView } | { kind: "mismatch"; reason: PoolMismatchReason };

/** One row of the lines list. `view` is never null: missing or unreadable accounts are "unknown". */
export type PoolLine = { lineId: bigint; address: Address; view: AnyLineView };

export const poolQueryKey = (poolAddress: Address) => ["pool", poolAddress] as const;
/** lineCount is a u64; the key holds it as a number because query keys are hashed as JSON. */
export const linesQueryKey = (poolAddress: Address, lineCount: bigint) => ["lines", poolAddress, Number(lineCount)] as const;

function startsWith(data: ReadonlyUint8Array, prefix: ReadonlyUint8Array): boolean {
  if (data.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) if (data[i] !== prefix[i]) return false;
  return true;
}

async function fetchRaw(rpc: EloteRpc, addresses: Address[], abortSignal?: AbortSignal) {
  const { context, value } = await rpc.getMultipleAccounts(addresses, { encoding: "base64" }).send({ abortSignal });
  const accounts: MaybeEncodedAccount[] = addresses.map((a, i) => parseBase64RpcAccount(a, value[i] ?? null));
  return { slot: context.slot, accounts };
}

/** The Clock sysvar: what `Clock::get()` returns to the program. */
export const SYSVAR_CLOCK_ADDRESS = "SysvarC1ock11111111111111111111111111111111" as Address;
const SYSVAR_PROGRAM_ADDRESS = "Sysvar1111111111111111111111111111111111111" as Address;
/** slot u64, epoch_start_timestamp i64, epoch u64, leader_schedule_epoch u64, unix_timestamp i64. */
const CLOCK_UNIX_TIMESTAMP_OFFSET = 32;

/** Unix seconds of the chain clock from the Clock sysvar account, or null when it is not readable. */
export function clockUnixTimestamp(account: MaybeEncodedAccount | undefined): number | null {
  if (!account?.exists || account.programAddress !== SYSVAR_PROGRAM_ADDRESS) return null;
  const data = account.data;
  if (data.length < CLOCK_UNIX_TIMESTAMP_OFFSET + 8) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const seconds = Number(view.getBigInt64(CLOCK_UNIX_TIMESTAMP_OFFSET, true));
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null;
}

/**
 * Reads the pool, its vault, its share token and the chain clock in one request and checks the
 * pool accounts against the config.
 */
export async function readPool(
  rpc: EloteRpc,
  config: Pick<AppConfig, "poolAddress" | "assetMint">,
  abortSignal?: AbortSignal,
): Promise<PoolReadResult> {
  const derived = await derivePoolAccounts(config.poolAddress);
  const { slot, accounts } = await fetchRaw(rpc, [derived.pool, derived.vault, derived.shareMint, SYSVAR_CLOCK_ADDRESS], abortSignal);
  const [poolAccount, vaultAccount, mintAccount, clockAccount] = accounts;
  const chainNow = clockUnixTimestamp(clockAccount);
  const chainClockOffset = chainNow === null ? null : chainNow - Date.now() / 1000;

  if (!poolAccount?.exists) return { kind: "mismatch", reason: "poolMissing" };
  if (poolAccount.programAddress !== ELOTE_POOL_PROGRAM_ADDRESS || !startsWith(poolAccount.data, POOL_DISCRIMINATOR)) {
    return { kind: "mismatch", reason: "notAPool" };
  }
  let pool: Pool;
  try {
    pool = getPoolDecoder().decode(poolAccount.data);
  } catch {
    return { kind: "mismatch", reason: "notAPool" };
  }
  if (!poolMatchesConfig(pool, config)) return { kind: "mismatch", reason: "assetMismatch" };
  if (pool.vault !== derived.vault || pool.shareMint !== derived.shareMint || pool.deadShares !== derived.deadShares) {
    return { kind: "mismatch", reason: "accountsMismatch" };
  }
  if (!vaultAccount?.exists || !mintAccount?.exists) {
    throw new PoolAccountsMissingError([
      ...(vaultAccount?.exists ? [] : (["vault"] as const)),
      ...(mintAccount?.exists ? [] : (["shareMint"] as const)),
    ]);
  }

  let vaultAmount: bigint;
  let supply: bigint;
  try {
    const vault = getTokenDecoder().decode(vaultAccount.data);
    if (vault.mint !== pool.assetMint) return { kind: "mismatch", reason: "accountsMismatch" };
    vaultAmount = vault.amount;
    supply = getMintDecoder().decode(mintAccount.data).supply;
  } catch {
    return { kind: "mismatch", reason: "accountsMismatch" };
  }

  const navValue = nav(vaultAmount, pool.outstandingPrincipal);
  return {
    kind: "ok",
    pool: {
      address: derived.pool,
      version: pool.version,
      admin: pool.admin,
      assetMint: pool.assetMint,
      vault: pool.vault,
      shareMint: pool.shareMint,
      deadShares: pool.deadShares,
      vaultAmount,
      supply,
      outstandingPrincipal: pool.outstandingPrincipal,
      nav: navValue,
      perShare: perShare(navValue, supply),
      interestCollected: pool.interestCollected,
      writtenOff: pool.writtenOff,
      lineCount: pool.lineCount,
      paused: pool.paused,
      graceSeconds: poolGraceSeconds(pool.reserved),
      slot,
      chainClockOffset,
    },
  };
}

/** The pool's grace period from its reserved bytes (programs/elote_pool/src/state.rs); 0 when absent. */
export function poolGraceSeconds(reserved: ReadonlyUint8Array): number {
  if (reserved.length < 4) return 0;
  return new DataView(reserved.buffer, reserved.byteOffset, 4).getUint32(0, true);
}

const UNREADABLE: AnyLineView = { readable: false, status: "unknown" };

// Line addresses never change for a (pool, lineId): derive each once per page load.
const linePdaCache = new Map<string, Promise<Address>>();
function lineAddress(pool: Address, lineId: bigint): Promise<Address> {
  const key = `${pool}:${lineId}`;
  let hit = linePdaCache.get(key);
  if (!hit) {
    hit = findLinePda({ pool, lineId }).then(([pda]) => pda);
    hit.catch(() => linePdaCache.delete(key));
    linePdaCache.set(key, hit);
  }
  return hit;
}

/** Reads lines 0..lineCount-1, 100 per request. Zero lines make no request. */
export async function readLines(
  rpc: EloteRpc,
  poolAddress: Address,
  lineCount: bigint,
  abortSignal?: AbortSignal,
): Promise<PoolLine[]> {
  if (lineCount <= 0n) return [];
  const ids = Array.from({ length: Number(lineCount) }, (_, i) => BigInt(i));
  const addresses = await Promise.all(ids.map((lineId) => lineAddress(poolAddress, lineId)));
  const rows: PoolLine[] = [];
  for (let start = 0; start < addresses.length; start += ACCOUNTS_PER_REQUEST) {
    const chunk = addresses.slice(start, start + ACCOUNTS_PER_REQUEST);
    const { accounts } = await fetchRaw(rpc, chunk, abortSignal);
    accounts.forEach((account, i) => {
      const lineId = ids[start + i]!;
      const view =
        account.exists && account.programAddress === ELOTE_POOL_PROGRAM_ADDRESS ? decodeLineView(account.data) : UNREADABLE;
      rows.push({ lineId, address: chunk[i]!, view });
    });
  }
  return rows;
}

/** The configured pool. A mismatch is data (kind "mismatch"), not an error, so it is never retried. */
export function usePoolQuery(): UseQueryResult<PoolReadResult> {
  const rpc = useRpc();
  const config = useAppConfig();
  return useQuery({
    queryKey: poolQueryKey(config.poolAddress),
    queryFn: ({ signal }) => readPool(rpc, config, signal),
    // A configuration problem does not fix itself: stop polling once seen.
    refetchInterval: (query) => (query.state.data?.kind === "mismatch" ? false : QUERY_REFETCH_MS),
  });
}

/** Lines of the configured pool. Pass the lineCount from usePoolQuery; disabled until it is known. */
export function useLinesQuery(lineCount: bigint | undefined): UseQueryResult<PoolLine[]> {
  const rpc = useRpc();
  const { poolAddress } = useAppConfig();
  return useQuery({
    queryKey: linesQueryKey(poolAddress, lineCount ?? 0n),
    queryFn: ({ signal }) => readLines(rpc, poolAddress, lineCount ?? 0n, signal),
    enabled: lineCount !== undefined,
    placeholderData: keepPreviousData,
  });
}
