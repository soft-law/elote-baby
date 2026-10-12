import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BRAND } from "../src/config";

const dir = join(import.meta.dir, "..", "public", "token");
const raw = readFileSync(join(dir, "tmxn.json"), "utf8");

describe("tMXN token metadata (Metaplex off-chain JSON)", () => {
  test("parses and has exactly name, symbol, description and image", () => {
    const meta = JSON.parse(raw) as Record<string, unknown>;
    expect(Object.keys(meta).sort()).toEqual(["description", "image", "name", "symbol"]);
    expect(meta.name).toBe("tMXN test token");
    expect(meta.symbol).toBe("tMXN");
    expect(meta.description).toBe(`Test token of the ${BRAND} devnet demo. It has no value and is not an offer of anything.`);
    expect(meta.image).toBe(`https://${BRAND}/token/tmxn.png`);
  });

  test("uses none of the banned words", () => {
    // "mint" is banned as a noun; the metadata has no reason to use the word at all.
    for (const word of ["mint", "free", "backed", "guaranteed", "stablecoin", "dividend", "automatic", "NFT", "tokenized"]) {
      expect(raw).not.toMatch(new RegExp(`\\b${word}\\b`, "i"));
    }
    expect(raw).not.toContain(String.fromCharCode(0x2014)); // em dash
    expect(raw).not.toContain("!");
  });

  test("icon is a 512x512 PNG under 60 KB", () => {
    const png = readFileSync(join(dir, "tmxn.png"));
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(512);
    expect(png.readUInt32BE(20)).toBe(512);
    expect(png.length).toBeLessThan(60 * 1024);
  });
});
