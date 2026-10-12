// Display formatting for the app: amounts, value per share, rates, dates, addresses and explorer
// links. Pure functions, no window access, so they are safe in tests and in any render.
import type { Lang } from "../translations";
import { DECIMALS, UNIT } from "./math";

/** Symbol of the pool's test token. */
export const ASSET_SYMBOL = "tMXN";

const LOCALE: Record<Lang, string> = { en: "en-US", es: "es-MX" };

function groupWhole(whole: bigint, lang: Lang): string {
  // Intl groups bigint exactly; both locales use "," for thousands and "." for decimals.
  return new Intl.NumberFormat(LOCALE[lang], { useGrouping: true }).format(whole);
}

/**
 * Base units as a grouped amount. Keeps up to `maxDecimals` decimals (rounded down, so a balance
 * is never shown larger than it is) and drops trailing zeros: 4192000000n gives "4,192".
 */
export function formatAmount(units: bigint, lang: Lang = "en", maxDecimals: number = 2): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const keep = Math.max(0, Math.min(DECIMALS, maxDecimals));
  const whole = abs / UNIT;
  const frac = (abs % UNIT).toString().padStart(DECIMALS, "0").slice(0, keep).replace(/0+$/, "");
  return `${negative ? "-" : ""}${groupWhole(whole, lang)}${frac ? `.${frac}` : ""}`;
}

/** Value per share (UNIT means 1) with exactly three decimals, rounded down: 1048000n gives "1.048". */
export function formatPerShare(value: bigint, lang: Lang = "en"): string {
  const whole = value / UNIT;
  const milli = ((value % UNIT) / 1_000n).toString().padStart(3, "0");
  return `${groupWhole(whole, lang)}.${milli}`;
}

/** Basis points as a percentage: 1200 gives "12%", 1250 gives "12.5%". */
export function formatBps(bps: number, lang: Lang = "en"): string {
  return `${new Intl.NumberFormat(LOCALE[lang], { maximumFractionDigits: 2 }).format(bps / 100)}%`;
}

/** Unix seconds as a calendar date in UTC, so every reader sees the same day. */
export function formatDate(unixSeconds: number | null, lang: Lang = "en"): string {
  if (unixSeconds === null) return "";
  return new Intl.DateTimeFormat(LOCALE[lang], { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(unixSeconds * 1000),
  );
}

/** When a read happened, as a date and a time of day in the reader's time zone. */
export function formatReadTime(unixSeconds: number, lang: Lang = "en"): string {
  return new Intl.DateTimeFormat(LOCALE[lang], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(unixSeconds * 1000));
}

/**
 * A span of seconds in the largest whole unit that divides it: 2592000 gives "30 days", 7200
 * gives "2 hours". Plural forms and words come from Intl, so they follow the language.
 */
export function formatDuration(seconds: bigint | number, lang: Lang = "en"): string {
  const s = BigInt(seconds);
  const units: Array<[bigint, "day" | "hour" | "minute" | "second"]> = [
    [86_400n, "day"],
    [3_600n, "hour"],
    [60n, "minute"],
  ];
  const [size, unit] = units.find(([size]) => s >= size && s % size === 0n) ?? [1n, "second"];
  return new Intl.NumberFormat(LOCALE[lang], { style: "unit", unit, unitDisplay: "long" }).format(Number(s / size));
}

/** First and last characters of an address or signature: "BGdJ...wYyM". */
export function truncateMiddle(value: string, head: number = 4, tail: number = 4): string {
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

/** "localnet" is a local validator (end-to-end runs); its links name the RPC URL as a custom cluster. */
export type ExplorerCluster = "devnet" | "testnet" | "mainnet-beta" | "localnet";

/** solana-test-validator's default RPC, for localnet links when no RPC URL is given. */
export const LOCALNET_RPC_URL = "http://127.0.0.1:8899";

function explorerQuery(cluster: ExplorerCluster, rpcUrl: string = LOCALNET_RPC_URL): string {
  if (cluster === "mainnet-beta") return "";
  if (cluster === "localnet") return `?cluster=custom&customUrl=${encodeURIComponent(rpcUrl)}`;
  return `?cluster=${cluster}`;
}

/** `rpcUrl` only matters for localnet: the explorer reads that validator. */
export function explorerTxUrl(signature: string, cluster: ExplorerCluster, rpcUrl?: string): string {
  return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}${explorerQuery(cluster, rpcUrl)}`;
}

export function explorerAddressUrl(address: string, cluster: ExplorerCluster, rpcUrl?: string): string {
  return `https://explorer.solana.com/address/${encodeURIComponent(address)}${explorerQuery(cluster, rpcUrl)}`;
}
