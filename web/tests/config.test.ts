import { describe, expect, test } from "bun:test";
import { address } from "@solana/kit";
import { derivePoolAccounts, poolMatchesConfig, readAppConfig } from "../src/app/config";

const POOL = address("BGdJQxxJoHiLH2VS6HAGHe5kQuKKq9dwrPeX7DEEwYyM");
const ASSET = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

const good = {
  VITE_RPC_URL: "https://api.devnet.solana.com",
  VITE_POOL_ADDRESS: POOL,
  VITE_ASSET_MINT: ASSET,
  VITE_API_URL: "http://localhost:3010/",
};

describe("app config", () => {
  test("valid env gives a config with defaults", () => {
    expect(readAppConfig(good)).toEqual({
      ok: true,
      config: {
        rpcUrl: "https://api.devnet.solana.com",
        poolAddress: POOL,
        assetMint: ASSET,
        apiUrl: "http://localhost:3010",
        explorerCluster: "devnet",
        testWallet: false,
      },
    });
  });

  test("test wallet only with exactly 1", () => {
    const on = readAppConfig({ ...good, VITE_TEST_WALLET: "1" });
    expect(on.ok && on.config.testWallet).toBe(true);
    const off = readAppConfig({ ...good, VITE_TEST_WALLET: "0" });
    expect(off.ok && off.config.testWallet).toBe(false);
  });

  test("empty env lists every required variable as missing", () => {
    const r = readAppConfig({});
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.problems).toEqual([
        { key: "VITE_RPC_URL", reason: "missing" },
        { key: "VITE_POOL_ADDRESS", reason: "missing" },
        { key: "VITE_ASSET_MINT", reason: "missing" },
        { key: "VITE_API_URL", reason: "missing" },
      ]);
  });

  test("malformed values are invalid", () => {
    const r = readAppConfig({
      VITE_RPC_URL: "ftp://x",
      VITE_POOL_ADDRESS: "not-an-address",
      VITE_ASSET_MINT: "0OIl",
      VITE_API_URL: "localhost",
      VITE_EXPLORER_CLUSTER: "localnet",
      VITE_TEST_WALLET: "yes",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problems.every((p) => p.reason === "invalid")).toBe(true);
      expect(r.problems).toHaveLength(6);
    }
  });

  test("pool accounts derive from the pool address", async () => {
    const r = readAppConfig(good);
    if (!r.ok) throw new Error("config");
    const a = await derivePoolAccounts(r.config.poolAddress);
    const b = await derivePoolAccounts(r.config.poolAddress);
    expect(a).toEqual(b);
    expect(new Set([a.pool, a.shareMint, a.vault, a.deadShares]).size).toBe(4);
  });

  test("the pool must hold the configured test token", () => {
    const r = readAppConfig(good);
    if (!r.ok) throw new Error("config");
    expect(poolMatchesConfig({ assetMint: r.config.assetMint }, r.config)).toBe(true);
    expect(poolMatchesConfig({ assetMint: r.config.poolAddress }, r.config)).toBe(false);
  });
});
