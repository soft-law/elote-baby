import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase58Decoder,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type SignatureBytes,
  type TransactionModifyingSigner,
  type TransactionPartialSigner,
  type TransactionSendingSigner,
  type TransactionSigner,
} from "@solana/kit";
import { setComputeUnitLimitInstruction } from "../src/tx/computeBudget";
import { createJournal, memoryStore } from "../src/tx/journal";
import { createRpc } from "../src/tx/rpc";
import { signWithGuard } from "../src/tx/signing";
import { TxFailedError, TxRejectedError } from "../src/tx/tx";
import { sendOp } from "../src/tx/write";
import { RPC_URL, healthyCluster, startRpc, testPool, type ChainState } from "./support/rpc";

const lifetime = async () => ({
  blockhash: getBase58Decoder().decode(crypto.getRandomValues(new Uint8Array(32))) as never,
  lastValidBlockHeight: 1_000n,
});

async function messageFor(signer: TransactionSigner, units = 10_000) {
  const life = await lifetime();
  return pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(life, m),
    (m) => appendTransactionMessageInstructions([setComputeUnitLimitInstruction(units)], m),
  );
}

/** A wallet that signs something other than what it was asked to sign. */
async function tamperingWallet(): Promise<TransactionModifyingSigner> {
  const keyPair = await generateKeyPairSigner();
  return {
    address: keyPair.address,
    async modifyAndSignTransactions(transactions) {
      // Re-builds the message with a different instruction and signs that, validly.
      const altered = compileTransaction(await messageFor(keyPair, 999_999));
      const [signed] = await keyPair.signTransactions([altered as never]);
      return transactions.map(() => ({ ...altered, signatures: { ...altered.signatures, ...signed } })) as never;
    },
  };
}

/** A wallet that keeps the message but returns a signature that does not verify. */
async function badSignatureWallet(): Promise<TransactionPartialSigner> {
  const keyPair = await generateKeyPairSigner();
  return {
    address: keyPair.address,
    async signTransactions(transactions) {
      return transactions.map(() => ({ [keyPair.address]: crypto.getRandomValues(new Uint8Array(64)) as SignatureBytes }) as Record<Address, SignatureBytes>);
    },
  };
}

describe("signing guard", () => {
  test("a wallet that signs the built message passes", async () => {
    const keyPair = await generateKeyPairSigner();
    const signed = await signWithGuard(await messageFor(keyPair));
    expect(signed.signatures[keyPair.address]).toBeDefined();
  });

  test("an altered message after signing is refused", async () => {
    const wallet = await tamperingWallet();
    const error = await signWithGuard(await messageFor(wallet)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TxFailedError);
    expect(error).toMatchObject({ reason: "guard" });
  });

  test("a signature that does not verify is refused", async () => {
    const wallet = await badSignatureWallet();
    const error = await signWithGuard(await messageFor(wallet)).catch((e: unknown) => e);
    expect(error).toMatchObject({ reason: "guard" });
  });

  test("declining in the wallet is a cancellation", async () => {
    const keyPair = await generateKeyPairSigner();
    const declining: TransactionPartialSigner = {
      address: keyPair.address,
      async signTransactions() {
        throw Object.assign(new Error("User rejected the request."), { code: 4001 });
      },
    };
    const error = await signWithGuard(await messageFor(declining)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TxRejectedError);
  });
});

describe("guard inside the pipeline", () => {
  const rpcServer = startRpc();
  afterAll(() => rpcServer.close());
  let state: ChainState;
  beforeEach(async () => {
    rpcServer.reset();
    state = await healthyCluster(rpcServer);
  });

  test("an altered transaction is never journaled or sent", async () => {
    const journal = createJournal(memoryStore());
    const { config, accounts } = await testPool();
    const error = await sendOp(
      { kind: "deposit", assets: 2_000_000n, minSharesOut: 1n },
      { rpc: createRpc(RPC_URL), signer: await tamperingWallet(), config, accounts, journal, locks: null, pollMs: 1 },
    ).catch((e: unknown) => e);
    expect(error).toMatchObject({ reason: "guard" });
    expect(state.sent).toHaveLength(0);
    expect(journal.all()).toHaveLength(0);
  });

  test("a sign-and-send signer is refused before anything happens", async () => {
    const keyPair = await generateKeyPairSigner();
    const sending: TransactionSendingSigner = {
      address: keyPair.address,
      async signAndSendTransactions() {
        throw new Error("must not be called");
      },
    };
    const { config, accounts } = await testPool();
    const error = await sendOp(
      { kind: "draw", lineId: 0n },
      { rpc: createRpc(RPC_URL), signer: sending as never, config, accounts, journal: createJournal(memoryStore()), locks: null },
    ).catch((e: unknown) => e);
    expect(error).toMatchObject({ reason: "guard" });
    expect(rpcServer.calls).toHaveLength(0);
  });
});
