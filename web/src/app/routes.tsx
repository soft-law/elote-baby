// Routes of the pool app, relative to the /app basename.
import type { RouteObject } from "react-router";
import { HomePage } from "./pages/Home";
import { InvestPage } from "./pages/Invest";
import { NotFoundPage } from "./pages/NotFound";
import { PlaceholderPage } from "./pages/Placeholder";
import { PoolPage } from "./pages/Pool";
import { RouteError } from "./pages/RouteError";
import { Shell } from "./Shell";

export const APP_BASENAME = "/app";

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <Shell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage />, errorElement: <RouteError /> },
      { path: "pool", element: <PoolPage />, errorElement: <RouteError /> },
      { path: "invest", element: <InvestPage />, errorElement: <RouteError /> },
      { path: "borrow", element: <PlaceholderPage page="borrow" />, errorElement: <RouteError /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];
