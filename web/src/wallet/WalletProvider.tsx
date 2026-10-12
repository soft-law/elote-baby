// Wallet Standard discovery and selection. @solana/react's SelectedWalletAccountContextProvider
// keeps the selected account (persisted under elote.wallet.v1); this provider adds connect,
// disconnect, the status and a sign-only TransactionSigner for the selected account.
import { SelectedWalletAccountContextProvider, useSelectedWalletAccount, useWalletAccountTransactionSigner } from "@solana/react";
import { address as toAddress, type TransactionSigner } from "@solana/kit";
import {
  uiWalletAccountBelongsToUiWallet,
  useConnect,
  useDisconnect,
  type UiWallet,
  type UiWalletAccount,
} from "@wallet-standard/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { WalletContext, WalletNoAccountError, supportsChain, walletStatus, type SolanaChain, type WalletState } from "./useWallet";

export const WALLET_STORAGE_KEY = "elote.wallet.v1";

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const stateSync = {
  getSelectedWallet: () => storage()?.getItem(WALLET_STORAGE_KEY) ?? null,
  storeSelectedWallet: (key: string) => {
    try {
      storage()?.setItem(WALLET_STORAGE_KEY, key);
    } catch {
      // Not remembered across visits; the session still works.
    }
  },
  deleteSelectedWallet: () => {
    try {
      storage()?.removeItem(WALLET_STORAGE_KEY);
    } catch {
      // Nothing to forget.
    }
  },
};

type Handle = {
  connect: () => Promise<readonly UiWalletAccount[]>;
  disconnect: () => Promise<void>;
};

export function WalletProvider({ chain, children }: { chain: SolanaChain; children: ReactNode }) {
  const filterWallets = useCallback((wallet: UiWallet) => supportsChain(wallet, chain), [chain]);
  return (
    <SelectedWalletAccountContextProvider filterWallets={filterWallets} stateSync={stateSync}>
      <WalletStateProvider chain={chain}>{children}</WalletStateProvider>
    </SelectedWalletAccountContextProvider>
  );
}

function WalletStateProvider({ chain, children }: { chain: SolanaChain; children: ReactNode }) {
  const [selected, setSelected, wallets] = useSelectedWalletAccount();
  const [connecting, setConnecting] = useState(false);
  const [signer, setSigner] = useState<TransactionSigner | null>(null);
  const handles = useRef(new Map<string, Handle>());
  const account = selected ?? null;
  const status = walletStatus(connecting, account, chain);

  const register = useCallback((name: string, handle: Handle | null) => {
    if (handle) handles.current.set(name, handle);
    else handles.current.delete(name);
  }, []);

  const connect = useCallback(
    async (wallet: UiWallet) => {
      const handle = handles.current.get(wallet.name);
      if (!handle) throw new Error("Wallet is not available");
      setConnecting(true);
      try {
        const accounts = await handle.connect();
        const chosen = accounts.find((a) => a.chains.includes(chain)) ?? accounts[0];
        // A mainnet-only account is still selected: its status is "wrong-chain", with the switch steps.
        if (!chosen) throw new WalletNoAccountError();
        setSelected(chosen);
      } finally {
        setConnecting(false);
      }
    },
    [chain, setSelected],
  );

  const disconnect = useCallback(async () => {
    const current = account;
    setSelected(undefined);
    setSigner(null);
    if (!current) return;
    const owner = wallets.find((w) => uiWalletAccountBelongsToUiWallet(current, w));
    const handle = owner ? handles.current.get(owner.name) : undefined;
    // The app forgets the account either way; some wallets have no disconnect feature.
    await handle?.disconnect().catch(() => undefined);
  }, [account, setSelected, wallets]);

  const value = useMemo<WalletState>(
    () => ({
      status,
      account,
      address: account ? toAddress(account.address) : null,
      signer: status === "connected" ? signer : null,
      connect,
      disconnect,
      wallets,
      chain,
    }),
    [status, account, signer, connect, disconnect, wallets, chain],
  );

  return (
    <WalletContext.Provider value={value}>
      {wallets.map((wallet) => (
        <WalletHandle key={wallet.name} wallet={wallet} register={register} />
      ))}
      {account && status === "connected" ? (
        <SignerBridge key={account.address} account={account} chain={chain} onSigner={setSigner} />
      ) : null}
      {children}
    </WalletContext.Provider>
  );
}

/** Wallet Standard hooks are per wallet; one invisible component per discovered wallet. */
function WalletHandle({ wallet, register }: { wallet: UiWallet; register: (name: string, handle: Handle | null) => void }) {
  const [, connect] = useConnect(wallet);
  const canDisconnect = wallet.features.includes("standard:disconnect");
  return canDisconnect ? (
    <WalletHandleWithDisconnect wallet={wallet} connect={connect} register={register} />
  ) : (
    <Registration name={wallet.name} handle={{ connect: () => connect(), disconnect: async () => undefined }} register={register} />
  );
}

function WalletHandleWithDisconnect({
  wallet,
  connect,
  register,
}: {
  wallet: UiWallet;
  connect: () => Promise<readonly UiWalletAccount[]>;
  register: (name: string, handle: Handle | null) => void;
}) {
  const [, disconnect] = useDisconnect(wallet);
  return <Registration name={wallet.name} handle={{ connect: () => connect(), disconnect: () => disconnect() }} register={register} />;
}

function Registration({ name, handle, register }: { name: string; handle: Handle; register: (name: string, handle: Handle | null) => void }) {
  // Latest functions after every commit; removed when the wallet goes away.
  useEffect(() => {
    register(name, handle);
    return () => register(name, null);
  });
  return null;
}

/** useWalletAccountTransactionSigner needs an account; mounted only while one is connected. */
function SignerBridge({
  account,
  chain,
  onSigner,
}: {
  account: UiWalletAccount;
  chain: SolanaChain;
  onSigner: (signer: TransactionSigner | null) => void;
}) {
  const signer = useWalletAccountTransactionSigner(account, chain);
  useEffect(() => {
    onSigner(signer);
    return () => onSigner(null);
  }, [signer, onSigner]);
  return null;
}
