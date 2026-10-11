// Keypair test wallet for end-to-end tests (Playwright). Registered through the Wallet Standard
// only when VITE_TEST_WALLET=1, so it shows up in the wallet list like any browser wallet and the
// app signs through the same TransactionSigner path. The secret comes from
// VITE_TEST_WALLET_SECRET (base58 or a JSON array of 64 bytes); it is never logged or rendered.
// Test builds only: a variable set at build time is part of the built files.
import {
  createKeyPairSignerFromBytes,
  getAddressEncoder,
  getBase58Encoder,
  getTransactionDecoder,
  getTransactionEncoder,
  partiallySignTransaction,
  type KeyPairSigner,
} from "@solana/kit";
import { getWallets } from "@wallet-standard/app";
import type { SolanaChain } from "./useWallet";

type Wallet = Parameters<ReturnType<typeof getWallets>["register"]>[0];
type WalletAccount = Wallet["accounts"][number];
type ChangeListener = (properties: { accounts?: readonly WalletAccount[] }) => void;

export const TEST_WALLET_NAME = "Elote Test Wallet";

const ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#131313"/><path d="M9 16h14M16 9v14" stroke="#6ae1e7" stroke-width="3" stroke-linecap="round"/></svg>';

/** 64 secret key bytes from base58 or a JSON array. Errors never include the input. */
export function parseSecret(raw: string): Uint8Array {
  const text = raw.trim();
  let bytes: Uint8Array;
  try {
    if (text.startsWith("[")) {
      const parsed: unknown = JSON.parse(text);
      if (!Array.isArray(parsed) || !parsed.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) throw new Error();
      bytes = Uint8Array.from(parsed as number[]);
    } else {
      bytes = new Uint8Array(getBase58Encoder().encode(text));
    }
  } catch {
    throw new Error("VITE_TEST_WALLET_SECRET is not base58 or a JSON byte array");
  }
  if (bytes.length !== 64) throw new Error("VITE_TEST_WALLET_SECRET must hold 64 bytes");
  return bytes;
}

export function createTestWallet(signer: KeyPairSigner, chain: SolanaChain): Wallet {
  const listeners = new Set<ChangeListener>();
  const account: WalletAccount = {
    address: signer.address,
    publicKey: new Uint8Array(getAddressEncoder().encode(signer.address)),
    chains: [chain],
    features: ["solana:signTransaction"],
    label: TEST_WALLET_NAME,
  };
  let accounts: readonly WalletAccount[] = [];
  const emit = () => listeners.forEach((l) => l({ accounts }));

  const wallet: Wallet = {
    version: "1.0.0",
    name: TEST_WALLET_NAME,
    icon: `data:image/svg+xml;base64,${btoa(ICON_SVG)}`,
    chains: [chain],
    get accounts() {
      return accounts;
    },
    features: {
      "standard:connect": {
        version: "1.0.0",
        connect: async () => {
          if (accounts.length === 0) {
            accounts = [account];
            emit();
          }
          return { accounts };
        },
      },
      "standard:disconnect": {
        version: "1.0.0",
        disconnect: async () => {
          accounts = [];
          emit();
        },
      },
      "standard:events": {
        version: "1.0.0",
        on: (event: string, listener: ChangeListener) => {
          if (event !== "change") return () => undefined;
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      "solana:signTransaction": {
        version: "1.0.0",
        supportedTransactionVersions: ["legacy", 0],
        signTransaction: async (...inputs: ReadonlyArray<{ account: WalletAccount; transaction: Uint8Array }>) =>
          Promise.all(
            inputs.map(async ({ account: requested, transaction }) => {
              if (requested.address !== signer.address) throw new Error("Unknown account");
              const decoded = getTransactionDecoder().decode(transaction);
              const signed = await partiallySignTransaction([signer.keyPair], decoded);
              return { signedTransaction: new Uint8Array(getTransactionEncoder().encode(signed)) };
            }),
          ),
      },
    },
  };
  return wallet;
}

/** Registers the test wallet; returns the unregister function. */
export async function registerTestWallet(secret: string | undefined, chain: SolanaChain): Promise<() => void> {
  if (!secret) throw new Error("VITE_TEST_WALLET_SECRET is not set");
  const signer = await createKeyPairSignerFromBytes(parseSecret(secret));
  return getWallets().register(createTestWallet(signer, chain));
}

/** Reads VITE_TEST_WALLET_SECRET here so the value only ever sits in this lazily loaded module. */
export function registerTestWalletFromEnv(chain: SolanaChain): Promise<() => void> {
  return registerTestWallet(import.meta.env.VITE_TEST_WALLET_SECRET as string | undefined, chain);
}
