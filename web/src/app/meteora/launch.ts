// Read of the Meteora launch preset: the DBC config, the DBC pool, the fee vault, the treasury's
// pool share account and (after graduation) the DAMM v2 pool, in ONE getMultipleAccounts per
// refresh. Read-only: nothing here signs or sends. The credit pool's own figures (value per share)
// come from usePoolQuery, not from this read.
import { getTokenDecoder } from "@solana-program/token";
import { parseBase64RpcAccount, type Address, type MaybeEncodedAccount } from "@solana/kit";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { ataOf } from "../../tx/ops";
import type { EloteRpc } from "../../tx/rpc";
import { useRpc } from "../../tx/RpcProvider";
import { derivePoolAccounts, type AppConfig } from "../config";
import { useAppConfig } from "../configContext";
import { QUERY_REFETCH_MS } from "../providers";
import type { PresetAddresses } from "./addresses";
import {
  curveProgress,
  decodeDammPool,
  decodeDbcConfig,
  decodeDbcPool,
  decodeFeeVault,
  feeBreakdown,
  priceFromSqrt,
  type CurveProgress,
  type DbcConfigView,
  type DbcPoolView,
  type FeeBreakdown,
  type FeeUserBreakdown,
} from "./decode";

export type LaunchView = {
  config: DbcConfigView;
  pool: DbcPoolView;
  progress: CurveProgress;
  vault: FeeBreakdown;
  /** The curve's fee claimer is the preset's fee vault. */
  feesGoToVault: boolean;
  /** The treasury's row in the vault, or null when the treasury holds no share of it. */
  treasuryFees: FeeUserBreakdown | null;
  /** Credit pool shares in the treasury's associated token account; 0 when it does not exist yet. */
  treasuryShares: bigint;
  treasuryShareAccount: Address;
  /**
   * Base units of the test token per whole tELOTE on the DAMM v2 pool. Null before graduation, or
   * when the pool is missing or does not pair tELOTE (token A) with the test token (token B).
   */
  dammPrice: bigint | null;
  slot: bigint;
};

/**
 * Why the preset cannot be shown. A configuration problem, never retried.
 *   notFound       a committed account is missing or is not the Meteora account it should be
 *   quoteMismatch  the curve is priced in another token than the app's test token
 *   accountsMismatch  the accounts exist but do not belong together (pool of another config,
 *                  another base token, a vault for another token)
 */
export type LaunchMismatchReason = "notFound" | "quoteMismatch" | "accountsMismatch";

export type LaunchReadResult = { kind: "ok"; launch: LaunchView } | { kind: "mismatch"; reason: LaunchMismatchReason };

export const launchQueryKey = (preset: PresetAddresses, config: Pick<AppConfig, "poolAddress" | "assetMint">) =>
  ["launch", preset.dbcConfig, preset.dbcPool, preset.feeVault, preset.treasury, preset.dammPool ?? "", config.poolAddress, config.assetMint] as const;

export async function readLaunch(
  rpc: EloteRpc,
  preset: PresetAddresses,
  config: Pick<AppConfig, "assetMint">,
  shareMint: Address,
  abortSignal?: AbortSignal,
): Promise<LaunchReadResult> {
  const treasuryShareAccount = await ataOf(preset.treasury, shareMint);
  const addresses: Address[] = [preset.dbcConfig, preset.dbcPool, preset.feeVault, treasuryShareAccount];
  if (preset.dammPool) addresses.push(preset.dammPool);
  const { context, value } = await rpc.getMultipleAccounts(addresses, { encoding: "base64" }).send({ abortSignal });
  const accounts: MaybeEncodedAccount[] = addresses.map((a, i) => parseBase64RpcAccount(a, value[i] ?? null));
  const [configAccount, poolAccount, vaultAccount, shareAccount, dammAccount] = accounts;

  const dbcConfig = decodeDbcConfig(configAccount);
  const pool = decodeDbcPool(poolAccount);
  const vaultView = decodeFeeVault(vaultAccount);
  if (!dbcConfig || !pool || !vaultView) return { kind: "mismatch", reason: "notFound" };
  if (dbcConfig.quoteMint !== config.assetMint) return { kind: "mismatch", reason: "quoteMismatch" };
  if (pool.config !== preset.dbcConfig || pool.baseMint !== preset.baseMint || vaultView.tokenMint !== config.assetMint) {
    return { kind: "mismatch", reason: "accountsMismatch" };
  }

  let treasuryShares = 0n;
  if (shareAccount?.exists) {
    try {
      const token = getTokenDecoder().decode(shareAccount.data);
      if (token.mint === shareMint && token.owner === preset.treasury) treasuryShares = token.amount;
    } catch {
      treasuryShares = 0n;
    }
  }

  let dammPrice: bigint | null = null;
  if (preset.dammPool) {
    const damm = decodeDammPool(dammAccount);
    if (damm && damm.tokenAMint === preset.baseMint && damm.tokenBMint === config.assetMint) dammPrice = priceFromSqrt(damm.sqrtPrice);
  }

  const vault = feeBreakdown(vaultView);
  return {
    kind: "ok",
    launch: {
      config: dbcConfig,
      pool,
      progress: curveProgress(pool, dbcConfig.migrationQuoteThreshold),
      vault,
      feesGoToVault: dbcConfig.feeClaimer === preset.feeVault,
      treasuryFees: vault.users.find((u) => u.address === preset.treasury) ?? null,
      treasuryShares,
      treasuryShareAccount,
      dammPrice,
      slot: context.slot,
    },
  };
}

/**
 * The preset's live state. The treasury's share account is derived from the credit pool's share
 * token PDA (the same address readPool checks against the pool account), so this read does not
 * wait for the pool read.
 */
export function useLaunchQuery(preset: PresetAddresses): UseQueryResult<LaunchReadResult> {
  const rpc = useRpc();
  const config = useAppConfig();
  return useQuery({
    queryKey: launchQueryKey(preset, config),
    queryFn: async ({ signal }) => {
      const { shareMint } = await derivePoolAccounts(config.poolAddress);
      return readLaunch(rpc, preset, config, shareMint, signal);
    },
    refetchInterval: (query) => (query.state.data?.kind === "mismatch" ? false : QUERY_REFETCH_MS),
  });
}
