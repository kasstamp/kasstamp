// IMPORTANT: Initialize logger configuration FIRST, before any other imports
import { initializeLoggers } from './config/logger.config';
initializeLoggers();

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

const rootElement = document.getElementById('root') as HTMLElement;

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
