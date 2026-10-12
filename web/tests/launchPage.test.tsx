import "./support/dom";
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { ELOTE_POOL_PROGRAM_ADDRESS, getPoolEncoder } from "@elote/pool-client";
import { AccountState, TOKEN_PROGRAM_ADDRESS, getMintEncoder, getTokenEncoder } from "@solana-program/token";
import { generateKeyPairSigner, getAddressEncoder, getBase64Decoder, none, some, type Address } from "@solana/kit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { derivePoolAccounts, type AppConfig } from "../src/app/config";
import { ConfigContext } from "../src/app/configContext";
import type { PresetAddresses } from "../src/app/meteora/addresses";
import { OFFSETS, decodeDammPool, priceFromSqrt } from "../src/app/meteora/decode";
import { readLaunch } from "../src/app/meteora/launch";
import { LaunchPage } from "../src/app/pages/Launch";
import { ataOf } from "../src/tx/ops";
import { createRpc } from "../src/tx/rpc";
import { RpcProvider } from "../src/tx/RpcProvider";
import { formatAmount } from "../src/pool/format";
import { translations } from "../src/translations";
import { loadFixture, rawAccount, type DammFixture, type DbcFixture, type FeeVaultFixture, type FixtureAccount } from "./support/meteora";
import { RPC_URL, startRpc, testPool } from "./support/rpc";

const UNIT = 1_000_000n;
const WSOL = "So11111111111111111111111111111111111111112" as Address;
const TREASURY = "HkKU4o6ms8m95iuXWh8DcR1cEcnRHW4XQZGHFyqGdGEG" as Address; // the 90% user of the fixture vault
const TREASURY_SHARES = 2_500n * UNIT;

const migrated = loadFixture<DbcFixture>("dbc-migrated.json");
const partial = loadFixture<DbcFixture>("dbc-partial.json");
const vaultFx = loadFixture<FeeVaultFixture>("fee-vault.json");
const damm = loadFixture<DammFixture>("damm-pool.json");

const rpcServer = startRpc();
afterAll(() => rpcServer.close());
beforeEach(() => rpcServer.reset());

const b64 = (bytes: Uint8Array) => getBase64Decoder().decode(bytes);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type RpcAccount = { data: [string, string]; executable: boolean; lamports: number; owner: string; rentEpoch: number; space: number };

function rpcAccount(bytes: Uint8Array, owner: Address): RpcAccount {
  return { data: [b64(bytes), "base64"], executable: false, lamports: 1_000_000, owner, rentEpoch: 0, space: bytes.length };
}
function fromFixture(a: FixtureAccount, patch?: (bytes: Uint8Array) => void): RpcAccount {
  const raw = rawAccount(a, patch);
  if (!raw.exists) throw new Error("unreachable");
  return rpcAccount(new Uint8Array(raw.data), a.owner as Address);
}

type Setup = { config: AppConfig; preset: PresetAddresses; chain: Map<string, RpcAccount>; treasuryAta: Address };

/**
 * The fixtures are a wSOL-quoted devnet launch, so the app's test token is set to wSOL here. The
 * credit pool is synthetic (value per share 1.066), as in the pool page tests.
 */
