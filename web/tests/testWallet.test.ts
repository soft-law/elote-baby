import { describe, expect, test } from "bun:test";
import { getWallets } from "@wallet-standard/app";
import { TEST_WALLET_NAME, registerTestWallet } from "../src/wallet/testWallet";

// A throwaway 64-byte secret made here; it never leaves the test.
async function freshSecret(): Promise<string> {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return JSON.stringify([...pkcs8.slice(-32), ...pub]);
}

const listed = () => getWallets().get().filter((w) => w.name === TEST_WALLET_NAME).length;

describe("test wallet registration", () => {
  test("StrictMode order (register, release before it resolves, register again) lists the wallet once", async () => {
    const secret = await freshSecret();
    // Effect 1 starts, its cleanup runs before the registration resolves, effect 2 starts.
    const first = registerTestWallet(secret, "solana:devnet");
    const second = registerTestWallet(secret, "solana:devnet");
    const [releaseFirst, releaseSecond] = await Promise.all([first, second]);
    // Both effects hold a registration: still one wallet in the list.
    expect(listed()).toBe(1);
    releaseFirst(); // the cancelled effect releases once it resolves
    expect(listed()).toBe(1);
    releaseFirst(); // releasing twice is harmless
    expect(listed()).toBe(1);
    releaseSecond();
    expect(listed()).toBe(0);
  });

  test("a new registration after a full release registers again", async () => {
    const secret = await freshSecret();
    (await registerTestWallet(secret, "solana:devnet"))();
    expect(listed()).toBe(0);
    const release = await registerTestWallet(secret, "solana:devnet");
    expect(listed()).toBe(1);
    release();
    expect(listed()).toBe(0);
  });

  test("a bad secret rejects and leaves nothing registered", async () => {
    await expect(registerTestWallet("[1,2,3]", "solana:devnet")).rejects.toThrow("64 bytes");
    expect(listed()).toBe(0);
  });
});
