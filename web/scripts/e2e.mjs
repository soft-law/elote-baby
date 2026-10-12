// End-to-end run of the pool app against a local validator. Everything is local and throwaway:
//
//   a. solana-test-validator with the built program (target/deploy/elote_pool.so), fresh ledger
//   b. scripts/demo-pool.ts --cluster local: test token, pool, deposits, a drawn and repaid line;
//      then scripts/e2e-setup.ts gives a fresh e2e wallet SOL and test tokens and opens an approved
//      line for it, signed by the admin and the wallet
//   c. bun run build with VITE_* for the local pool and the keypair test wallet (VITE_TEST_WALLET=1)
//   d. vite preview on a port that is not in use (E2E_PORT or --port, default 4322, else the next one)
//   e. Playwright (chromium headless): connect, pool stats, test token note, deposit 100,
//      redeem 10 shares, history, draw and repay 50 on the wallet's line, line history, a 375 px
//      pass with screenshots, and no console or page errors
//   f. teardown, always (also on SIGINT and SIGTERM): browser, every child process group, the e2e
//      build in dist/, and the scratch dir after a passing run only (after a failure or an
//      interrupt, or with KEEP_E2E_ARTIFACTS=1, logs and screenshots stay; the ledger goes).
//      A second Ctrl-C exits at once; the exit hook still kills every child group
//
// The e2e wallet is generated here, kept in memory and passed to the build and the setup through
// the environment only. Run `node scripts/e2e.mjs` (or `bun run e2e`) from web/.
// Needs: solana-test-validator on PATH, the built program in target/deploy, the repo root's
// node_modules (npx tsx for the demo), and Playwright (web/ dependency or PLAYWRIGHT_FROM, as in
// scripts/smoke.mjs). Env: E2E_PORT, E2E_SHOTS_DIR, KEEP_E2E_ARTIFACTS, ELOTE_ADMIN_KEYPAIR (as the demo).
import { spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = resolve(WEB, "..");
const PROGRAM_ID = "BGdJQxxJoHiLH2VS6HAGHe5kQuKKq9dwrPeX7DEEwYyM";
const PROGRAM_SO = join(ROOT, "target", "deploy", "elote_pool.so");
const RPC = "http://127.0.0.1:8899";
// Unreachable on purpose: the agreements fetch must degrade without a server.
const API = "http://127.0.0.1:1";
const UNIT = 1_000_000n;
const DEPOSIT = 100n * UNIT;
const REDEEM = 10n * UNIT;
const REPAY = 50n * UNIT;
const LOCAL_EXPLORER = `cluster=custom&customUrl=${encodeURIComponent(RPC)}`;

const scratch = mkdtempSync(join(tmpdir(), "elote-e2e-"));
const shotsDir = process.env.E2E_SHOTS_DIR ? resolve(process.env.E2E_SHOTS_DIR) : join(scratch, "shots");
mkdirSync(shotsDir, { recursive: true });

// ---- logging and steps ------------------------------------------------------------------------

const started = Date.now();
const stamp = () => new Date().toISOString().slice(11, 23);
const log = (msg) => console.log(`[${stamp()} +${((Date.now() - started) / 1000).toFixed(1)}s] ${msg}`);

class StepError extends Error {
  constructor(step, cause) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.step = step;
  }
}

