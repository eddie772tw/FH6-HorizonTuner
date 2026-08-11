import React from "react";
import ReactDOM from "react-dom/client";
import "halfmoon/css/halfmoon.min.css";
import "halfmoon/css/cores/halfmoon.cores.css";
import App from "./App";
import { configureBackendTransport, waitForBackendReady } from "./services/backend";

// Apply the saved theme before React renders to avoid a flash of the default theme.
(function applyThemeEarly() {
  try {
    const raw = localStorage.getItem("themeSettings");
    const saved = raw ? JSON.parse(raw) : null;
    document.documentElement.setAttribute("data-bs-theme", saved?.mode || "dark");
    document.documentElement.setAttribute("data-bs-core", saved?.halfmoonCore || "default");
    if (saved?.primaryColor) document.documentElement.style.setProperty("--primary", saved.primaryColor);
    if (saved?.secondaryColor) document.documentElement.style.setProperty("--secondary", saved.secondaryColor);
    if (saved?.accentColor) document.documentElement.style.setProperty("--accent", saved.accentColor);
  } catch {
    document.documentElement.setAttribute("data-bs-theme", "dark");
    document.documentElement.setAttribute("data-bs-core", "default");
  }
})();

async function initApp() {
  try {
    const backend = await waitForBackendReady();
    if (backend.state !== "ready" || !backend.port) {
      throw new Error(backend.error || "Backend did not report a listening port.");
    }

    configureBackendTransport(backend.port);
    console.log("Backend sidecar is ready on port:", backend.port);
  } catch (error) {
    console.error("Backend startup failed:", error);
    const root = document.getElementById("root");
    if (root) {
      root.textContent = `Unable to start the local backend. ${error instanceof Error ? error.message : String(error)}`;
    }
    return;
  }

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

initApp();
