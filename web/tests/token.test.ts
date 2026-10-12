import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BRAND } from "../src/config";

const dir = join(import.meta.dir, "..", "public", "token");

// Off-chain Metaplex JSON of the devnet test tokens. The name and symbol must match what the scripts
// write on chain (scripts/token-metadata.ts for tMXN, scripts/meteora/dbc-pool.ts for tELOTE).
const TOKENS = [
  {
    file: "tmxn",
    name: "tMXN test token",
    symbol: "tMXN",
    description: `Test token of the ${BRAND} devnet demo. It has no value and is not an offer of anything.`,
  },
  {
    file: "telote",
    name: "Elote Community (devnet test)",
    symbol: "tELOTE",
    description:
      `Devnet demo token of the ${BRAND} launch preset. It has no value and no claim on the credit pool: ` +
      "it is not a pool share, earns no interest and gives no right to repayments.",
  },
];

for (const t of TOKENS) {
  const raw = readFileSync(join(dir, `${t.file}.json`), "utf8");

  describe(`${t.symbol} token metadata (Metaplex off-chain JSON)`, () => {
    test("parses and has exactly name, symbol, description and image", () => {
      const meta = JSON.parse(raw) as Record<string, unknown>;
      expect(Object.keys(meta).sort()).toEqual(["description", "image", "name", "symbol"]);
      expect(meta.name).toBe(t.name);
      expect(meta.symbol).toBe(t.symbol);
      expect(meta.description).toBe(t.description);
      expect(meta.image).toBe(`https://${BRAND}/token/${t.file}.png`);
    });

    test("fits the Token Metadata limits (name 32 bytes, symbol 10)", () => {
      expect(Buffer.byteLength(t.name)).toBeLessThanOrEqual(32);
      expect(Buffer.byteLength(t.symbol)).toBeLessThanOrEqual(10);
    });

    test("uses none of the banned words", () => {
      // "mint" is banned as a noun; the metadata has no reason to use the word at all.
      for (const word of ["mint", "free", "backed", "guaranteed", "stablecoin", "dividend", "automatic", "APY", "NFT", "tokenized"]) {
        expect(raw).not.toMatch(new RegExp(`\\b${word}\\b`, "i"));
      }
      expect(raw).not.toContain(String.fromCharCode(0x2014)); // em dash
      expect(raw).not.toContain("!");
    });

    test("icon is a 512x512 PNG under 60 KB", () => {
      const png = readFileSync(join(dir, `${t.file}.png`));
      expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
      expect(png.readUInt32BE(16)).toBe(512);
      expect(png.readUInt32BE(20)).toBe(512);
      expect(png.length).toBeLessThan(60 * 1024);
    });
  });
}

test("the tELOTE description says it is a devnet demo token with no value and no claim on the pool", () => {
  const meta = JSON.parse(readFileSync(join(dir, "telote.json"), "utf8")) as { description: string };
  expect(meta.description).toContain("Devnet demo token");
  expect(meta.description).toContain("no value");
  expect(meta.description).toContain("no claim on the credit pool");
});
