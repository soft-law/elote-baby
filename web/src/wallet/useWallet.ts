// The connected wallet as the app sees it. WalletProvider fills the context.
import { createContext, useContext } from "react";
import type { Address, TransactionSigner } from "@solana/kit";
import type { UiWallet, UiWalletAccount } from "@wallet-standard/react";
import type { ExplorerCluster } from "../pool/format";

export type SolanaChain = `solana:${string}`;

export type WalletStatus = "absent" | "connecting" | "connected" | "wrong-chain";

export type WalletState = {
  status: WalletStatus;
  /** Selected account, also when it is on the wrong chain. */
  account: UiWalletAccount | null;
  address: Address | null;
  /** Signs only; never sends. Null unless status is "connected". */
  signer: TransactionSigner | null;
  /** Asks the wallet to connect and selects its first account on the app's chain. */
  connect(wallet: UiWallet): Promise<void>;
  disconnect(): Promise<void>;
  /** Wallets that can sign Solana transactions on the app's chain. */
  wallets: readonly UiWallet[];
  chain: SolanaChain;
};

export const WalletContext = createContext<WalletState | null>(null);

export function useWallet(): WalletState {
  const state = useContext(WalletContext);
  if (!state) throw new Error("useWallet outside WalletProvider");
  return state;
}

/** Wallet Standard chain id for an explorer cluster: devnet gives "solana:devnet". */
export function chainForCluster(cluster: ExplorerCluster): SolanaChain {
  return cluster === "mainnet-beta" ? "solana:mainnet" : `solana:${cluster}`;
}

export const SIGN_TRANSACTION_FEATURE = "solana:signTransaction";

/** Discovery filter: the wallet signs Solana transactions and lists the app's chain. */
export function supportsChain(wallet: Pick<UiWallet, "features" | "chains">, chain: SolanaChain): boolean {
  return wallet.features.includes(SIGN_TRANSACTION_FEATURE) && wallet.chains.includes(chain);
}

export function walletStatus(connecting: boolean, account: Pick<UiWalletAccount, "chains"> | null, chain: SolanaChain): WalletStatus {
  if (connecting) return "connecting";
  if (!account) return "absent";
  return account.chains.includes(chain) ? "connected" : "wrong-chain";
}

/** connect() resolved, but the wallet shared no account with the app. */
export class WalletNoAccountError extends Error {
  constructor() {
    super("The wallet shared no account");
    this.name = "WalletNoAccountError";
  }
}

/** Why an account is on the wrong chain, as copy: a mainnet-only account gets the switch steps. */
export function wrongChainText(
  account: Pick<UiWalletAccount, "chains"> | null,
  chain: SolanaChain,
  copy: { wrongChain: string; wrongChainMainnet: string },
  network: string,
): string {
  const onlyMainnet = account !== null && account.chains.includes("solana:mainnet") && !account.chains.includes(chain);
  return onlyMainnet ? copy.wrongChainMainnet.replace("{network}", network) : copy.wrongChain;
}

/** The wallet's own error message for the person: one line, no control characters, at most 160 characters. */
export function walletErrorDetail(error: unknown): string | null {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : typeof (error as { message?: unknown } | null)?.message === "string"
          ? (error as { message: string }).message
          : "";
  const clean = raw.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.length > 160 ? `${clean.slice(0, 159)}…` : clean;
}

/** Brave's built-in wallet answers on window.braveSolana; extension wallets may then stay hidden. */
export function hasBraveWallet(): boolean {
  return typeof window !== "undefined" && (window as unknown as { braveSolana?: unknown }).braveSolana !== undefined;
}
