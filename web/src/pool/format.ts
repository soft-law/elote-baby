// Display formatting for the app: amounts, value per share, rates, dates, addresses and explorer
// links. Pure functions, no window access, so they are safe in tests and in any render.
import type { Lang } from "../translations";
import { DECIMALS, UNIT } from "./math";

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

/** First and last characters of an address or signature: "BGdJ...wYyM". */
export function truncateMiddle(value: string, head: number = 4, tail: number = 4): string {
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

export type ExplorerCluster = "devnet" | "testnet" | "mainnet-beta";

function explorerQuery(cluster: ExplorerCluster): string {
  return cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`;
}

export function explorerTxUrl(signature: string, cluster: ExplorerCluster): string {
  return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}${explorerQuery(cluster)}`;
}

export function explorerAddressUrl(address: string, cluster: ExplorerCluster): string {
  return `https://explorer.solana.com/address/${encodeURIComponent(address)}${explorerQuery(cluster)}`;
}
