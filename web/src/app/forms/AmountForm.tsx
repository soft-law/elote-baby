// One amount, one transaction: the layout and behavior DepositForm and RedeemForm share.
//   - validation on blur and on submit, the message under the field (aria-describedby)
//   - on a failed submit, a focusable error summary at the top (role="alert", tabIndex=-1)
//   - a live preview whose floor is exactly what is sent (both come from `check`)
//   - while a transaction runs the button reads "Signing…" and the toast follows the steps
//   - while its result is pending (sent, not confirmed yet) the button stays disabled with a note,
//     so the same op cannot be sent twice; a confirmation that arrives later clears the field
//   - "Try again" in the toast returns here with fresh pool figures; it never resends by itself
// Below 768 px the submit row sticks to the bottom of the form so it stays reachable.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { format } from "../../pool/math";
import type { Copy } from "../../translations";
import type { PoolOp, PoolOpKind } from "../../tx/ops";
import type { UseTx } from "../../tx/useTx";
import { useTxToast } from "../toast/useTxToast";
import { isTxBusy } from "../txBusy";
import type { Checked, FieldError } from "./validation";

export type AmountFormProps = {
  /** Prefix for element ids and test ids: "deposit" or "redeem". */
  name: PoolOpKind;
  t: Copy;
  title: string;
  sub: string;
  label: string;
  /** Unit after the input, such as tMXN or shares. */
  unit: string;
  /** "Available: 1,000 tMXN test tokens" and the like; null while balances load. */
  available: ReactNode;
  maxText: string;
  maxLabel: string;
  /** Base units the Max button fills in; null hides it. */
  max: bigint | null;
  check: (input: string) => Checked;
  /** Preview for a valid amount; receives the same `expected` and `min` that are sent. */
  preview: (checked: Extract<Checked, { ok: true }>) => ReactNode;
  previewEmpty: string;
  /** Notes under the field (first deposit, liquidity cap). */
  notes?: ReactNode;
  errorText: (error: FieldError) => string;
  /** Why the form cannot send right now (paused, balances loading); the button is disabled. */
  blocked: boolean;
  submitText: string;
  toOp: (checked: Extract<Checked, { ok: true }>) => PoolOp;
  tx: UseTx;
  /** Level of the form title; h2 when the form sits under the page heading (default). */
  headingLevel?: "h2" | "h3" | "h4";
  /** The parent shows the transaction toast, because a confirmed run may unmount this form. */
  toastInParent?: boolean;
};

