// Adapter from the on-chain CreditLine account to what the UI shows. The UI never reads raw
// account fields: it reads a LineView.
//
// Two layouts exist. Version 1 is a single-maturity line with `reserved` all zero. Version 2
// (arrears work, not yet on the generated client) packs an installment schedule and late interest
// into `reserved` and adds the `InCollection` status (enum index 4). Anything else (a newer
// version or a status index this code does not know) renders as "unknown" instead of failing.
//
// The generated `getCreditLineDecoder` throws on a status index it does not know ("Enum
// discriminator out of range"), so `fetchAllMaybeCreditLine` would fail for the whole page once
// a line reaches InCollection. `decodeLineView` reads the same layout with the status as a plain
// u8 and never throws; list pages should decode raw account bytes through it.
import {
  CREDIT_LINE_DISCRIMINATOR,
  type CreditLine,
} from "@elote/pool-client";
import {
  fixDecoderSize,
  getAddressDecoder,
  getBytesDecoder,
  getI64Decoder,
  getOptionDecoder,
  getStructDecoder,
  getU16Decoder,
  getU64Decoder,
  getU8Decoder,
  isSome,
  type Address,
  type Option,
  type ReadonlyUint8Array,
} from "@solana/kit";

export type LineStatusView = "approved" | "active" | "repaid" | "writtenOff" | "inCollection" | "unknown";

export const LINE_VERSION = 1;
export const LINE_VERSION_SCHEDULED = 2;

/** Installment terms of a version-2 line (from `reserved`, see programs/elote_pool/src/state.rs). */
export type ScheduleView = {
  /** Seconds between due dates; installment k is due at drawnAt + k * intervalSeconds. */
  intervalSeconds: bigint;
  installments: number;
  /** Missed installments after which anyone may move the line to collection. */
  maxMissed: number;
};

/** Late interest terms and totals of a version-2 line. Accrual needs the pool grace and a clock. */
export type LateInterestView = {
  /** Annual late interest rate on overdue amounts, in basis points. */
  lateBps: number;
  /** Late interest collected so far, in base units. */
  collected: bigint;
  /** Late interest is settled up to this time (unix seconds); null until the first repayment. */
  paidUntil: number | null;
};

export type LineView = {
  readable: true;
  version: number;
  status: LineStatusView;
  /** The raw status index, kept for diagnostics only. */
  statusIndex: number;
  pool: Address;
  lineId: bigint;
  borrower: Address;
  sponsor: Address | null;
  principal: bigint;
  rateBps: number;
  interestDue: bigint;
  principalRepaid: bigint;
  interestRepaid: bigint;
  /** Principal plus fixed interest still to pay (late interest not included). */
  remaining: bigint;
  /** Unix seconds; null when the field is zero (not yet happened). */
  termEnd: number | null;
  openedAt: number | null;
  drawnAt: number | null;
  closedAt: number | null;
  /** 64 lowercase hex characters, no 0x prefix (the format mcp/ reports as agreementHashHex). */
  agreementHashHex: string;
  schedule?: ScheduleView;
  lateInterest?: LateInterestView;
};

/** An account at a line address whose bytes this code cannot read at all. */
export type UnreadableLineView = { readable: false; status: "unknown" };

export type AnyLineView = LineView | UnreadableLineView;

/** The CreditLine fields the adapter needs, with the status as a plain number. */
export type RawCreditLine = Omit<CreditLine, "status" | "discriminator"> & { status: number };

const STATUS_BY_INDEX: readonly LineStatusView[] = ["approved", "active", "repaid", "writtenOff", "inCollection"];

/** Status indexes each layout may carry: InCollection (4) exists only on scheduled (v2) lines. */
const MAX_STATUS_INDEX: Record<number, number> = { [LINE_VERSION]: 3, [LINE_VERSION_SCHEDULED]: 4 };

export function statusFromIndex(index: number, version: number): LineStatusView {
  const max = MAX_STATUS_INDEX[version];
  if (max === undefined || !Number.isInteger(index) || index < 0 || index > max) return "unknown";
  return STATUS_BY_INDEX[index] ?? "unknown";
}

