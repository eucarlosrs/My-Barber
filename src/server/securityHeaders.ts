import { Request, Response, NextFunction } from 'express';

/**
 * Diretivas canônicas da Content Security Policy (CSP) em modo Report-Only para Produção (FASE 4.5B).
 * Construídas como lista estruturada e legível, sem corrupção de string.
 */
export const CSP_REPORT_ONLY_DIRECTIVES: readonly string[] = [
  "default-src 'self'",
  "script-src 'self' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://apis.google.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://images.unsplash.com https://firebasestorage.googleapis.com https://storage.googleapis.com https://*.googleusercontent.com https://ui-avatars.com",
  "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://firebasestorage.googleapis.com https://storage.googleapis.com https://content-firebaseappcheck.googleapis.com https://www.google.com/recaptcha/",
  "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://apis.google.com https://www.google.com/recaptcha/ https://recaptcha.google.com/",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self' https://*.run.app https://*.google.com"
];

export const CSP_REPORT_ONLY_HEADER_VALUE = CSP_REPORT_ONLY_DIRECTIVES.join('; ');

/**
 * Middleware de Hardening de Segurança HTTP (FASE 4.4B & FASE 4.5B).
 * Injeta cabeçalhos de segurança padronizados diretamente no Express,
 * garantindo proteção uniforme em qualquer runtime (Cloud Run, Docker, Nginx ou dev).
 */
export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Previne MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Previne clickjacking mantendo compatibilidade de mesmo domínio
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // Política de referência segura
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Bloqueio de sensores não utilizados pela aplicação
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // Previne cache em respostas de API transacionais/dinâmicas
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }

  // HSTS: aplicado estritamente quando a conexão é comprovadamente HTTPS (req.secure validado pelo Express via TLS ou proxy confiável) em produção
  const isHttps = Boolean(req.secure);
  if (isHttps && process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // FASE 4.5B: Content-Security-Policy em modo REPORT-ONLY estritamente em Produção
  // Protege a integridade do ambiente de desenvolvimento (Vite HMR, WebSockets, módulos dinâmicos)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Content-Security-Policy-Report-Only', CSP_REPORT_ONLY_HEADER_VALUE);
  }

  next();
}
