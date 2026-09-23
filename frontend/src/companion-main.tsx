import React from 'react';
import ReactDOM from 'react-dom/client';
import 'halfmoon/css/halfmoon.min.css';
import 'halfmoon/css/cores/halfmoon.cores.css';
import './App.css';
import { AppProviders } from './AppProviders';
import CompanionApp from './features/companion/CompanionApp';
import { configureCompanionTransport } from './services/backend';
import { applyThemeEarly } from './app/applyThemeEarly';

applyThemeEarly();
configureCompanionTransport();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<React.StrictMode><AppProviders><CompanionApp /></AppProviders></React.StrictMode>);
