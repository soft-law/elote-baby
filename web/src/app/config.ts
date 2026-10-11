// App configuration from VITE_* variables, validated once at start. A missing or malformed value
// never reaches the RPC: App.tsx shows the configuration screen instead. Pure: pass the env object
// so tests run without Vite.
import { findDeadSharesPda, findShareMintPda, findVaultPda } from "@elote/pool-client";
import { address, type Address } from "@solana/kit";
import type { ExplorerCluster } from "../pool/format";

export type AppConfig = {
  rpcUrl: string;
  poolAddress: Address;
  assetMint: Address;
  /** Base URL of the mcp/ server (test token faucet and agreements). No trailing slash. */
  apiUrl: string;
  explorerCluster: ExplorerCluster;
  /** Registers the keypair test wallet (Playwright only). */
  testWallet: boolean;
};

export type ConfigKey =
  | "VITE_RPC_URL"
  | "VITE_POOL_ADDRESS"
  | "VITE_ASSET_MINT"
  | "VITE_API_URL"
  | "VITE_EXPLORER_CLUSTER"
  | "VITE_TEST_WALLET";

export type ConfigProblem = { key: ConfigKey; reason: "missing" | "invalid" };

export type ConfigResult = { ok: true; config: AppConfig } | { ok: false; problems: ConfigProblem[] };

type Env = Partial<Record<string, string | boolean | undefined>>;

const CLUSTERS: readonly ExplorerCluster[] = ["devnet", "testnet", "mainnet-beta"];

function text(env: Env, key: ConfigKey): string {
  const value = env[key];
  return typeof value === "string" ? value.trim() : "";
}

function httpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return value.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function base58Address(value: string): Address | null {
  try {
    return address(value);
  } catch {
    return null;
  }
}

export function readAppConfig(env: Env): ConfigResult {
  const problems: ConfigProblem[] = [];

  const want = <T,>(key: ConfigKey, parse: (v: string) => T | null): T | null => {
    const raw = text(env, key);
    if (raw === "") {
      problems.push({ key, reason: "missing" });
      return null;
    }
    const parsed = parse(raw);
    if (parsed === null) problems.push({ key, reason: "invalid" });
    return parsed;
  };

  const rpcUrl = want("VITE_RPC_URL", httpUrl);
  const poolAddress = want("VITE_POOL_ADDRESS", base58Address);
  const assetMint = want("VITE_ASSET_MINT", base58Address);
  const apiUrl = want("VITE_API_URL", httpUrl);

  // Optional: devnet unless set.
  const clusterRaw = text(env, "VITE_EXPLORER_CLUSTER") || "devnet";
  const explorerCluster = CLUSTERS.find((c) => c === clusterRaw) ?? null;
  if (!explorerCluster) problems.push({ key: "VITE_EXPLORER_CLUSTER", reason: "invalid" });

  // Optional: off unless exactly "1".
  const testRaw = text(env, "VITE_TEST_WALLET");
  if (testRaw !== "" && testRaw !== "0" && testRaw !== "1") problems.push({ key: "VITE_TEST_WALLET", reason: "invalid" });

  if (problems.length > 0 || !rpcUrl || !poolAddress || !assetMint || !apiUrl || !explorerCluster) {
    return { ok: false, problems };
  }
  return {
    ok: true,
    config: { rpcUrl, poolAddress, assetMint, apiUrl, explorerCluster, testWallet: testRaw === "1" },
  };
}

export type PoolAccounts = { pool: Address; shareMint: Address; vault: Address; deadShares: Address };

/** The pool's program-derived accounts. The pool account itself also records them; T3 compares. */
export async function derivePoolAccounts(pool: Address): Promise<PoolAccounts> {
  const [[shareMint], [vault], [deadShares]] = await Promise.all([
    findShareMintPda({ pool }),
    findVaultPda({ pool }),
    findDeadSharesPda({ pool }),
  ]);
  return { pool, shareMint, vault, deadShares };
}

/** After the first pool read: the pool must hold the configured test token, or the config is wrong. */
export function poolMatchesConfig(pool: { assetMint: Address }, config: Pick<AppConfig, "assetMint">): boolean {
  return pool.assetMint === config.assetMint;
}
