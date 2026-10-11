// Installments and arrears of a scheduled (version 2) line, ported from the program's math.rs so
// the page can show what the program would take now. Pure bigint, no clock: callers pass `now`
// (unix seconds). Every division rounds down, as on chain. The result is an estimate: the program
// settles late interest at the second the repayment lands.
import type { LineView, ScheduleView } from "./line";

export const BPS = 10_000n;
export const SECONDS_PER_YEAR = 365n * 86_400n;

/** Terms of a scheduled line, as the arrears computation needs them. */
export type ScheduleTerms = {
  /** principal + interestDue. */
  total: bigint;
  drawnAt: bigint;
  interval: bigint;
  installments: number;
  lateBps: number;
  /** The pool's grace period in seconds. */
  grace: bigint;
  /** Late interest is settled up to this time (0: never). */
  latePaidUntil: bigint;
  principal: bigint;
  lateCollected: bigint;
};

export type Arrears = {
  /** Installments fallen due. */
  due: number;
  /** Installments fully paid. */
  covered: number;
  /** due - covered when positive. */
  missed: number;
  /** Principal and interest fallen due and not paid. */
  overdue: bigint;
  /** Late interest owed now and not yet settled. */
  lateDue: bigint;
  /** Due date (unix seconds) of the oldest unpaid installment that has fallen due. */
  firstMissedDue: bigint | null;
};

const min = (a: bigint, b: bigint) => (a < b ? a : b);
const max = (a: bigint, b: bigint) => (a > b ? a : b);

/** A schedule the arithmetic can run on: at least one installment and a positive interval. */
export function usableSchedule(schedule: ScheduleView | undefined): schedule is ScheduleView {
  return schedule !== undefined && schedule.installments >= 1 && schedule.intervalSeconds > 0n;
}

/** Installments whose due date has arrived (installment k is due at drawnAt + k * interval). */
export function installmentsDue(now: bigint, drawnAt: bigint, interval: bigint, installments: number): number {
  if (interval <= 0n || now <= drawnAt) return 0;
  const periods = (now - drawnAt) / interval;
  return periods >= BigInt(installments) ? installments : Number(periods);
}

/** The regular installment, total / installments rounded down; the last one carries the remainder. */
export function installmentAmount(total: bigint, installments: number): bigint {
  return total / BigInt(installments);
}

/** What is due once installments 1..k have fallen due. */
export function cumulativeDue(total: bigint, installments: number, k: number): bigint {
  if (k >= installments) return total;
  return installmentAmount(total, installments) * BigInt(k);
}

/** Installments fully paid by `paid` (principal and interest; late interest never pays one). */
export function installmentsCovered(paid: bigint, total: bigint, installments: number): number {
  if (paid >= total) return installments;
  const base = installmentAmount(total, installments);
  if (base === 0n) return 0;
  const full = paid / base;
  return Number(min(full, BigInt(installments - 1)));
}

function cappedSeconds(lateBps: number, seconds: bigint): bigint {
  if (lateBps === 0) return 0n;
  const bps = BigInt(lateBps);
  const cap = (BPS * SECONDS_PER_YEAR + bps - 1n) / bps;
  return min(seconds, cap);
}

function lateFromWeighted(weighted: bigint, lateBps: number, cap: bigint): bigint {
  return min((weighted * BigInt(lateBps)) / (BPS * SECONDS_PER_YEAR), cap);
}

/** Arrears of a scheduled line that has repaid `paid` (principal plus interest) by `now`. */
export function arrears(t: ScheduleTerms, paid: bigint, now: bigint): Arrears {
  const due = installmentsDue(now, t.drawnAt, t.interval, t.installments);
  const covered = installmentsCovered(paid, t.total, t.installments);
  const missed = Math.max(0, due - covered);
  let overdue = 0n;
  let weighted = 0n;
  let firstMissedDue: bigint | null = null;
  for (let k = covered + 1; k <= due; k++) {
    const upto = cumulativeDue(t.total, t.installments, k);
    const before = cumulativeDue(t.total, t.installments, k - 1);
    const part = upto - max(paid, before);
    const dueAt = t.drawnAt + t.interval * BigInt(k);
    if (firstMissedDue === null) firstMissedDue = dueAt;
    const start = max(dueAt + t.grace, t.latePaidUntil);
    if (now > start) weighted += part * cappedSeconds(t.lateBps, now - start);
    overdue += part;
  }
  const lifetimeLeft = t.principal > t.lateCollected ? t.principal - t.lateCollected : 0n;
  const lateDue = min(lateFromWeighted(weighted, t.lateBps, overdue), lifetimeLeft);
  return { due, covered, missed, overdue, lateDue, firstMissedDue };
}

