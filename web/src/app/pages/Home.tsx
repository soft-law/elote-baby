import { Link } from "react-router";
import { IconArrowRight, IconShop, IconUpload } from "../../icons";
import { useLang } from "../lang";
import { PageBody, PageHead } from "../Shell";

export function HomePage() {
  const { t, to } = useLang();
  const h = t.app.home;
  const roles = [
    { path: "/invest", card: h.invest, Icon: IconUpload, tone: "border-[1.5px] border-line bg-white" },
    { path: "/borrow", card: h.borrow, Icon: IconShop, tone: "bg-corn-100" },
  ];
  return (
    <PageBody>
      <PageHead title={h.title} sub={h.sub} />
      <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2">
        {roles.map(({ path, card, Icon, tone }) => (
          <li key={path}>
            <Link
              to={to(path)}
              className={`flex h-full min-h-[44px] flex-col gap-3 rounded-[24px] p-5 text-ink no-underline shadow-[var(--shadow-soft)] transition-shadow hover:shadow-[var(--shadow-glow)] md:p-7 ${tone}`}
            >
              <Icon size={32} className="text-teal-700" />
              <span className="font-display text-[24px] font-bold leading-tight md:text-[28px]">{card.title}</span>
              <span className="text-[17px] leading-[1.5] text-ink-soft">{card.body}</span>
              <IconArrowRight size={22} className="mt-auto text-teal-700" />
            </Link>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 text-[17px] text-ink-soft">{h.connectPrompt}</p>
        <div className="flex flex-wrap items-center gap-x-6">
          <Link to={to("/pool")} className="inline-flex min-h-[44px] items-center gap-2 font-display text-[17px] font-semibold text-teal-700">
            {h.poolLink}
            <IconArrowRight size={20} />
          </Link>
          <Link to={to("/launch")} className="inline-flex min-h-[44px] items-center gap-2 text-[17px] text-teal-700 underline decoration-teal-700/40 underline-offset-4 hover:decoration-teal-700">
            {h.launchLink}
          </Link>
        </div>
      </div>
    </PageBody>
  );
}
