// Wallet signing with a post-sign guard. The wallet may re-serialize the transaction, but it must
// sign exactly the message the app built: the returned message is compared byte for byte, and
// every required signature is verified cryptographically. A wallet that adds instructions or
// changes the fee payer is refused and nothing is sent.
import {
  compileTransaction,
  getPublicKeyFromAddress,
  isTransactionSendingSigner,
  signTransactionMessageWithSigners,
  verifySignature,
  type Address,
  type ReadonlyUint8Array,
  type Transaction,
  type TransactionSigner,
} from "@solana/kit";
import { toTxError } from "./errors";
import { TxFailedError } from "./tx";

const equalBytes = (a: ReadonlyUint8Array, b: ReadonlyUint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Throws TxFailedError("guard") unless `signed` carries `expected`'s message and valid signatures. */
export async function assertSignedAsBuilt(expected: Transaction, signed: Transaction): Promise<void> {
  if (!equalBytes(signed.messageBytes, expected.messageBytes)) throw new TxFailedError("guard");
  const required = Object.keys(expected.signatures) as Address[];
  for (const signer of required) {
    const signature = signed.signatures[signer];
    if (!signature) throw new TxFailedError("guard");
    let valid = false;
    try {
      valid = await verifySignature(await getPublicKeyFromAddress(signer), signature, signed.messageBytes);
    } catch {
      valid = false;
    }
    if (!valid) throw new TxFailedError("guard");
  }
}

/** A signer the pipeline accepts: it signs and returns, it never sends on its own. */
export function assertSignOnly(signer: TransactionSigner): void {
  if (isTransactionSendingSigner(signer)) throw new TxFailedError("guard");
}

type SignableMessage = Parameters<typeof signTransactionMessageWithSigners>[0];

/**
 * Asks the message's signers (the wallet) to sign, then applies the guard. A declined request
 * becomes TxRejectedError; any other wallet failure is typed by toTxError.
 */
export async function signWithGuard(message: SignableMessage): Promise<Transaction> {
  const expected = compileTransaction(message);
  let signed: Transaction;
  try {
    signed = await signTransactionMessageWithSigners(message);
  } catch (error) {
    throw toTxError(error);
  }
  await assertSignedAsBuilt(expected, signed);
  return signed;
}