async function step(name, fn) {
  const t0 = Date.now();
  log(`START ${name}`);
  try {
    const value = await fn();
    log(`OK    ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    return value;
  } catch (error) {
    log(`FAIL  ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s): ${error instanceof Error ? error.message : error}`);
    throw new StepError(name, error);
  }
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A failure that no amount of waiting fixes: `until` rethrows it at once. */
class Fatal extends Error {}

function fatal(condition, message) {
  if (!condition) throw new Fatal(message);
}

async function until(what, fn, timeoutMs = 60_000, everyMs = 500) {
  const end = Date.now() + timeoutMs;
  let last;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      if (error instanceof Fatal) throw error;
      last = error;
    }
    await sleep(everyMs);
  }
  throw new Error(`timed out waiting for ${what}${last ? ` (${last.message ?? last})` : ""}`);
}

// ---- processes --------------------------------------------------------------------------------

// Every child runs in its own process group (detached), so a group kill reaches what it spawned
// (bun run build starts tsc and vite; bunx starts vite). Teardown and the exit hook stop them all.
const children = new Set();

function track(child) {
  child.exitCodeOrSignal = null;
  child.on("exit", (code, signal) => {
    child.exitCodeOrSignal = code ?? signal;
    children.delete(child);
  });
  children.add(child);
  return child;
}

/** Long-running child in its own process group, output to a log file in the scratch dir. */
function startProcess(name, cmd, args, opts) {
  const out = createWriteStream(join(scratch, `${name}.log`));
  const child = track(spawn(cmd, args, { ...opts, detached: true, stdio: ["ignore", "pipe", "pipe"] }));
  child.stdout.pipe(out);
  child.stderr.pipe(out);
  return child;
}

// Last resort when the process exits by any path: SIGKILL every group still alive, then remove the
// e2e build (it carries the throwaway key) in case teardown did not get that far, for example
// after a second Ctrl-C. Synchronous only: nothing async runs in an exit handler.
process.on("exit", () => {
  for (const child of children) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {}
  }
  try {
    // `built` is declared further down; an exit before that line throws here and is ignored.
    if (built) rmSync(join(WEB, "dist"), { recursive: true, force: true });
  } catch {}
});

function stopProcess(child) {
  if (child.exitCodeOrSignal !== null || child.pid === undefined) return Promise.resolve();
  return new Promise((done) => {
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {}
      done();
    }, 5_000);
    child.once("exit", () => {
      clearTimeout(timer);
      done();
    });
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      clearTimeout(timer);
      done();
    }
  });
}

/** Runs to completion; resolves with stdout, rejects with the tail of the output. */
function run(name, cmd, args, opts) {
  return new Promise((resolveRun, reject) => {
    const out = createWriteStream(join(scratch, `${name}.log`));
    const child = track(spawn(cmd, args, { ...opts, detached: true, stdio: ["ignore", "pipe", "pipe"] }));
    let stdout = "";
    let all = "";
    child.stdout.on("data", (d) => {
      stdout += d;
      all += d;
      out.write(d);
    });
    child.stderr.on("data", (d) => {
      all += d;
      out.write(d);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      out.end();
      if (code === 0) resolveRun(stdout);
      else reject(new Error(`${cmd} exited with ${code}; log ${join(scratch, `${name}.log`)}\n${all.slice(-2_000)}`));
    });
  });
}

function portAnswers(port, host) {
  return new Promise((done) => {
    const socket = connect({ port, host });
    socket.once("connect", () => {
      socket.destroy();
      done(true);
    });
    socket.once("error", () => done(false));
  });
}

async function portBusy(port) {
  return (await portAnswers(port, "127.0.0.1")) || (await portAnswers(port, "::1"));
}

async function choosePort() {
  const i = process.argv.indexOf("--port");
  const wanted = Number(i >= 0 ? process.argv[i + 1] : (process.env.E2E_PORT ?? 4322));
  check(Number.isInteger(wanted) && wanted > 0 && wanted < 65536, "the port must be a number");
  for (let port = wanted; port < wanted + 100; port++) {
    if (!(await portBusy(port))) return port;
    log(`      port ${port} is busy`);
  }
  throw new Error(`no port that is not in use from ${wanted}`);
}

// ---- RPC --------------------------------------------------------------------------------------

async function rpcCall(method, params = []) {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

/** Sum of the owner's token accounts for `mint`, in base units, at confirmed. */
async function tokenBalance(owner, mint) {
  const result = await rpcCall("getTokenAccountsByOwner", [owner, { mint }, { encoding: "jsonParsed", commitment: "confirmed" }]);
  return result.value.reduce((sum, a) => sum + BigInt(a.account.data.parsed.info.tokenAmount.amount), 0n);
}

// ---- keys -------------------------------------------------------------------------------------

/** A fresh ed25519 keypair as the 64 bytes Solana tools use (seed then public key). */
function freshKeypair() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const seed = Buffer.from(privateKey.export({ format: "jwk" }).d, "base64url");
  const pub = Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url");
  return JSON.stringify([...seed, ...pub]);
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58(bytes) {
  let n = BigInt(`0x${Buffer.from(bytes).toString("hex") || "0"}`);
  let out = "";
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = `1${out}`;
  }
  return out;
}

/** The address of a 64-byte keypair given as a JSON array. */
function addressOf(keypairJson) {
  return base58(Uint8Array.from(JSON.parse(keypairJson)).slice(32));
}

/**
 * A system account holding `sol` SOL from genesis (solana-test-validator --account). The local
 * faucet behind requestAirdrop fails on some macOS hosts (it dials 0.0.0.0:9900, which the OS
 * refuses with "Can't assign requested address"), so the run never depends on it.
 */
function genesisAccount(address, sol) {
  const file = join(scratch, `account-${address}.json`);
  const account = { lamports: sol * 1_000_000_000, data: ["", "base64"], owner: "11111111111111111111111111111111", executable: false, rentEpoch: 0, space: 0 };
  writeFileSync(file, JSON.stringify({ pubkey: address, account }));
  return ["--account", address, file];
}

// ---- Playwright -------------------------------------------------------------------------------

function loadPlaywright() {
  const local = createRequire(import.meta.url);
  try {
    return local("playwright");
  } catch {
    const from = process.env.PLAYWRIGHT_FROM;
    if (!from) throw new Error("playwright not found; set PLAYWRIGHT_FROM");
    return createRequire(join(from, "package.json"))("playwright");
  }
}

const problems = [];
const expected = [];

function watch(page) {
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const where = msg.location()?.url ?? "";
    // The faucet and agreements server (VITE_API_URL) is unreachable on purpose; the browser reports
    // each failed request to it as a console error. Those, and only those, are expected.
    if (where.startsWith(`${API}/`) && /^Failed to load resource: net::ERR_/.test(msg.text())) {
      expected.push(`${where}: ${msg.text()}`);
      return;
    }
    problems.push(`console: ${msg.text()} (${where})`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
}

async function connectWallet(page) {
  const header = page.locator("header");
  const trigger = header.getByRole("button", { name: "Connect wallet" });
  if (!(await trigger.isVisible().catch(() => false))) return;
  await trigger.click();
  await header.getByRole("button", { name: "Elote Test Wallet" }).click();
  await header.getByRole("button", { name: /\.\.\./ }).waitFor({ timeout: 15_000 });
}

async function go(page, label) {
  await page.locator("header nav").getByRole("link", { name: label, exact: true }).click();
  await page.waitForURL(new RegExp(`/app/${label.toLowerCase()}`));
  await page.locator("h1").waitFor();
}

/** Submits a transaction form or button and waits for the success toast; returns its explorer href. */
async function confirmToast(page, action, label) {
  const before = await page.locator('[data-testid="toast"][data-tone="success"]').count();
  await action();
  const toast = page.locator('[data-testid="toast"]').last();
  await until(
    `${label}: toast reaches Updated`,
    async () => {
      const tone = await toast.getAttribute("data-tone").catch(() => null);
      if (tone === "error") throw new Fatal(`${label} failed: ${(await toast.innerText()).replace(/\s+/g, " ")}`);
      return (await page.locator('[data-testid="toast"][data-tone="success"]').count()) > before;
    },
    90_000,
    250,
  );
  const done = page.locator('[data-testid="toast"][data-tone="success"]').last();
  const steps = await done.locator('[data-testid="toast-steps"] li').evaluateAll((lis) => lis.map((li) => [li.textContent, li.getAttribute("data-status")]));
  check(steps.length === 3 && steps.every(([, s]) => s === "done"), `${label}: toast steps ${JSON.stringify(steps)}`);
  check(steps[2][0] === "Updated", `${label}: last step reads ${steps[2][0]}`);
  const href = await done.locator('[data-testid="toast-explorer"]').getAttribute("href");
  check(href && href.includes("/tx/") && href.includes(LOCAL_EXPLORER), `${label}: explorer link ${href}`);
  await done.getByRole("button", { name: "Dismiss" }).click().catch(() => undefined);
  return href;
}

async function noOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, `${label}: ${overflow}px of horizontal overflow at 375 px`);
}

// ---- the run ----------------------------------------------------------------------------------

let validator = null;
let preview = null;
let browser = null;
let page = null;
let built = false;
let failure = null;
let interrupted = false;
const keep = process.env.KEEP_E2E_ARTIFACTS === "1";

let tearingDown = null;
/**
 * Stops the browser and every child group, then removes the e2e build (it carries the throwaway
 * key). The scratch dir goes only after a passing run: after a failed step or an interrupt (or
 * with KEEP_E2E_ARTIFACTS=1) its logs and screenshots stay, minus the ledger, and its path is
 * printed. Idempotent: the finally block and the signal handlers share one run.
 */
function teardown() {
  tearingDown ??= (async () => {
    log("START f. teardown");
    if (browser) await browser.close().catch(() => undefined);
    // Children first: a build still running would write dist/ again after it is removed.
    await Promise.all([...children].map(stopProcess));
    if (built) rmSync(join(WEB, "dist"), { recursive: true, force: true });
    // Decided after the awaits: an interrupt or a failure may arrive while teardown runs.
    const keepScratch = keep || failure !== null || interrupted;
    if (keepScratch) rmSync(join(scratch, "ledger"), { recursive: true, force: true });
    else rmSync(scratch, { recursive: true, force: true });
    const kept = keepScratch
      ? `; logs and screenshots kept in ${scratch} (ledger removed)`
      : "; scratch dir removed (KEEP_E2E_ARTIFACTS=1 keeps logs and screenshots)";
    log(`OK    f. teardown${built ? " (removed the e2e build from dist/)" : ""}${kept}`);
  })();
  return tearingDown;
}

// The first signal tears down; a second one (Ctrl-C again while teardown waits) exits at once.
// process.exit still runs the exit hook, which SIGKILLs every child group left.
let stopping = false;
for (const [signal, code] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
]) {
  process.on(signal, () => {
    if (stopping) {
      log(`${signal} again: exiting without waiting for teardown; logs in ${scratch}`);
      process.exit(code);
    }
    stopping = true;
    interrupted = true;
    log(`${signal}: stopping`);
    void teardown().finally(() => {
      log(`E2E INTERRUPTED; logs in ${scratch}`);
      process.exit(code);
    });
  });
}

// The demo's admin key (the demo creates it on a first run; created here the same way when missing,
// so its address can be funded at genesis) and the e2e wallet, which lives only in memory.
const adminKeyFile = process.env.ELOTE_ADMIN_KEYPAIR ?? join(ROOT, ".demo-keys", "admin.json");
if (!existsSync(adminKeyFile)) {
  check(!process.env.ELOTE_ADMIN_KEYPAIR, "ELOTE_ADMIN_KEYPAIR points to a missing file");
  mkdirSync(dirname(adminKeyFile), { recursive: true, mode: 0o700 });
  writeFileSync(adminKeyFile, freshKeypair(), { mode: 0o600 });
}
const adminAddress = addressOf(readFileSync(adminKeyFile, "utf8"));
const secret = freshKeypair();
const walletAddress = addressOf(secret);

try {
  await step("a. validator", async () => {
    check(existsSync(PROGRAM_SO), `missing ${PROGRAM_SO}; build the program first`);
    check(!(await portBusy(8899)), "port 8899 already answers: stop the other validator first");
    validator = startProcess(
      "validator",
      "solana-test-validator",
      ["--reset", "--quiet", "--ledger", join(scratch, "ledger"), "--bpf-program", PROGRAM_ID, PROGRAM_SO, ...genesisAccount(adminAddress, 100), ...genesisAccount(walletAddress, 10)],
      { cwd: scratch },
    );
    validator.on("error", (e) => log(`validator: ${e.message}`));
    await until("getHealth ok", async () => {
      fatal(validator.exitCodeOrSignal === null, `the validator exited (${validator.exitCodeOrSignal}); log ${join(scratch, "validator.log")}`);
      return (await rpcCall("getHealth")) === "ok";
    }, 90_000);
    const program = await rpcCall("getAccountInfo", [PROGRAM_ID, { encoding: "base64" }]);
    check(program.value?.executable, "the program is not loaded");
    log(`      ledger ${join(scratch, "ledger")}`);
  });

  const { pool, mint } = await step("b1. demo pool", async () => {
    const out = await run("demo", "npx", ["tsx", "scripts/demo-pool.ts", "--cluster", "local", "--sponsor", "--grace-seconds", "432000"], {
      cwd: ROOT,
      env: { ...process.env, ELOTE_RPC: RPC },
    });
    const mintMatch = out.match(/^\s*tMXN .* address ([1-9A-HJ-NP-Za-km-z]{32,44})\s*$/m);
    const poolMatch = out.match(/^\s*pool ([1-9A-HJ-NP-Za-km-z]{32,44})\s*$/m);
    check(mintMatch && poolMatch, "the demo printed no test token or pool address");
    log(`      pool ${poolMatch[1]}, test token ${mintMatch[1]}`);
    return { pool: poolMatch[1], mint: mintMatch[1] };
  });

  const setup = await step("b2. e2e wallet and its line", async () => {
    const out = await run("setup", "bun", ["scripts/e2e-setup.ts"], {
      cwd: WEB,
      env: {
        ...process.env,
        E2E_RPC: RPC,
        E2E_POOL: pool,
        E2E_MINT: mint,
        E2E_ADMIN_KEYPAIR: adminKeyFile,
        E2E_WALLET_SECRET: secret,
      },
    });
    const result = JSON.parse(out.trim().split("\n").pop());
    log(`      wallet ${result.wallet}, line #${result.lineId} approved for ${Number(BigInt(result.principal) / UNIT)} tMXN`);
    return result;
  });

  await step("c. build", async () => {
    built = true;
    await run("build", "bun", ["run", "build"], {
      cwd: WEB,
      env: {
        ...process.env,
        VITE_RPC_URL: RPC,
        VITE_POOL_ADDRESS: pool,
        VITE_ASSET_MINT: mint,
        VITE_API_URL: API,
        VITE_EXPLORER_CLUSTER: "localnet",
        VITE_TEST_WALLET: "1",
        VITE_TEST_WALLET_SECRET: secret,
      },
    });
  });

  const base = await step("d. preview", async () => {
    const port = await choosePort();
    preview = startProcess("preview", "bunx", ["vite", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: WEB });
    const url = `http://127.0.0.1:${port}`;
    await until("the preview answers", async () => {
      fatal(preview.exitCodeOrSignal === null, `the preview exited; log ${join(scratch, "preview.log")}`);
      return (await fetch(`${url}/app`, { signal: AbortSignal.timeout(2_000) })).ok;
    }, 30_000);
    log(`      ${url}/app`);
    return url;
  });

  await step("e0. browser", async () => {
    const { chromium } = loadPlaywright();
    browser = await chromium.launch({ headless: true });
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await context.newPage();
  watch(page);

  await step("e1. connect the test wallet", async () => {
    await page.goto(`${base}/app/pool`, { waitUntil: "domcontentloaded" });
    await connectWallet(page);
    const label = await page.locator("header").getByRole("button", { name: /\.\.\./ }).innerText();
    check(label.startsWith(setup.wallet.slice(0, 4)), `header shows ${label}`);
  });

  await step("e2. pool stats", async () => {
    await page.locator('[data-testid="pool-stats"]').waitFor({ timeout: 30_000 });
    const cards = await page.locator('[data-testid="pool-stats"] > li').count();
    check(cards >= 6, `only ${cards} stat cards`);
    const text = await page.locator('[data-testid="pool-stats"]').innerText();
    check(!/NaN|undefined/.test(text), "a stat reads NaN or undefined");
    const lines = page.locator('[data-testid="lines"]');
    await lines.waitFor({ timeout: 30_000 });
    check((await lines.innerText()).includes(`#${setup.lineId}`), `line #${setup.lineId} is not listed`);
  });

  await step("e3. invest: the test token note, no faucet button", async () => {
    await go(page, "Invest");
    await page.locator('[data-testid="invest-summary"]').waitFor({ timeout: 30_000 });
    const note = page.locator('[data-testid="test-token-note"]');
    await note.waitFor({ timeout: 30_000 });
    check((await page.locator('[data-testid="faucet-button"]').count()) === 0, "the faucet button is still on the page");
    log(`      note: "${(await note.innerText()).trim()}"`);
  });

  await step("e4. invest: deposit 100 tMXN", async () => {
    const before = await tokenBalance(setup.wallet, setup.shareMint);
    const form = page.locator('[data-testid="deposit-form"]');
    await form.locator("input").fill("100");
    await form.locator('[data-testid="deposit-quote"]').waitFor();
    const min = BigInt(await form.locator('[data-testid="deposit-quote"]').getAttribute("data-min"));
    await confirmToast(page, () => form.locator('[data-testid="deposit-submit"]').click(), "deposit");
    const after = await until("shares on chain", async () => {
      const now = await tokenBalance(setup.wallet, setup.shareMint);
      return now > before ? now : null;
    });
    check(after - before >= min, `received ${after - before} shares, floor was ${min}`);
    log(`      shares ${before} -> ${after} (floor ${min})`);
  });

  await step("e5. invest: redeem 10 shares", async () => {
    const shares = await tokenBalance(setup.wallet, setup.shareMint);
    const assets = await tokenBalance(setup.wallet, mint);
    const form = page.locator('[data-testid="redeem-form"]');
    // The form may still hold the pre-deposit share count for a moment.
    await until("the redeem form knows the shares", async () => {
      await form.locator("input").fill("10");
      return form.locator('[data-testid="redeem-quote"]').isVisible();
    }, 20_000);
    const min = BigInt(await form.locator('[data-testid="redeem-quote"]').getAttribute("data-min"));
    await confirmToast(page, () => form.locator('[data-testid="redeem-submit"]').click(), "redeem");
    const after = await until("shares burned on chain", async () => {
      const now = await tokenBalance(setup.wallet, setup.shareMint);
      return now < shares ? now : null;
    });
    check(shares - after === REDEEM, `burned ${shares - after} shares, expected ${REDEEM}`);
    const assetsAfter = await tokenBalance(setup.wallet, mint);
    check(assetsAfter - assets >= min, `received ${assetsAfter - assets}, floor was ${min}`);
    log(`      shares ${shares} -> ${after}; test tokens +${assetsAfter - assets} (floor ${min})`);
  });

  await step("e6. invest: history shows the deposit and the redemption", async () => {
    const rows = page.locator('[data-testid="invest-history"] li[data-signature]');
    const kinds = await until(
      "two history rows",
      async () => {
        const k = await rows.evaluateAll((lis) => lis.map((li) => li.getAttribute("data-row")));
        return k.includes("Deposited") && k.includes("Redeemed") ? k : null;
      },
      60_000,
      1_000,
    );
    const href = await rows.first().locator("a").getAttribute("href");
    check(href.includes(LOCAL_EXPLORER), `history link ${href}`);
    log(`      rows: ${kinds.join(", ")}`);
  });

  await step("e7. borrow: draw the approved line", async () => {
    await go(page, "Borrow");
    const card = page.locator(`article[data-line="${setup.lineId}"]`);
    await card.waitFor({ timeout: 30_000 });
    check((await card.getAttribute("data-status")) === "approved", `line #${setup.lineId} is ${await card.getAttribute("data-status")}`);
    const assets = await tokenBalance(setup.wallet, mint);
    await confirmToast(page, () => card.locator('[data-testid="draw-submit"]').click(), "draw");
    await until("the line turns active", async () => (await card.getAttribute("data-status")) === "active", 60_000);
    const drawn = (await tokenBalance(setup.wallet, mint)) - assets;
    check(drawn === BigInt(setup.principal), `drew ${drawn}, expected ${setup.principal}`);
    log(`      drew ${drawn / UNIT} tMXN`);
  });

  await step("e8. borrow: repay 50 tMXN", async () => {
    const card = page.locator(`article[data-line="${setup.lineId}"]`);
    const form = card.locator('[data-testid="repay-form"]');
    await form.waitFor({ timeout: 30_000 });
    const assets = await tokenBalance(setup.wallet, mint);
    await until("the repay form knows the balance", async () => {
      await form.locator("input").fill("50");
      return form.locator('[data-testid="repay-quote"]').isVisible();
    }, 20_000);
    await confirmToast(page, () => form.locator('[data-testid="repay-submit"]').click(), "repay");
    const paid = await until("the repayment on chain", async () => {
      const d = assets - (await tokenBalance(setup.wallet, mint));
      return d > 0n ? d : null;
    });
    check(paid === REPAY, `paid ${paid}, expected ${REPAY}`);
    check((await card.getAttribute("data-status")) === "active", "a partial repayment closed the line");
  });

  await step("e9. borrow: line history", async () => {
    const card = page.locator(`article[data-line="${setup.lineId}"]`);
    await card.locator('[data-testid="line-history-toggle"]').click();
    const rows = card.locator('[data-testid="line-history"] li[data-signature]');
    const kinds = await until(
      "the draw and the repayment in the line history",
      async () => {
        const k = await rows.evaluateAll((lis) => lis.map((li) => li.getAttribute("data-row")));
        return k.some((r) => r.includes("LineDrawn")) && k.some((r) => r.includes("LineRepaid")) ? k : null;
      },
      60_000,
      1_000,
    );
    log(`      rows: ${kinds.join(", ")}`);
  });

  await step("e10. 375 px pass", async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    for (const label of ["Pool", "Invest", "Borrow"]) {
      await go(page, label);
      const ready = { Pool: '[data-testid="pool-stats"]', Invest: '[data-testid="invest-summary"]', Borrow: `article[data-line="${setup.lineId}"]` }[label];
      await page.locator(ready).waitFor({ timeout: 30_000 });
      await page.waitForTimeout(500);
      await noOverflow(page, label);
      const file = join(shotsDir, `${label.toLowerCase()}-375.png`);
      await page.screenshot({ path: file, fullPage: true });
      log(`      ${file}`);
    }
  });

  await step("e11. no console or page errors", async () => {
    for (const e of expected) log(`      expected (unreachable API): ${e}`);
    check(problems.length === 0, `${problems.length} error(s):\n  ${problems.join("\n  ")}`);
  });
} catch (error) {
  failure = error;
  if (page) {
    const file = join(shotsDir, "failure.png");
    await page.screenshot({ path: file, fullPage: true }).catch(() => undefined);
    const toasts = await page.locator('[data-testid="toast-region"]').innerText({ timeout: 2_000 }).catch(() => "");
    log(`      at failure: ${file}; toasts: ${toasts.replace(/\s+/g, " ").trim() || "none"}`);
    for (const p of problems) log(`      ${p}`);
  }
} finally {
  await teardown();
}

// Interrupted: the signal handler reports and exits with 130 or 143 once teardown settles.
if (interrupted) await new Promise(() => undefined);
if (failure) {
  console.error(`E2E FAIL at ${failure.step ?? "setup"}: ${failure.message}`);
  console.error(`      logs and screenshots kept in ${scratch}`);
  process.exit(1);
}
const shotsKept = keep || Boolean(process.env.E2E_SHOTS_DIR);
console.log(`E2E PASS in ${((Date.now() - started) / 1000).toFixed(1)}s; ${shotsKept ? `screenshots in ${shotsDir}` : "screenshots removed with the scratch dir (KEEP_E2E_ARTIFACTS=1 keeps them)"}`);
process.exit(0);