export function bytesToHex(bytes: ReadonlyUint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function seconds(value: bigint): number | null {
  return value === 0n ? null : Number(value);
}

function readSchedule(reserved: ReadonlyUint8Array): { schedule: ScheduleView; lateInterest: LateInterestView } {
  const view = new DataView(reserved.buffer, reserved.byteOffset, reserved.byteLength);
  return {
    schedule: {
      intervalSeconds: view.getBigInt64(0, true),
      installments: view.getUint16(8, true),
      maxMissed: view.getUint8(12),
    },
    lateInterest: {
      lateBps: view.getUint16(10, true),
      collected: view.getBigUint64(14, true),
      paidUntil: seconds(view.getBigInt64(22, true)),
    },
  };
}

/** Adapts a decoded line. Accepts the generated `CreditLine` (status is the enum index). */
export function toLineView(line: RawCreditLine | CreditLine): LineView {
  const statusIndex = Number(line.status);
  const sponsor = line.sponsor as Option<Address>;
  const remainingPrincipal = line.principal > line.principalRepaid ? line.principal - line.principalRepaid : 0n;
  const remainingInterest = line.interestDue > line.interestRepaid ? line.interestDue - line.interestRepaid : 0n;
  const view: LineView = {
    readable: true,
    version: line.version,
    status: statusFromIndex(statusIndex, line.version),
    statusIndex,
    pool: line.pool,
    lineId: line.lineId,
    borrower: line.borrower,
    sponsor: isSome(sponsor) ? sponsor.value : null,
    principal: line.principal,
    rateBps: line.rateBps,
    interestDue: line.interestDue,
    principalRepaid: line.principalRepaid,
    interestRepaid: line.interestRepaid,
    remaining: remainingPrincipal + remainingInterest,
    termEnd: seconds(line.termEnd),
    openedAt: seconds(line.openedAt),
    drawnAt: seconds(line.drawnAt),
    closedAt: seconds(line.closedAt),
    agreementHashHex: bytesToHex(line.agreementHash),
  };
  if (line.version === LINE_VERSION_SCHEDULED && line.reserved.length >= 30) {
    const { schedule, lateInterest } = readSchedule(line.reserved);
    view.schedule = schedule;
    view.lateInterest = lateInterest;
  }
  return view;
}

/** The CreditLine layout with the status read as a u8, so a new status never throws. */
function getTolerantCreditLineDecoder() {
  return getStructDecoder([
    ["discriminator", fixDecoderSize(getBytesDecoder(), 8)],
    ["version", getU8Decoder()],
    ["pool", getAddressDecoder()],
    ["lineId", getU64Decoder()],
    ["borrower", getAddressDecoder()],
    ["sponsor", getOptionDecoder(getAddressDecoder())],
    ["agreementHash", fixDecoderSize(getBytesDecoder(), 32)],
    ["principal", getU64Decoder()],
    ["rateBps", getU16Decoder()],
    ["interestDue", getU64Decoder()],
    ["termEnd", getI64Decoder()],
    ["principalRepaid", getU64Decoder()],
    ["interestRepaid", getU64Decoder()],
    ["status", getU8Decoder()],
    ["openedAt", getI64Decoder()],
    ["drawnAt", getI64Decoder()],
    ["closedAt", getI64Decoder()],
    ["reserved", fixDecoderSize(getBytesDecoder(), 32)],
    ["bump", getU8Decoder()],
  ]);
}

function hasDiscriminator(data: ReadonlyUint8Array): boolean {
  if (data.length < CREDIT_LINE_DISCRIMINATOR.length) return false;
  return CREDIT_LINE_DISCRIMINATOR.every((b, i) => data[i] === b);
}

/** Decodes raw CreditLine account bytes. Never throws: unreadable bytes give an "unknown" view. */
export function decodeLineView(data: ReadonlyUint8Array): AnyLineView {
  if (!hasDiscriminator(data)) return { readable: false, status: "unknown" };
  try {
    const { discriminator: _discriminator, ...line } = getTolerantCreditLineDecoder().decode(data);
    return toLineView(line);
  } catch {
    return { readable: false, status: "unknown" };
  }
}
