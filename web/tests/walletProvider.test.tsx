// WalletProvider with a wallet that returns a fresh account object on every read of
// wallet.accounts (same address, new identity). The signer must stay one stable object, the
// provider must not loop, and the signer must still reach the wallet.
import "./support/dom";
import { afterEach, expect, spyOn, test } from "bun:test";
import {
  appendTransactionMessageInstructions,
  blockhash,
  compileTransaction,
  createTransactionMessage,
  getAddressEncoder,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type TransactionSigner,
} from "@solana/kit";
import { getWallets } from "@wallet-standard/app";
import { createRoot, type Root } from "react-dom/client";
import { WALLET_STORAGE_KEY, WalletProvider } from "../src/wallet/WalletProvider";
import { useWallet } from "../src/wallet/useWallet";

type Wallet = Parameters<ReturnType<typeof getWallets>["register"]>[0];

const ADDRESS = "F5hKfqqYzeyU71b47pByjYd6mfREzhQbDmZKRtjU8EiZ" as Address;

function freshAccountWallet() {
  const calls: unknown[] = [];
  const account = {
    address: ADDRESS,
    publicKey: new Uint8Array(getAddressEncoder().encode(ADDRESS)),
    chains: ["solana:devnet"] as const,
    features: ["solana:signTransaction"] as const,
    label: "Stub",
  };
  const wallet = {
    version: "1.0.0",
    name: "StubWallet",
    icon: "data:image/svg+xml;base64,PHN2Zy8+",
    chains: ["solana:devnet"],
    get accounts() {
      return [{ ...account }];
    },
    features: {
      "standard:connect": { version: "1.0.0", connect: async () => ({ accounts: [{ ...account }] }) },
      "standard:disconnect": { version: "1.0.0", disconnect: async () => undefined },
      "standard:events": { version: "1.0.0", on: () => () => undefined },
      "solana:signTransaction": {
        version: "1.0.0",
        supportedTransactionVersions: [0, "legacy"],
        signTransaction: async (...inputs: { transaction: Uint8Array }[]) => {
          calls.push(...inputs);
          return inputs.map((input) => ({ signedTransaction: input.transaction }));
        },
      },
    },
  } as unknown as Wallet;
  return { wallet, calls };
}

let cleanup: (() => Promise<void>) | null = null;
afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

test("a wallet that returns fresh account objects keeps one stable signer and no update loop", async () => {
  const errors: string[] = [];
  const error = spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  });
  const { wallet, calls } = freshAccountWallet();
  const unregister = getWallets().register(wallet);
  // Bun has no localStorage of its own; the provider reads globalThis.localStorage, as in a browser.
  const g = globalThis as { localStorage?: Storage };
  const hadStorage = "localStorage" in g;
  if (!hadStorage) g.localStorage = window.localStorage as unknown as Storage;
  window.localStorage.setItem(WALLET_STORAGE_KEY, `StubWallet:${ADDRESS}`);

  let renders = 0;
  const signers: TransactionSigner[] = [];
  let latest: ReturnType<typeof useWallet> | null = null;
  function Consumer() {
    const state = useWallet();
    renders += 1;
    latest = state;
    if (state.signer && !signers.includes(state.signer)) signers.push(state.signer);
    return null;
  }

  // Rendered outside act(): an endless update loop never lets act() settle, so the test watches
  // the real scheduler for a fixed time instead.
  const actFlag = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousAct = actFlag.IS_REACT_ACT_ENVIRONMENT;
  actFlag.IS_REACT_ACT_ENVIRONMENT = false;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  cleanup = async () => {
    root.unmount();
    await new Promise((r) => setTimeout(r, 20));
    actFlag.IS_REACT_ACT_ENVIRONMENT = previousAct;
    host.remove();
    unregister();
    window.localStorage.removeItem(WALLET_STORAGE_KEY);
    if (!hadStorage) delete g.localStorage;
    error.mockRestore();
  };
  root.render(
    <WalletProvider chain="solana:devnet">
      <Consumer />
    </WalletProvider>,
  );
  await new Promise((r) => setTimeout(r, 300));

  expect(errors.filter((e) => e.includes("Maximum update depth")).length).toBe(0);
  expect(renders).toBeLessThan(12);
  expect(latest!.status).toBe("connected");
  expect(signers.length).toBe(1);
  const signer = signers[0]!;
  expect(signer.address).toBe(ADDRESS);
  expect(latest!.signer).toBe(signer);

  const transaction = compileTransaction(
    pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayer(ADDRESS, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: blockhash("11111111111111111111111111111111"), lastValidBlockHeight: 1n }, m),
      (m) => appendTransactionMessageInstructions([], m),
    ),
  );
  const signed = await (signer as unknown as { modifyAndSignTransactions: (t: unknown[]) => Promise<unknown[]> }).modifyAndSignTransactions([transaction]);
  expect(calls.length).toBe(1);
  expect(signed.length).toBe(1);
});