/** The terms of a drawn scheduled line; null for a v1 line, an undrawn line or a schedule that cannot run. */
export function scheduleTerms(line: LineView, graceSeconds: number): ScheduleTerms | null {
  if (!usableSchedule(line.schedule) || line.drawnAt === null) return null;
  return {
    total: line.principal + line.interestDue,
    drawnAt: BigInt(line.drawnAt),
    interval: line.schedule.intervalSeconds,
    installments: line.schedule.installments,
    lateBps: line.lateInterest?.lateBps ?? 0,
    grace: BigInt(graceSeconds),
    latePaidUntil: BigInt(line.lateInterest?.paidUntil ?? 0),
    principal: line.principal,
    lateCollected: line.lateInterest?.collected ?? 0n,
  };
}

export type InstallmentState = "paid" | "partial" | "overdue" | "pending";

export type InstallmentRow = {
  /** 1-based. */
  number: number;
  /** Unix seconds; null until the line is drawn (due dates count from the draw). */
  dueAt: number | null;
  amount: bigint;
  state: InstallmentState;
};

/** The installment list of a scheduled line, with what is paid, overdue or still to come at `now`. */
export function installmentRows(line: LineView, now: bigint): InstallmentRow[] {
  const s = line.schedule;
  if (!usableSchedule(s)) return [];
  const total = line.principal + line.interestDue;
  const paid = line.principalRepaid + line.interestRepaid;
  const rows: InstallmentRow[] = [];
  for (let k = 1; k <= s.installments; k++) {
    const before = cumulativeDue(total, s.installments, k - 1);
    const upto = cumulativeDue(total, s.installments, k);
    const dueAt = line.drawnAt === null ? null : BigInt(line.drawnAt) + s.intervalSeconds * BigInt(k);
    let state: InstallmentState;
    if (paid >= upto) state = "paid";
    else if (dueAt !== null && now >= dueAt) state = "overdue";
    else if (paid > before) state = "partial";
    else state = "pending";
    rows.push({ number: k, dueAt: dueAt === null ? null : Number(dueAt), amount: upto - before, state });
  }
  return rows;
}

/** What a repayment form offers for a line at `now`. */
export type RepayFigures = {
  /** What to pay to be current: overdue installments plus the buffered late interest, else the next installment, else what remains. */
  dueNow: bigint;
  /** Late interest estimated now: a v2 repayment must cover at least this. 0 for v1. */
  lateDue: bigint;
  /** Late interest estimated a little ahead, so a payment in flight still covers it. 0 for v1. */
  lateDueBuffered: bigint;
  /** The most the program takes: remaining plus late interest (buffered). */
  payoff: bigint;
  /** True when late interest or due dates come from a clock estimate (a v2 line). */
  estimate: boolean;
  arrears: Arrears | null;
};

/** Seconds ahead used for the buffered late interest estimate. */
export const LATE_BUFFER_SECONDS = 300n;

export function repayFigures(line: LineView, graceSeconds: number, now: bigint): RepayFigures {
  const terms = scheduleTerms(line, graceSeconds);
  if (!terms) return { dueNow: line.remaining, lateDue: 0n, lateDueBuffered: 0n, payoff: line.remaining, estimate: false, arrears: null };
  const paid = line.principalRepaid + line.interestRepaid;
  const a = arrears(terms, paid, now);
  const buffered = arrears(terms, paid, now + LATE_BUFFER_SECONDS).lateDue;
  let principalAndInterest: bigint;
  if (a.overdue > 0n) principalAndInterest = a.overdue;
  else {
    const next = cumulativeDue(terms.total, terms.installments, Math.min(a.covered + 1, terms.installments)) - paid;
    principalAndInterest = min(line.remaining, next > 0n ? next : line.remaining);
  }
  // The program takes late interest at landing first, then interest and principal. "Due now" adds
  // the buffered late estimate, so paying exactly it still covers the overdue installments when
  // late interest has grown since render. Invariant: minimum (lateDueBuffered) <= dueNow <= payoff.
  const lateDueBuffered = max(buffered, a.lateDue);
  return {
    dueNow: principalAndInterest + lateDueBuffered,
    lateDue: a.lateDue,
    lateDueBuffered,
    payoff: line.remaining + lateDueBuffered,
    estimate: true,
    arrears: a,
  };
}
