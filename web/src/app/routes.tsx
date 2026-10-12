// Routes of the pool app, relative to the /app basename.
import { Navigate, useLocation, type RouteObject } from "react-router";
import { BorrowPage } from "./pages/Borrow";
import { InvestPage } from "./pages/Invest";
import { LaunchPage } from "./pages/Launch";
import { NotFoundPage } from "./pages/NotFound";
import { PoolPage } from "./pages/Pool";
import { RouteError } from "./pages/RouteError";
import { Shell } from "./Shell";

export const APP_BASENAME = "/app";

/** The app opens on the pool; the query (?lang=es) comes along. */
export function IndexRedirect() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: "/pool", search }} replace />;
}

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <Shell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <IndexRedirect /> },
      { path: "pool", element: <PoolPage />, errorElement: <RouteError /> },
      { path: "invest", element: <InvestPage />, errorElement: <RouteError /> },
      { path: "borrow", element: <BorrowPage />, errorElement: <RouteError /> },
      { path: "launch", element: <LaunchPage />, errorElement: <RouteError /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];
