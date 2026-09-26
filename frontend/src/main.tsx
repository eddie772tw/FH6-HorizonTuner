import React from "react";
import ReactDOM from "react-dom/client";
import "halfmoon/css/halfmoon.min.css";
import "halfmoon/css/cores/halfmoon.cores.css";
import App from "./App";
import { configureBackendTransport, waitForBackendReady } from "./services/backend";
import { initializeRuntimeCapabilities } from './services/runtimeCapabilities';

import { applyThemeEarly } from './app/applyThemeEarly';

applyThemeEarly();

async function initApp() {
  try {
    const backend = await waitForBackendReady();
    if (backend.state !== "ready" || !backend.port) {
      throw new Error(backend.error || "Backend did not report a listening port.");
    }

    configureBackendTransport(backend.port);
    await initializeRuntimeCapabilities();
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
