import React from 'react';
import ReactDOM from 'react-dom/client';
import 'halfmoon/css/halfmoon.min.css';
import 'halfmoon/css/cores/halfmoon.cores.css';
import './App.css';
import { AppProviders } from './AppProviders';
import CompanionApp from './features/companion/CompanionApp';
import { configureCompanionTransport } from './services/backend';
import { applyThemeToDocument } from './context/themeDocument';
import { readCompanionThemeBootstrap } from './features/companion/companionTheme';

const bootstrap = readCompanionThemeBootstrap();
applyThemeToDocument(bootstrap.theme);
configureCompanionTransport();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<React.StrictMode><AppProviders companionTheme={bootstrap.theme}><CompanionApp themeGeneration={bootstrap.generation} /></AppProviders></React.StrictMode>);
