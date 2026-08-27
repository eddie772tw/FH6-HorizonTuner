import React from 'react';
import ReactDOM from 'react-dom/client';
import 'halfmoon/css/halfmoon.min.css';
import 'halfmoon/css/cores/halfmoon.cores.css';
import './App.css';
import LiteApp from './LiteApp';
import { configureBackendTransport, waitForBackendReady } from './services/backend';

async function initLiteApp() {
  try {
    const backend = await waitForBackendReady();
    if (backend.state !== 'ready' || !backend.port) {
      throw new Error(backend.error || 'Backend did not report a listening port.');
    }
    configureBackendTransport(backend.port);
  } catch (error) {
    const root = document.getElementById('root');
    if (root) root.textContent = `Unable to connect to Lite backend. ${error instanceof Error ? error.message : String(error)}`;
    return;
  }

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode><LiteApp /></React.StrictMode>,
  );
}

initLiteApp();