export function AmountForm(props: AmountFormProps) {
  const { name, t, tx, check } = props;
  const Heading = props.headingLevel ?? "h2";
  const queryClient = useQueryClient();
  const uid = useId();
  const inputId = `${name}-amount-${uid}`;
  const errorId = `${inputId}-error`;
  const previewId = `${inputId}-preview`;
  const titleId = `${inputId}-title`;
  const notesId = `${inputId}-notes`;
  const maxHintId = `${inputId}-max-hint`;
  const inputRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  const [input, setInput] = useState("");
  const [touched, setTouched] = useState(false);
  const [summary, setSummary] = useState(false);
  // Bumped on every failed submit so focus moves to the summary each time.
  const [failedSubmits, setFailedSubmits] = useState(0);

  const busy = isTxBusy(tx.step);
  const pending = tx.step === "pending";
  const pendingNoteId = `${inputId}-pending`;
  const checked = check(input);
  const showError = touched && !checked.ok;
  const error = !checked.ok ? checked.error : null;

  useEffect(() => {
    if (failedSubmits > 0) summaryRef.current?.focus();
  }, [failedSubmits]);

  // A result that was pending and is now confirmed: the amount went through, clear it as on a direct confirmation.
  const previousStep = useRef(tx.step);
  useEffect(() => {
    if (previousStep.current === "pending" && tx.step === "done") {
      setInput("");
      setTouched(false);
    }
    previousStep.current = tx.step;
  }, [tx.step]);

  // The summary goes away once the field is valid again.
  useEffect(() => {
    if (checked.ok) setSummary(false);
  }, [checked.ok]);

  useTxToast(tx, {
    op: name,
    t,
    enabled: !props.toastInParent,
    onRetry: () => {
      tx.reset();
      void queryClient.invalidateQueries({ queryKey: ["pool"] });
      void queryClient.invalidateQueries({ queryKey: ["balances"] });
      inputRef.current?.focus();
    },
  });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || props.blocked) return;
    setTouched(true);
    if (!checked.ok) {
      setSummary(true);
      setFailedSubmits((n) => n + 1);
      return;
    }
    setSummary(false);
    try {
      await tx.run(props.toOp(checked));
      setInput("");
      setTouched(false);
    } catch {
      // useTx keeps the typed error; the toast shows it with "Try again".
    }
  };

  const hasNotes = props.notes !== null && props.notes !== undefined && props.notes !== false;
  const describedBy = [showError ? errorId : null, previewId, hasNotes ? notesId : null].filter(Boolean).join(" ");

  return (
    <section aria-labelledby={titleId} className="flex h-full flex-col rounded-[24px] border-[1.5px] border-line bg-white shadow-[var(--shadow-soft)]">
      <form noValidate onSubmit={(e) => void onSubmit(e)} data-testid={`${name}-form`} className="flex h-full flex-col gap-4 p-5 md:p-7">
        <div className="flex flex-col gap-1.5">
          <Heading id={titleId} className="m-0 text-[24px] font-bold leading-tight md:text-[28px]">
            {props.title}
          </Heading>
          <p className="m-0 text-[17px] leading-[1.55] text-ink-soft">{props.sub}</p>
        </div>

        {summary && error ? (
          <div
            ref={summaryRef}
            role="alert"
            tabIndex={-1}
            data-testid={`${name}-error-summary`}
            className="rounded-[14px] border-[1.5px] border-chili-700/40 bg-chili-50 px-4 py-3 text-[16px] leading-[1.5] text-chili-700 outline-none focus-visible:ring-2 focus-visible:ring-chili-700"
          >
            <p className="m-0 font-semibold">{t.app.invest.errors.summary}</p>
            <ul className="m-0 mt-1 list-disc pl-5">
              <li>
                <a
                  href={`#${inputId}`}
                  onClick={(e) => {
                    e.preventDefault();
                    inputRef.current?.focus();
                  }}
                  className="inline-flex min-h-[44px] items-center text-chili-700 underline underline-offset-4"
                >
                  {props.label}: {props.errorText(error)}
                </a>
              </li>
            </ul>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
            <label htmlFor={inputId} className="font-display text-[17px] font-semibold">
              {props.label}
            </label>
            {props.available ? <span className="text-[15px] text-ink-soft">{props.available}</span> : null}
          </div>
          <div className="flex items-stretch gap-2">
            <div
              className={`flex min-h-[52px] min-w-0 flex-1 items-center rounded-[14px] border-[1.5px] bg-white px-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-teal-700 ${
                showError ? "border-chili-700" : "border-fog"
              }`}
            >
              <input
                ref={inputRef}
                id={inputId}
                name={`${name}-amount`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                placeholder="0.00"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onBlur={() => setTouched(input.trim() !== "" || touched)}
                aria-invalid={showError}
                aria-describedby={describedBy}
                className="num min-w-0 flex-1 border-0 bg-transparent py-2 text-[20px] text-ink outline-none"
              />
              <span aria-hidden="true" className="num pl-2 text-[15px] text-ink-soft">
                {props.unit}
              </span>
            </div>
            {props.max !== null ? (
              <button
                type="button"
                onClick={() => {
                  setInput(format(props.max ?? 0n));
                  setTouched(true);
                }}
                aria-describedby={maxHintId}
                data-testid={`${name}-max`}
                className="inline-flex min-h-[52px] min-w-[64px] items-center justify-center rounded-[14px] border-[1.5px] border-teal-700 bg-white px-4 font-display text-[16px] font-semibold text-teal-700 hover:bg-teal-50"
              >
                {props.maxText}
              </button>
            ) : null}
            {props.max !== null ? (
              <span id={maxHintId} className="sr-only">
                {props.maxLabel}
              </span>
            ) : null}
          </div>
          {showError && error ? (
            <p id={errorId} data-testid={`${name}-error`} className="m-0 text-[16px] leading-[1.5] text-chili-700">
              {props.errorText(error)}
            </p>
          ) : null}
          <p id={previewId} data-testid={`${name}-preview`} className="m-0 text-[16px] leading-[1.5] text-ink-soft">
            {checked.ok ? props.preview(checked) : props.previewEmpty}
          </p>
        </div>

        {hasNotes ? (
          <div id={notesId} data-testid={`${name}-notes`}>
            {props.notes}
          </div>
        ) : null}

        <div className="sticky bottom-[var(--fixed-stack-h,0px)] -mx-5 mt-auto bg-white/95 px-5 pt-2 pb-4 md:static md:mx-0 md:bg-transparent md:p-0">
          {pending ? (
            <p id={pendingNoteId} data-testid={`${name}-pending-note`} className="m-0 mb-2 text-[15px] leading-[1.5] text-ink-soft">
              {t.app.tx.pendingNote}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={props.blocked || busy}
            aria-busy={busy}
            aria-describedby={pending ? pendingNoteId : undefined}
            data-testid={`${name}-submit`}
            className="inline-flex min-h-[52px] w-full items-center justify-center rounded-[14px] bg-teal-700 px-5 font-display text-[18px] font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? t.app.tx.pendingButton : busy ? t.app.tx.signingButton : props.submitText}
          </button>
        </div>
      </form>
    </section>
  );
}
