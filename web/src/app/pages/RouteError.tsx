import { useEffect } from "react";
import { useRouteError } from "react-router";
import { useLang } from "../lang";
import { PageBody, PageHead } from "../Shell";

/** Per-route error boundary: the shell stays, the page shows a retry. */
export function RouteError() {
  const error = useRouteError();
  const { t } = useLang();
  const e = t.app.error;
  useEffect(() => {
    console.warn("route error", error);
  }, [error]);
  return (
    <PageBody>
      <div role="alert" className="flex flex-col gap-6">
        <PageHead title={e.title} sub={e.body} />
        <div>
          <button type="button" className="app-btn app-btn-teal" onClick={() => window.location.reload()}>
            {e.retry}
          </button>
        </div>
      </div>
    </PageBody>
  );
}
