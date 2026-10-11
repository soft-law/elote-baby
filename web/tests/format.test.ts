import { describe, expect, test } from "bun:test";
import {
  explorerAddressUrl,
  explorerTxUrl,
  formatAmount,
  formatBps,
  formatDate,
  formatPerShare,
  truncateMiddle,
} from "../src/pool/format";

const UNIT = 1_000_000n;

describe("display formatting", () => {
  test("amounts are grouped and rounded down", () => {
    expect(formatAmount(4_192n * UNIT)).toBe("4,192");
    expect(formatAmount(15_720n * UNIT, "es")).toBe("15,720");
    expect(formatAmount(1_234_567n)).toBe("1.23");
    expect(formatAmount(1_239_999n)).toBe("1.23");
    expect(formatAmount(1_239_999n, "en", 6)).toBe("1.239999");
    expect(formatAmount(500n)).toBe("0");
    expect(formatAmount(0n)).toBe("0");
    expect(formatAmount(-2_500_000n)).toBe("-2.5");
  });

  test("value per share has three decimals", () => {
    expect(formatPerShare(UNIT)).toBe("1.000");
    expect(formatPerShare(1_048_000n)).toBe("1.048");
    expect(formatPerShare(1_048_999n)).toBe("1.048");
    expect(formatPerShare(0n)).toBe("0.000");
  });

  test("rates", () => {
    expect(formatBps(1_200)).toBe("12%");
    expect(formatBps(1_250)).toBe("12.5%");
    expect(formatBps(1_250, "es")).toBe("12.5%");
  });

  test("dates are UTC and empty when unset", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate(1_800_000_000)).toBe("Jan 15, 2027");
    expect(formatDate(1_800_000_000, "es")).toMatch(/15.*ene.*2027/);
  });

  test("addresses and explorer links", () => {
    const sig = "5".repeat(88);
    expect(truncateMiddle("BGdJQxxJoHiLH2VS6HAGHe5kQuKKq9dwrPeX7DEEwYyM")).toBe("BGdJ...wYyM");
    expect(truncateMiddle("short")).toBe("short");
    expect(explorerTxUrl(sig, "devnet")).toBe(`https://explorer.solana.com/tx/${sig}?cluster=devnet`);
    expect(explorerAddressUrl("abc", "mainnet-beta")).toBe("https://explorer.solana.com/address/abc");
  });

  test("localnet links name the validator's RPC URL as a custom cluster", () => {
    const sig = "5".repeat(88);
    const local = "?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899";
    expect(explorerTxUrl(sig, "localnet", "http://127.0.0.1:8899")).toBe(`https://explorer.solana.com/tx/${sig}${local}`);
    expect(explorerAddressUrl("abc", "localnet")).toBe(`https://explorer.solana.com/address/abc${local}`);
    expect(explorerTxUrl(sig, "localnet", "http://localhost:9000")).toBe(
      `https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A9000`,
    );
    // Other clusters ignore the RPC URL.
    expect(explorerTxUrl(sig, "devnet", "http://localhost:9000")).toBe(`https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  });
});
