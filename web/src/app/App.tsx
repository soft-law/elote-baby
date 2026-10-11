// The pool app. Validates the configuration first; a bad config blocks with a configuration
// screen instead of talking to an RPC or a pool that is not the intended one.
import { useMemo } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import { readAppConfig } from "./config";
import { ConfigScreen } from "./ConfigScreen";
import { ConfigContext } from "./configContext";
import { AppProviders } from "./providers";
import { APP_BASENAME, routes } from "./routes";

// One router per page load. createBrowserRouter subscribes to popstate as soon as it is created,
// so it must not live in a hook that StrictMode runs twice.
let router: ReturnType<typeof createBrowserRouter> | undefined;
function getRouter() {
  return (router ??= createBrowserRouter(routes, { basename: APP_BASENAME }));
}

export function App() {
  const result = useMemo(() => readAppConfig(import.meta.env), []);

  // Variable names are shown only in development; the public page stays generic.
  if (!result.ok) return <ConfigScreen problems={result.problems} showDetails={import.meta.env.DEV} />;
  return (
    <ConfigContext.Provider value={result.config}>
      <AppProviders config={result.config}>
        <RouterProvider router={getRouter()} />
      </AppProviders>
    </ConfigContext.Provider>
  );
}
