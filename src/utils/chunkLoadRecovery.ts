/**
 * MY BARBER — Mecanismo de Recuperação de Chunks Stale (Pós-Deploy)
 * FASE 4.7C: Hardening contra ChunkLoadError / Vite preloadError após novas publicações.
 *
 * Garante que:
 * 1. Falhas de carregamento de módulos lazy (ex: assets hashados removidos no servidor pós-deploy)
 *    disparem uma única atualização da página para carregar o novo index.html e novos hashes.
 * 2. Proteção contra loop infinito: utiliza um marcador técnico simples em sessionStorage (máx 1 tentativa).
 * 3. Nenhum dado sensível (token, UID, tenant, senha, PII) é armazenado.
 * 4. Se a falha persistir após 1 tentativa, delega o controle para o ErrorBoundary.
 */

export const CHUNK_RECOVERY_STORAGE_KEY = 'mybarber_chunk_recovery_attempted';

/**
 * Identifica se um determinado erro decorre de falha ao baixar um chunk ou módulo dinâmico.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;

  // Se for evento de preload do Vite ou objeto com payload
  if (typeof error === 'object' && error !== null) {
    const errObj = error as Record<string, unknown>;
    if (errObj.type === 'vite:preloadError') {
      return true;
    }
  }

  const err = error as { name?: string; message?: string; stack?: string };
  const name = typeof err.name === 'string' ? err.name : '';
  const message = typeof err.message === 'string' ? err.message : '';
  const stack = typeof err.stack === 'string' ? err.stack : '';

  if (name === 'ChunkLoadError') {
    return true;
  }

  const targetText = `${name} ${message} ${stack}`.toLowerCase();

  return (
    targetText.includes('failed to fetch dynamically imported module') ||
    targetText.includes('error loading dynamically imported module') ||
    targetText.includes('importing a module script failed') ||
    targetText.includes('loading chunk') ||
    targetText.includes('failed to load module script') ||
    targetText.includes('preload error')
  );
}

/**
 * Verifica se já houve uma tentativa de recuperação automática de chunk nesta sessão.
 */
export function hasAttemptedRecovery(): boolean {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return false;
    }
    return window.sessionStorage.getItem(CHUNK_RECOVERY_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Remove o marcador de recuperação, permitindo novas recuperações futuras.
 */
export function resetChunkRecovery(): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(CHUNK_RECOVERY_STORAGE_KEY);
    }
  } catch {
    // Falha silenciosa no acesso ao storage
  }
}

/**
 * Tenta recuperar a aplicação recarregando a página uma única vez.
 * Retorna true se a recuperação foi acionada (reload agendado/executado).
 * Retorna false se a recuperação já foi tentada anteriormente (evitando loop infinito).
 */
export function attemptChunkRecovery(error?: unknown): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  if (hasAttemptedRecovery()) {
    console.warn(
      '[MY BARBER] Recuperação automática de chunk já foi tentada nesta sessão. Delegando ao ErrorBoundary para evitar loop infinito.',
      error
    );
    return false;
  }

  try {
    if (window.sessionStorage) {
      window.sessionStorage.setItem(CHUNK_RECOVERY_STORAGE_KEY, 'true');
    }
  } catch (e) {
    console.warn('[MY BARBER] Não foi possível persistir marcador técnico em sessionStorage:', e);
  }

  console.info(
    '[MY BARBER] Falha detectada no carregamento de chunk dinâmico (possível nova versão após deploy). Recarregando aplicação...'
  );

  try {
    window.location.reload();
  } catch {
    // Fallback caso reload lance exceção em ambiente de teste
    if (typeof window.location?.href === 'string') {
      window.location.href = window.location.href;
    }
  }

  return true;
}

/**
 * Registra o listener oficial do Vite para erros de preload de módulos dinâmicos (vite:preloadError).
 * Retorna função de cleanup para remoção do listener.
 */
export function setupChunkLoadErrorHandler(): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const preloadListener = (event: Event) => {
    const customEvent = event as CustomEvent | (Event & { payload?: unknown });
    const payload = 'payload' in customEvent ? customEvent.payload : customEvent;

    const recovered = attemptChunkRecovery(payload);
    if (recovered && event.cancelable) {
      event.preventDefault();
    }
  };

  window.addEventListener('vite:preloadError', preloadListener);

  // Se a aplicação permanecer estável e em execução por mais de 15 segundos após carregamento,
  // limpa o marcador para que eventuais novos deploys durante sessões muito longas possam se recuperar.
  let cleanupTimer: any = null;
  if (typeof window.setTimeout === 'function') {
    cleanupTimer = window.setTimeout(() => {
      resetChunkRecovery();
    }, 15000);
  }

  return () => {
    window.removeEventListener('vite:preloadError', preloadListener);
    if (cleanupTimer && typeof window.clearTimeout === 'function') {
      window.clearTimeout(cleanupTimer);
    }
  };
}
