// Entry of the pool app (app.html, served under /app). Rendered in the browser only: the app is
// never prerendered, so this is createRoot and never hydrateRoot.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import "./app.css";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
