import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, Plugin} from 'vite';
import { resolveClientFirebaseConfig } from './src/lib/environmentConfig.js';

function sandboxBuildValidationPlugin(): Plugin {
  return {
    name: 'sandbox-build-validation',
    buildStart() {
      const appEnv = process.env.VITE_APP_ENV || process.env.APP_ENV;
      if (appEnv === 'sandbox') {
        // Validação estrita Fail-Closed no build: aborta imediatamente antes de produzir artefato
        resolveClientFirebaseConfig({ appEnv: 'sandbox' });
      }
    }
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), sandboxBuildValidationPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
