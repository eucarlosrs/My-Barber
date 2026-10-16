import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  CHUNK_RECOVERY_STORAGE_KEY,
  isChunkLoadError,
  hasAttemptedRecovery,
  resetChunkRecovery,
  attemptChunkRecovery,
  setupChunkLoadErrorHandler,
} from '../utils/chunkLoadRecovery';

// Mock de ambiente de navegador para testes unitários em Node.js
class MockSessionStorage {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get rawStore(): Map<string, string> {
    return this.store;
  }
}

describe('FASE 4.7C — Hardening de Stale Chunks e Recuperação Pós-Deploy', () => {
  let mockStorage: MockSessionStorage;
  let reloadCount: number;
  let mockWindow: any;

  beforeEach(() => {
    mockStorage = new MockSessionStorage();
    reloadCount = 0;

    mockWindow = {
      sessionStorage: mockStorage,
      location: {
        reload: () => {
          reloadCount++;
        },
        href: 'https://mybarber.app/',
      },
      listeners: new Map<string, Function[]>(),
      addEventListener(event: string, fn: Function) {
        if (!this.listeners.has(event)) {
          this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(fn);
      },
      removeEventListener(event: string, fn: Function) {
        const list = this.listeners.get(event) || [];
        this.listeners.set(
          event,
          list.filter((f: Function) => f !== fn)
        );
      },
      dispatchEvent(event: any) {
        const list = this.listeners.get(event.type) || [];
        for (const fn of list) {
          fn(event);
        }
      },
      setTimeout: (fn: Function) => setTimeout(fn, 10),
      clearTimeout: (id: any) => clearTimeout(id),
    };

    (global as any).window = mockWindow;
  });

  // =========================================================================
  // 1. DETECÇÃO DE CHUNK LOAD ERROR / PRELOAD ERROR
  // =========================================================================
  describe('1. Detecção de Erros de Chunks e Dynamic Imports', () => {
    it('1.1. Detecta erro clássico com name = "ChunkLoadError"', () => {
      const error = new Error('Loading chunk 4 failed');
      error.name = 'ChunkLoadError';
      assert.strictEqual(isChunkLoadError(error), true);
    });

    it('1.2. Detecta erro do Chrome/V8: "Failed to fetch dynamically imported module"', () => {
      const error = new TypeError('Failed to fetch dynamically imported module: https://mybarber.app/assets/WebAdminView-Bsdjn15P.js');
      assert.strictEqual(isChunkLoadError(error), true);
    });

    it('1.3. Detecta erro do Firefox: "error loading dynamically imported module"', () => {
      const error = new Error('error loading dynamically imported module: https://mybarber.app/assets/MasterAdminView-BMAVasvt.js');
      assert.strictEqual(isChunkLoadError(error), true);
    });

    it('1.4. Detecta erro do Safari/WebKit: "Importing a module script failed"', () => {
      const error = new TypeError('Importing a module script failed.');
      assert.strictEqual(isChunkLoadError(error), true);
    });

    it('1.5. Detecta erro genérico de script de módulo: "Failed to load module script"', () => {
      const error = new Error('Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of text/html');
      assert.strictEqual(isChunkLoadError(error), true);
    });

    it('1.6. Detecta evento direto do Vite: { type: "vite:preloadError" }', () => {
      const event = { type: 'vite:preloadError', payload: new Error('Preload failure') };
      assert.strictEqual(isChunkLoadError(event), true);
    });

    it('1.7. NÃO detecta erros não relacionados a chunks/módulos', () => {
      assert.strictEqual(isChunkLoadError(new ReferenceError('barbershop is not defined')), false);
      assert.strictEqual(isChunkLoadError(new TypeError('Cannot read properties of null (reading "role")')), false);
      assert.strictEqual(isChunkLoadError(new Error('FirebaseError: Missing or insufficient permissions.')), false);
      assert.strictEqual(isChunkLoadError(null), false);
      assert.strictEqual(isChunkLoadError(undefined), false);
      assert.strictEqual(isChunkLoadError({}), false);
    });
  });

  // =========================================================================
  // 2. RECUPERAÇÃO E PROTEÇÃO CONTRA LOOP INFINITO
  // =========================================================================
  describe('2. Comportamento da Recuperação e Prevenção de Loop Infinito', () => {
    it('2.1. Primeira falha dispara exatamente 1 reload e marca o sessionStorage', () => {
      assert.strictEqual(hasAttemptedRecovery(), false);

      const recovered = attemptChunkRecovery(new Error('Failed to fetch dynamically imported module'));
      assert.strictEqual(recovered, true, 'Recuperação inicial deve retornar true');
      assert.strictEqual(reloadCount, 1, 'window.location.reload() deve ser chamado exatamente uma vez');
      assert.strictEqual(hasAttemptedRecovery(), true, 'Marcador técnico deve ser gravado no sessionStorage');
      assert.strictEqual(mockStorage.getItem(CHUNK_RECOVERY_STORAGE_KEY), 'true');
    });

    it('2.2. Segunda falha consecutiva NÃO dispara novo reload (impede loop infinito)', () => {
      // Primeira tentativa (simulando estado já marcado)
      mockStorage.setItem(CHUNK_RECOVERY_STORAGE_KEY, 'true');

      const recovered = attemptChunkRecovery(new Error('Failed to fetch dynamically imported module'));
      assert.strictEqual(recovered, false, 'Segunda tentativa deve retornar false');
      assert.strictEqual(reloadCount, 0, 'window.location.reload() NÃO deve ser chamado novamente');
    });

    it('2.3. resetChunkRecovery() limpa o marcador de sessão', () => {
      mockStorage.setItem(CHUNK_RECOVERY_STORAGE_KEY, 'true');
      assert.strictEqual(hasAttemptedRecovery(), true);

      resetChunkRecovery();
      assert.strictEqual(hasAttemptedRecovery(), false);
      assert.strictEqual(mockStorage.getItem(CHUNK_RECOVERY_STORAGE_KEY), null);
    });
  });

  // =========================================================================
  // 3. SEGURANÇA E HIGIENE DO STORAGE TÉCNICO
  // =========================================================================
  describe('3. Ausência de Dados Sensíveis no Storage Técnico', () => {
    it('3.1. O storage técnico grava estritamente a chave técnica permitida', () => {
      attemptChunkRecovery();
      const keys = Array.from(mockStorage.rawStore.keys());

      assert.deepStrictEqual(keys, [CHUNK_RECOVERY_STORAGE_KEY]);
      assert.strictEqual(mockStorage.getItem(CHUNK_RECOVERY_STORAGE_KEY), 'true');
    });

    it('3.2. Não há vazamento de tokens, senhas, UIDs, tenants, PII ou dados financeiros', () => {
      attemptChunkRecovery();

      for (const [key, value] of mockStorage.rawStore.entries()) {
        const lowerKey = key.toLowerCase();
        const lowerVal = value.toLowerCase();

        assert.strictEqual(lowerKey.includes('token'), false);
        assert.strictEqual(lowerKey.includes('auth'), false);
        assert.strictEqual(lowerKey.includes('password'), false);
        assert.strictEqual(lowerKey.includes('tenant'), false);
        assert.strictEqual(lowerKey.includes('user'), false);
        assert.strictEqual(lowerKey.includes('uid'), false);

        assert.strictEqual(lowerVal.includes('bearer'), false);
        assert.strictEqual(lowerVal.includes('eyJ'), false); // JWT pattern
        assert.strictEqual(lowerVal, 'true');
      }
    });
  });

  // =========================================================================
  // 4. LISTENER OFICIAL DO VITE (vite:preloadError)
  // =========================================================================
  describe('4. Integração com o Evento vite:preloadError', () => {
    it('4.1. Registra o listener e intercepta vite:preloadError com sucesso', () => {
      const cleanup = setupChunkLoadErrorHandler();

      let defaultPrevented = false;
      const fakeViteEvent = {
        type: 'vite:preloadError',
        cancelable: true,
        payload: new Error('Failed to fetch dynamically imported module'),
        preventDefault() {
          defaultPrevented = true;
        },
      };

      mockWindow.dispatchEvent(fakeViteEvent);

      assert.strictEqual(reloadCount, 1, 'Deve disparar reload no primeiro evento vite:preloadError');
      assert.strictEqual(defaultPrevented, true, 'Deve chamar preventDefault() na recuperação com sucesso');
      assert.strictEqual(mockStorage.getItem(CHUNK_RECOVERY_STORAGE_KEY), 'true');

      cleanup();
    });

    it('4.2. Se já houve recuperação, vite:preloadError não previne default e delega ao erro', () => {
      mockStorage.setItem(CHUNK_RECOVERY_STORAGE_KEY, 'true');
      const cleanup = setupChunkLoadErrorHandler();

      let defaultPrevented = false;
      const fakeViteEvent = {
        type: 'vite:preloadError',
        cancelable: true,
        payload: new Error('Failed to fetch dynamically imported module'),
        preventDefault() {
          defaultPrevented = true;
        },
      };

      mockWindow.dispatchEvent(fakeViteEvent);

      assert.strictEqual(reloadCount, 0, 'Não deve recarregar');
      assert.strictEqual(defaultPrevented, false, 'Não deve chamar preventDefault() quando esgotado');

      cleanup();
    });

    it('4.3. Cleanup remove o listener de forma limpa', () => {
      const cleanup = setupChunkLoadErrorHandler();
      assert.strictEqual(mockWindow.listeners.get('vite:preloadError')?.length, 1);

      cleanup();
      assert.strictEqual(mockWindow.listeners.get('vite:preloadError')?.length, 0);
    });
  });

  // =========================================================================
  // 5. INSPEÇÃO ESTÁTICA DO App.tsx, ErrorBoundary.tsx e main.tsx
  // =========================================================================
  describe('5. Auditoria de Código e Preservação de Autorização', () => {
    const mainPath = path.resolve(process.cwd(), 'src/main.tsx');
    const mainContent = fs.readFileSync(mainPath, 'utf-8');

    const ebPath = path.resolve(process.cwd(), 'src/components/common/ErrorBoundary.tsx');
    const ebContent = fs.readFileSync(ebPath, 'utf-8');

    const appPath = path.resolve(process.cwd(), 'src/App.tsx');
    const appContent = fs.readFileSync(appPath, 'utf-8');

    it('5.1. main.tsx invoca setupChunkLoadErrorHandler() antes do render', () => {
      assert.match(
        mainContent,
        /setupChunkLoadErrorHandler\(\)/,
        'main.tsx deve inicializar setupChunkLoadErrorHandler()'
      );
    });

    it('5.2. ErrorBoundary.tsx importa e utiliza utilitários de chunk recovery', () => {
      assert.match(
        ebContent,
        /import\s*\{[^}]*isChunkLoadError[^}]*\}\s*from\s*['"]\.\.\/\.\.\/utils\/chunkLoadRecovery['"]/,
        'ErrorBoundary deve importar isChunkLoadError'
      );
      assert.match(
        ebContent,
        /isChunkLoadError\(error\)/,
        'ErrorBoundary deve verificar se o erro capturado é chunk load error'
      );
      assert.match(
        ebContent,
        /resetChunkRecovery\(\)/,
        'ErrorBoundary deve resetar o marcador em handleReload/handleReset'
      );
    });

    it('5.3. App.tsx mantém isolamento e lazy loading estrito dos 4 módulos', () => {
      assert.match(appContent, /const\s+MasterAdminView\s*=\s*lazy\(/);
      assert.match(appContent, /const\s+WebAdminView\s*=\s*lazy\(/);
      assert.match(appContent, /const\s+ProfessionalAppView\s*=\s*lazy\(/);
      assert.match(appContent, /const\s+ArchitectureView\s*=\s*lazy\(/);
    });

    it('5.4. App.tsx preserva intacta a autorização de MasterAdminView por Custom Claims', () => {
      // isSuperAdmin deve ser derivado exclusivamente dos claims
      assert.match(appContent, /const\s+isSuperAdmin\s*=\s*Boolean\(authClaims\?\.isSuperAdmin\s*\|\|\s*authClaims\?\.role\s*===\s*'super_admin'\)/);
      // Rota MASTER_ADMIN deve barrar quem não for super admin
      assert.match(appContent, /case\s+'MASTER_ADMIN':\s*\n\s*\/\/[^\n]*\n\s*if\s*\(!isSuperAdmin\)\s*\{\s*return\s*<StaffLoginView\s*\/>;\s*\}/);
    });

    it('5.5. App.tsx preserva intacta a autorização de WebAdminView', () => {
      assert.match(appContent, /case\s+'WEBADMIN':\s*\n\s*\/\/[^\n]*\n\s*if\s*\(effectiveRole\s*!==\s*'PROPRIETARIO'\s*&&\s*effectiveRole\s*!==\s*'GERENTE'\s*&&\s*!isSuperAdmin\)\s*\{\s*return\s*<StaffLoginView\s*\/>;\s*\}/);
    });

    it('5.6. App.tsx preserva intacta a autorização de ProfessionalAppView', () => {
      assert.match(appContent, /case\s+'PROFISSIONAL_APP':\s*\n\s*\/\/[^\n]*\n\s*if\s*\(effectiveRole\s*!==\s*'PROFISSIONAL'\s*&&\s*!isSuperAdmin\)\s*\{\s*return\s*<StaffLoginView\s*\/>;\s*\}/);
    });
  });
});
