import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  securityHeadersMiddleware,
  CSP_REPORT_ONLY_DIRECTIVES,
  CSP_REPORT_ONLY_HEADER_VALUE
} from '../server/securityHeaders.js';

describe('FASE 4.5B — Content Security Policy em Modo Report-Only', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  function runMiddleware(req: any, resHeaders: Record<string, string>): void {
    const res: any = {
      setHeader: (k: string, v: string) => {
        resHeaders[k] = v;
      }
    };
    const next = () => {};
    securityHeadersMiddleware(req, res, next);
  }

  describe('1. Comportamento Condicional de Ambiente (Dev vs Prod)', () => {
    it('1. production envia Content-Security-Policy-Report-Only', () => {
      process.env.NODE_ENV = 'production';
      try {
        const headers: Record<string, string> = {};
        runMiddleware({ path: '/app', secure: true, headers: {} }, headers);

        assert.ok(headers['Content-Security-Policy-Report-Only'], 'Deve enviar Content-Security-Policy-Report-Only em prod');
        assert.strictEqual(headers['Content-Security-Policy-Report-Only'], CSP_REPORT_ONLY_HEADER_VALUE);
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('2. production NÃO envia Content-Security-Policy bloqueante', () => {
      process.env.NODE_ENV = 'production';
      try {
        const headers: Record<string, string> = {};
        runMiddleware({ path: '/app', secure: true, headers: {} }, headers);

        assert.strictEqual(
          headers['Content-Security-Policy'],
          undefined,
          'NÃO deve enviar Content-Security-Policy bloqueante na Fase 4.5B'
        );
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('3. development NÃO recebe CSP de produção (preserva Vite HMR)', () => {
      process.env.NODE_ENV = 'development';
      try {
        const headers: Record<string, string> = {};
        runMiddleware({ path: '/app', secure: false, headers: {} }, headers);

        assert.strictEqual(
          headers['Content-Security-Policy-Report-Only'],
          undefined,
          'Ambiente de dev NÃO deve receber Content-Security-Policy-Report-Only'
        );
        assert.strictEqual(
          headers['Content-Security-Policy'],
          undefined,
          'Ambiente de dev NÃO deve receber Content-Security-Policy bloqueante'
        );
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });
  });

  describe('2. Integridade e Hardening das Diretivas de CSP', () => {
    function getDirective(name: string): string {
      const found = CSP_REPORT_ONLY_DIRECTIVES.find(d => d.startsWith(`${name} `) || d === name);
      assert.ok(found, `Diretiva ${name} deve existir`);
      return found;
    }

    it('4. script-src não contém unsafe-inline', () => {
      const scriptSrc = getDirective('script-src');
      assert.ok(!scriptSrc.includes("'unsafe-inline'"), 'script-src NÃO deve conter unsafe-inline');
    });

    it('5. script-src não contém unsafe-eval', () => {
      const scriptSrc = getDirective('script-src');
      assert.ok(!scriptSrc.includes("'unsafe-eval'"), 'script-src NÃO deve conter unsafe-eval');
    });

    it('6. style-src contém unsafe-inline (necessário para os 158 styles dinâmicos do React)', () => {
      const styleSrc = getDirective('style-src');
      assert.ok(styleSrc.includes("'unsafe-inline'"), 'style-src deve conter unsafe-inline nesta fase');
      assert.ok(styleSrc.includes('https://fonts.googleapis.com'), 'style-src deve conter fonts.googleapis.com');
    });

    it("7. object-src é 'none'", () => {
      const objectSrc = getDirective('object-src');
      assert.strictEqual(objectSrc, "object-src 'none'");
    });

    it("8. base-uri é 'self'", () => {
      const baseUri = getDirective('base-uri');
      assert.strictEqual(baseUri, "base-uri 'self'");
    });

    it('9. connect-src contém somente as origens realmente necessárias do Firebase e reCAPTCHA', () => {
      const connectSrc = getDirective('connect-src');
      assert.ok(connectSrc.includes("'self'"));
      assert.ok(connectSrc.includes('https://identitytoolkit.googleapis.com'));
      assert.ok(connectSrc.includes('https://securetoken.googleapis.com'));
      assert.ok(connectSrc.includes('https://firestore.googleapis.com'));
      assert.ok(connectSrc.includes('https://firebasestorage.googleapis.com'));
      assert.ok(connectSrc.includes('https://storage.googleapis.com'));
      assert.ok(connectSrc.includes('https://content-firebaseappcheck.googleapis.com'));
      assert.ok(connectSrc.includes('https://www.google.com/recaptcha/'));

      // Não usa coringas perigosos ou esquemas genéricos abertos
      const tokens = connectSrc.split(' ');
      assert.ok(!tokens.includes('*'), 'connect-src não deve usar wildcard * isolado');
      assert.ok(!tokens.includes('https:'), 'connect-src não deve usar esquema genérico https:');
      assert.ok(!tokens.includes('http:'), 'connect-src não deve usar esquema genérico http:');
    });

    it('10. api.mercadopago.com NÃO aparece na CSP do frontend', () => {
      const fullCsp = CSP_REPORT_ONLY_HEADER_VALUE;
      assert.ok(!fullCsp.includes('api.mercadopago.com'), 'api.mercadopago.com é exclusivo do backend');
    });

    it('11. sdk.mercadopago.com NÃO aparece na CSP', () => {
      const fullCsp = CSP_REPORT_ONLY_HEADER_VALUE;
      assert.ok(!fullCsp.includes('sdk.mercadopago.com'), 'sdk.mercadopago.com não é utilizado no frontend');
    });

    it('12. frame-ancestors contém as origens efetivamente necessárias para o preview', () => {
      const frameAncestors = getDirective('frame-ancestors');
      assert.ok(frameAncestors.includes("'self'"));
      assert.ok(frameAncestors.includes('https://*.run.app'));
      assert.ok(frameAncestors.includes('https://*.google.com'));
    });

    it('13. img-src contém https://ui-avatars.com (FASE 4.5D)', () => {
      const imgSrc = getDirective('img-src');
      assert.ok(imgSrc.includes('https://ui-avatars.com'), 'img-src deve conter https://ui-avatars.com');
      assert.ok(imgSrc.includes('https://images.unsplash.com'));
      assert.ok(imgSrc.includes('https://firebasestorage.googleapis.com'));
      assert.ok(imgSrc.includes('https://storage.googleapis.com'));
      assert.ok(imgSrc.includes('https://*.googleusercontent.com'));
    });

    it('14. https://ui-avatars.com NÃO aparece em script-src, connect-src, frame-src, style-src ou font-src', () => {
      const scriptSrc = getDirective('script-src');
      const connectSrc = getDirective('connect-src');
      const frameSrc = getDirective('frame-src');
      const styleSrc = getDirective('style-src');
      const fontSrc = getDirective('font-src');

      assert.ok(!scriptSrc.includes('ui-avatars.com'), 'script-src NÃO deve conter ui-avatars.com');
      assert.ok(!connectSrc.includes('ui-avatars.com'), 'connect-src NÃO deve conter ui-avatars.com');
      assert.ok(!frameSrc.includes('ui-avatars.com'), 'frame-src NÃO deve conter ui-avatars.com');
      assert.ok(!styleSrc.includes('ui-avatars.com'), 'style-src NÃO deve conter ui-avatars.com');
      assert.ok(!fontSrc.includes('ui-avatars.com'), 'font-src NÃO deve conter ui-avatars.com');
    });
  });

  describe('3. Coexistência com Demais Cabeçalhos e Endpoints', () => {
    it('13. X-Content-Type-Options continua presente', () => {
      const headers: Record<string, string> = {};
      runMiddleware({ path: '/', secure: true, headers: {} }, headers);
      assert.strictEqual(headers['X-Content-Type-Options'], 'nosniff');
    });

    it('14. X-Frame-Options continua presente', () => {
      const headers: Record<string, string> = {};
      runMiddleware({ path: '/', secure: true, headers: {} }, headers);
      assert.strictEqual(headers['X-Frame-Options'], 'SAMEORIGIN');
    });

    it('15. Referrer-Policy continua presente', () => {
      const headers: Record<string, string> = {};
      runMiddleware({ path: '/', secure: true, headers: {} }, headers);
      assert.strictEqual(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
    });

    it('16. Permissions-Policy continua presente', () => {
      const headers: Record<string, string> = {};
      runMiddleware({ path: '/', secure: true, headers: {} }, headers);
      assert.strictEqual(headers['Permissions-Policy'], 'camera=(), microphone=(), geolocation=()');
    });

    it('17. HSTS continua funcionando conforme implementação atual', () => {
      process.env.NODE_ENV = 'production';
      try {
        const headers: Record<string, string> = {};
        runMiddleware({ path: '/', secure: true, headers: {} }, headers);
        assert.strictEqual(headers['Strict-Transport-Security'], 'max-age=31536000; includeSubDomains');

        // Se secure for false, HSTS não é enviado
        const headersHttp: Record<string, string> = {};
        runMiddleware({ path: '/', secure: false, headers: {} }, headersHttp);
        assert.strictEqual(headersHttp['Strict-Transport-Security'], undefined);
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('18. Cache-Control de API é preservado em conjunto com a CSP', () => {
      process.env.NODE_ENV = 'production';
      try {
        const headers: Record<string, string> = {};
        runMiddleware({ path: '/api/appointments', secure: true, headers: {} }, headers);
        assert.ok(headers['Cache-Control']?.includes('no-store'));
        assert.ok(headers['Content-Security-Policy-Report-Only']);
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('19. CSP não interfere no readiness/liveness endpoint', () => {
      process.env.NODE_ENV = 'production';
      try {
        const headers: Record<string, string> = {};
        runMiddleware({ path: '/api/health/ready', secure: true, headers: {} }, headers);
        assert.strictEqual(headers['X-Content-Type-Options'], 'nosniff');
        assert.ok(headers['Content-Security-Policy-Report-Only']);
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });
  });
});