async function setup(opts: { set?: "migrated" | "partial"; assetMint?: Address; feesToVault?: boolean } = {}): Promise<Setup> {
  const fx = opts.set === "partial" ? partial : migrated;
  const { config: base, accounts } = await testPool();
  const config: AppConfig = {
    rpcUrl: RPC_URL,
    poolAddress: base.poolAddress,
    assetMint: opts.assetMint ?? WSOL,
    apiUrl: "http://api.test",
    explorerCluster: "devnet",
    testWallet: false,
  };
  const preset: PresetAddresses = {
    dbcConfig: fx.config.address as Address,
    dbcPool: fx.pool.address as Address,
    baseMint: fx.expected.baseMint as Address,
    feeVault: vaultFx.account.address as Address,
    treasury: TREASURY,
    dammPool: opts.set === "partial" ? null : (damm.account.address as Address),
  };
  const chain = new Map<string, RpcAccount>();
  const feeClaimerToVault = (bytes: Uint8Array) => bytes.set(getAddressEncoder().encode(preset.feeVault), OFFSETS.poolConfig.feeClaimer);
  chain.set(fx.config.address, fromFixture(fx.config, opts.feesToVault ? feeClaimerToVault : undefined));
  chain.set(fx.pool.address, fromFixture(fx.pool));
  // The other curve pool, to check that a pool of another config is refused.
  const other = fx === partial ? migrated : partial;
  chain.set(other.pool.address, fromFixture(other.pool));
  chain.set(vaultFx.account.address, fromFixture(vaultFx.account));
  chain.set(damm.account.address, fromFixture(damm.account));

  // The elote credit pool: 10,000 on hand, 6,000 lent out, 15,000 shares.
  const admin = (await generateKeyPairSigner()).address;
  const pool = getPoolEncoder().encode({
    version: 1,
    admin,
    assetMint: config.assetMint,
    vault: accounts.vault,
    shareMint: accounts.shareMint,
    deadShares: accounts.deadShares,
    outstandingPrincipal: 6_000n * UNIT,
    interestCollected: 0n,
    writtenOff: 0n,
    lineCount: 0n,
    paused: false,
    reserved: new Uint8Array(32),
    bump: 255,
  });
  chain.set(accounts.pool, rpcAccount(new Uint8Array(pool), ELOTE_POOL_PROGRAM_ADDRESS));
  const token = (mint: Address, owner: Address, amount: bigint) =>
    new Uint8Array(
      getTokenEncoder().encode({
        mint,
        owner,
        amount,
        delegate: none(),
        state: AccountState.Initialized,
        isNative: none(),
        delegatedAmount: 0n,
        closeAuthority: none(),
      }),
    );
  chain.set(accounts.vault, rpcAccount(token(config.assetMint, accounts.pool, 10_000n * UNIT), TOKEN_PROGRAM_ADDRESS));
  const mint = getMintEncoder().encode({ mintAuthority: some(accounts.pool), supply: 15_000n * UNIT, decimals: 6, isInitialized: true, freezeAuthority: none() });
  chain.set(accounts.shareMint, rpcAccount(new Uint8Array(mint), TOKEN_PROGRAM_ADDRESS));
  const treasuryAta = await ataOf(TREASURY, accounts.shareMint);
  chain.set(treasuryAta, rpcAccount(token(accounts.shareMint, TREASURY, TREASURY_SHARES), TOKEN_PROGRAM_ADDRESS));
  return { config, preset, chain, treasuryAta };
}

function serve(s: Setup) {
  rpcServer.use({
    getMultipleAccounts: (params) => {
      expect((params[1] as { encoding: string }).encoding).toBe("base64");
      return { context: { slot: 77 }, value: (params[0] as string[]).map((a) => s.chain.get(a) ?? null) };
    },
  });
}

async function mount(config: AppConfig, preset: PresetAddresses | null | undefined, lang: "en" | "es" = "en") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchInterval: false } } });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <ConfigContext.Provider value={config}>
        <QueryClientProvider client={client}>
          <RpcProvider url={RPC_URL}>
            <MemoryRouter initialEntries={[lang === "es" ? "/launch?lang=es" : "/launch"]}>
              {preset === undefined ? <LaunchPage /> : <LaunchPage preset={preset} />}
            </MemoryRouter>
          </RpcProvider>
        </QueryClientProvider>
      </ConfigContext.Provider>,
    );
  });
  return {
    host,
    q: (testId: string) => host.querySelector(`[data-testid="${testId}"]`),
    text: () => host.textContent ?? "",
    async until(check: () => boolean, label: string) {
      for (let i = 0; i < 200; i++) {
        if (check()) return;
        await act(async () => sleep(5));
      }
      throw new Error(`timed out waiting for ${label}: ${host.textContent}`);
    },
    unmount: async () => {
      await act(async () => root.unmount());
      host.remove();
      client.clear();
    },
  };
}

const en = translations.en.app.launch;

/** Text a sighted reader sees: without the screen reader only spans. */
function visible(el: Element): string {
  const copy = el.cloneNode(true) as Element;
  for (const sr of copy.querySelectorAll(".sr-only")) sr.remove();
  return copy.textContent ?? "";
}

