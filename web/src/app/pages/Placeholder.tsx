import { useLang } from "../lang";
import { PageBody, PageHead } from "../Shell";

/** Pool, Invest and Borrow until their own tasks land: the page title and a short note. */
export function PlaceholderPage({ page }: { page: "pool" | "invest" | "borrow" }) {
  const { t } = useLang();
  const copy = t.app[page];
  return (
    <PageBody>
      <PageHead title={copy.title} sub={copy.sub} />
      <p className="m-0 rounded-[18px] border-[1.5px] border-dashed border-line bg-white p-5 text-[17px] text-ink-soft">
        {t.app.placeholder}
      </p>
    </PageBody>
  );
}
