import "./support/dom";
import { describe, expect, test } from "bun:test";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { EmptyState } from "../src/app/components/EmptyState";
import { Loader } from "../src/app/components/Loader";
import { Modal } from "../src/app/components/Modal";
import { SectionHead } from "../src/app/components/SectionHead";
import { SkeletonCard, SkeletonGrid } from "../src/app/components/SkeletonCard";
import { StatCard } from "../src/app/components/StatCard";

describe("shared components", () => {
  test("StatCard shows label, value, unit and hint", () => {
    const html = renderToString(<StatCard label="Liquidity" value="10,000" unit="tMXN" hint="On hand" />);
    for (const s of ["Liquidity", "10,000", "tMXN", "On hand"]) expect(html).toContain(s);
  });

  test("SectionHead renders an h2 with the given id", () => {
    const html = renderToString(<SectionHead id="x-title" title="Lines" sub="All of them" />);
    expect(html).toContain('<h2 id="x-title"');
    expect(html).toContain("All of them");
  });

  test("EmptyState shows its action", () => {
    const html = renderToString(<EmptyState title="Nothing yet" action={<a href="/x">Go</a>} />);
    expect(html).toContain("Nothing yet");
    expect(html).toContain('href="/x"');
  });

  test("Loader speaks its label; skeletons are hidden from assistive tech", () => {
    expect(renderToString(<Loader label="Loading" />)).toContain('role="status"');
    expect(renderToString(<Loader label="Loading" />)).toContain("Loading");
    expect(renderToString(<SkeletonCard />)).toContain('aria-hidden="true"');
    expect(renderToString(<SkeletonGrid count={2} />).match(/data-skeleton/g)).toHaveLength(2);
  });

  test("the shimmer runs only without a reduced-motion preference", async () => {
    const css = await Bun.file(new URL("../src/index.css", import.meta.url)).text();
    const at = css.indexOf(".skeleton {");
    expect(at).toBeGreaterThan(-1);
    expect(css.lastIndexOf("@media (prefers-reduced-motion: no-preference)", at)).toBeGreaterThan(-1);
  });

  test("Modal: a labelled dialog that closes on Escape and returns focus to its opener", async () => {
    let closes = 0;
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" id="opener" onClick={() => setOpen(true)}>
            open
          </button>
          {open ? (
            <Modal
              title="Details"
              closeLabel="Close"
              onClose={() => {
                closes += 1;
                setOpen(false);
              }}
            >
              <button type="button">inside</button>
            </Modal>
          ) : null}
        </>
      );
    }
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<Host />));
    const opener = document.getElementById("opener") as unknown as HTMLButtonElement;
    opener.focus();
    await act(async () => opener.click());

    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const labelledBy = dialog.getAttribute("aria-labelledby")!;
    expect(document.getElementById(labelledBy)?.textContent).toBe("Details");
    expect(dialog.querySelector('[aria-label="Close"]')).not.toBeNull();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close");
    expect(document.body.style.overflow).toBe("hidden");

    await act(async () => {
      document.dispatchEvent(new (window as unknown as { KeyboardEvent: typeof KeyboardEvent }).KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(closes).toBe(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe("");
    await act(async () => root.unmount());
    host.remove();
  });
});
