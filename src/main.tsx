import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ErrorBoundary} from './components/common/ErrorBoundary.tsx';
import {setupChunkLoadErrorHandler} from './utils/chunkLoadRecovery.ts';
import './index.css';

// FASE 4.7C: Hardening contra chunks obsoletos pós-deploy via listener de vite:preloadError
setupChunkLoadErrorHandler();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