describe("readLaunch", () => {
  test("one request: config, pool, vault, treasury share account, DAMM v2 pool", async () => {
    const s = await setup();
    serve(s);
    const { shareMint } = await derivePoolAccounts(s.config.poolAddress);
    const result = await readLaunch(createRpc(RPC_URL), s.preset, s.config, shareMint);
    expect(rpcServer.calls.length).toBe(1);
    expect(rpcServer.calls[0]!.params[0]).toEqual([s.preset.dbcConfig, s.preset.dbcPool, s.preset.feeVault, s.treasuryAta, s.preset.dammPool]);
    if (result.kind !== "ok") throw new Error(`expected ok, got ${result.reason}`);
    const l = result.launch;
    expect(l.progress).toEqual({ stage: "graduated", bps: 10_000 });
    expect(l.pool.quoteReserve).toBe(85_140_000_000n);
    expect(l.config.migrationQuoteThreshold).toBe(85_000_000_000n);
    expect(l.vault.totalFundedFee).toBe(12_819_353n);
    expect(l.treasuryFees?.feeUnclaimed).toBe(0n);
    expect(l.treasuryShares).toBe(TREASURY_SHARES);
    expect(l.feesGoToVault).toBe(false);
    expect(l.dammPrice).toBe(priceFromSqrt(BigInt(damm.expected.sqrtPrice)));
    expect(l.slot).toBe(77n);
  });

  test("no DAMM v2 pool before graduation: four addresses, no price", async () => {
    const s = await setup({ set: "partial" });
    serve(s);
    const result = await readLaunch(createRpc(RPC_URL), s.preset, s.config, (await derivePoolAccounts(s.config.poolAddress)).shareMint);
    expect((rpcServer.calls[0]!.params[0] as string[]).length).toBe(4);
    if (result.kind !== "ok") throw new Error(`expected ok, got ${result.reason}`);
    expect(result.launch.progress.stage).toBe("thresholdReached");
    expect(result.launch.dammPrice).toBeNull();
  });

  test("a treasury with no share account yet holds 0 shares", async () => {
    const s = await setup();
    s.chain.delete(s.treasuryAta);
    serve(s);
    const result = await readLaunch(createRpc(RPC_URL), s.preset, s.config, (await derivePoolAccounts(s.config.poolAddress)).shareMint);
    if (result.kind !== "ok") throw new Error(`expected ok, got ${result.reason}`);
    expect(result.launch.treasuryShares).toBe(0n);
  });

  test("mismatches: another quote token, a missing account, a pool of another config", async () => {
    const other = (await generateKeyPairSigner()).address;
    const s = await setup();
    serve(s);
    const shareMint = (await derivePoolAccounts(s.config.poolAddress)).shareMint;
    const rpc = createRpc(RPC_URL);
    expect(await readLaunch(rpc, s.preset, { assetMint: other }, shareMint)).toEqual({ kind: "mismatch", reason: "quoteMismatch" });
    expect(await readLaunch(rpc, { ...s.preset, feeVault: other }, s.config, shareMint)).toEqual({ kind: "mismatch", reason: "notFound" });
    expect(await readLaunch(rpc, { ...s.preset, dbcPool: partial.pool.address as Address }, s.config, shareMint)).toEqual({
      kind: "mismatch",
      reason: "accountsMismatch",
    });
    // The DAMM v2 fixture pairs the migrated base token with wSOL, as the page expects.
    const d = decodeDammPool(rawAccount(damm.account))!;
    expect([d.tokenAMint, d.tokenBMint]).toEqual([s.preset.baseMint, WSOL]);
  });
});

