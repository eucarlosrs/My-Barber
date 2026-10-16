/**
 * Utilitário de encerramento gracioso (Graceful Shutdown) para o servidor HTTP do MY BARBER.
 * Isolado de server.ts para permitir testes unitários limpos sem levantar o servidor Vite em background.
 */
let isShuttingDown = false;

export function resetShutdownStateForTests() {
  isShuttingDown = false;
}

export function setupGracefulShutdown(server: any, timeoutMs: number = 10000) {
  const handleSignal = (signal: string) => {
    if (isShuttingDown) {
      console.log(`[GracefulShutdown] Sinal ${signal} recebido novamente. Aguardando encerramento em andamento...`);
      return;
    }
    isShuttingDown = true;
    console.log(`[GracefulShutdown] Sinal ${signal} recebido. Parando de aceitar novas requisições...`);

    // Forçar saída se as conexões demorarem mais que o timeout
    const forceExitTimer = setTimeout(() => {
      console.error(`[GracefulShutdown] Timeout de ${timeoutMs}ms excedido. Forçando encerramento.`);
      if (process.env.NODE_ENV !== 'test') {
        process.exit(1);
      }
    }, timeoutMs);

    if (forceExitTimer.unref) {
      forceExitTimer.unref();
    }

    if (server && typeof server.close === 'function') {
      server.close((err: any) => {
        clearTimeout(forceExitTimer);
        if (err) {
          console.error('[GracefulShutdown] Erro ao fechar servidor HTTP:', err);
          if (process.env.NODE_ENV !== 'test') {
            process.exit(1);
          }
          return;
        }
        console.log('[GracefulShutdown] Servidor HTTP fechado com sucesso.');
        if (process.env.NODE_ENV !== 'test') {
          process.exit(0);
        }
      });
    }
  };

  process.on('SIGTERM', () => handleSignal('SIGTERM'));
  process.on('SIGINT', () => handleSignal('SIGINT'));
}
