import { Link } from "react-router";
import { useLang } from "../lang";
import { PageBody, PageHead } from "../Shell";

export function NotFoundPage() {
  const { t, to } = useLang();
  const n = t.app.notFound;
  return (
    <PageBody>
      <PageHead title={n.title} sub={n.body} />
      <div>
        <Link to={to("/pool")} className="app-btn app-btn-teal">
          {n.home}
        </Link>
      </div>
    </PageBody>
  );
}