describe("launch page", () => {
  test("not launched: the note and the empty state, and no RPC call at all", async () => {
    const s = await setup();
    const page = await mount(s.config, null);
    await act(async () => sleep(30));
    expect(page.q("launch-note")!.textContent).toBe(en.note);
    expect(page.q("launch-not-launched")!.textContent).toContain(en.notLaunched.title);
    expect(page.q("launch-flow")).toBeNull();
    expect(rpcServer.calls.length).toBe(0);
    // The program accounts still link to the explorer.
    const hrefs = [...page.host.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("https://explorer.solana.com/address/dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN?cluster=devnet");
    await page.unmount();
  });

  test("graduated preset: the four steps with live figures and every account linked", async () => {
    const s = await setup();
    serve(s);
    const page = await mount(s.config, s.preset);
    expect(page.q("launch-loading")).not.toBeNull();
    await page.until(() => page.q("launch-flow") !== null && page.text().includes("1.066"), "flow with pool figures");
    const flow = page.q("launch-flow")!.textContent ?? "";

    expect(page.q("launch-stage")!.getAttribute("data-stage")).toBe("graduated");
    expect(page.q("launch-stage")!.textContent).toBe(en.stage.graduated);
    const bar = page.q("launch-progress")!;
    expect(bar.getAttribute("role")).toBe("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("100");
    expect(bar.getAttribute("aria-label")).toBe(en.progressLabel);
    expect(page.q("launch-raised")!.textContent).toBe("85,140 of 85,000 tMXN");
    expect(flow).toContain("688"); // partner fees waiting
    // Vault: received 12.81, claimed 12.33, treasury (90%) can claim 0.
    expect(flow).toContain(en.vault.received);
    expect(flow).toContain("12.81");
    expect(flow).toContain("12.33");
    expect(page.q("launch-treasury-claimable")!.textContent).toBe("0 tMXN");
    expect(flow).toContain("90%");
    // The fixture curve's fee claimer is another address: the page says so.
    expect(page.q("launch-vault-check")!.getAttribute("data-ok")).toBe("false");
    expect(flow).toContain(en.vault.feesElsewhere);
    // DAMM v2 price from the sqrt price.
    expect(flow).toContain(en.graduation.price);
    expect(flow).toContain(`${formatAmount(priceFromSqrt(BigInt(damm.expected.sqrtPrice)), "en", 6)}tMXN / tELOTE`);
    // Credit pool: 2,500 shares at 1.066 per share.
    expect(page.q("launch-treasury-shares")!.textContent).toBe("2,500");
    expect(flow).toContain("about 2,666.66 tMXN");
    expect(flow).toContain("1.066");

    const hrefs = [...page.host.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    for (const a of [s.preset.dbcPool, s.preset.dbcConfig, s.preset.baseMint, s.preset.feeVault, s.preset.treasury, s.preset.dammPool!, s.treasuryAta, WSOL]) {
      expect(hrefs).toContain(`https://explorer.solana.com/address/${a}?cluster=devnet`);
    }
    expect(hrefs.some((h) => h?.includes("meteora.ag"))).toBe(false);
    // One request for the preset and one for the credit pool.
    expect(rpcServer.count("getMultipleAccounts")).toBe(2);
    expect(rpcServer.calls.length).toBe(2);
    await page.unmount();
  });

  test("a curve whose fees go to the preset vault shows the check as met", async () => {
    const s = await setup({ feesToVault: true });
    serve(s);
    const page = await mount(s.config, s.preset);
    await page.until(() => page.q("launch-vault-check") !== null, "vault check");
    expect(page.q("launch-vault-check")!.getAttribute("data-ok")).toBe("true");
    expect(page.q("launch-vault-check")!.textContent).toBe(en.vault.feesGoToVault);
    await page.unmount();
  });

  test("before graduation: threshold reached, price shown later, no DAMM v2 account", async () => {
    const s = await setup({ set: "partial" });
    serve(s);
    const page = await mount(s.config, s.preset);
    await page.until(() => page.q("launch-flow") !== null, "flow");
    expect(page.q("launch-stage")!.getAttribute("data-stage")).toBe("thresholdReached");
    // The reserve is 1,077.000001: two decimals on screen, the full amount for screen readers.
    expect(visible(page.q("launch-raised")!)).toBe("1,077 of 1,077 tMXN");
    expect(page.q("launch-raised")!.querySelector(".sr-only")!.textContent).toBe("1,077.000001");
    expect(page.text()).toContain(en.graduation.priceLater);
    expect(page.q("launch-accounts")!.textContent).toContain(en.addresses.dammPending);
    await page.unmount();
  });

  test("a curve priced in another token is a configuration error, not figures", async () => {
    const other = (await generateKeyPairSigner()).address;
    const s = await setup({ assetMint: other });
    serve(s);
    const page = await mount(s.config, s.preset);
    await page.until(() => page.q("launch-mismatch") !== null, "mismatch");
    expect(page.q("launch-mismatch")!.getAttribute("data-reason")).toBe("quoteMismatch");
    expect(page.q("launch-mismatch")!.textContent).toContain(en.mismatch.quoteMismatch);
    expect(page.q("launch-flow")).toBeNull();
    await page.unmount();
  });

  test("a failed read offers Try again, never an empty page", async () => {
    const s = await setup();
    rpcServer.use({
      getMultipleAccounts: () => {
        throw new Response("down", { status: 503 });
      },
    });
    const page = await mount(s.config, s.preset);
    await page.until(() => page.text().includes(en.loadFailed), "load failed");
    expect([...page.host.querySelectorAll("button")].some((b) => b.textContent === en.retry)).toBe(true);
    await page.unmount();
  });

  test("Spanish copy", async () => {
    const s = await setup();
    serve(s);
    const page = await mount(s.config, s.preset, "es");
    await page.until(() => page.q("launch-flow") !== null, "flow");
    const es = translations.es.app.launch;
    expect(page.q("launch-note")!.textContent).toBe(es.note);
    expect(page.q("launch-stage")!.textContent).toBe(es.stage.graduated);
    expect(page.q("launch-raised")!.textContent).toBe("85,140 de 85,000 tMXN");
    await page.unmount();
  });
});
