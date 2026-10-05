import React from 'react';
import { createRoot } from 'react-dom/client';
import 'halfmoon/css/halfmoon.min.css';
import 'halfmoon/css/cores/halfmoon.cores.css';
import { SettingsProvider } from '../../../../../context/SettingsContext';
import { ToastProvider } from '../../../../../context/ToastContext';
import { configureBackendTransport } from '../../../../../services/backend';
import { OverlayView } from '../../../OverlayView';

// Real settings page and config owner. Only HTTP/native surroundings are fixtures.
configureBackendTransport(Number(window.location.port));
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider><SettingsProvider><OverlayView /></SettingsProvider></ToastProvider>
  </React.StrictMode>,
);
