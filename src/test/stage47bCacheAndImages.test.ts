import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import express from 'express';

describe('FASE 4.7B — Cache HTTP e Otimização de Imagens', () => {
  const distPath = path.resolve(process.cwd(), 'dist');
  let testServer: http.Server;
  let testPort: number;

  before(async () => {
    // Cria servidor Express de teste replicando exatamente a montagem de produção de server.ts
    const app = express();

    // Simula middleware de securityHeaders para /api/
    app.use((req, res, next) => {
      if (req.path.startsWith('/api/')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      }
      next();
    });

    app.get('/api/health', (_req, res) => {
      res.json({ status: 'ok' });
    });

    // Configuração canônica de Cache HTTP de produção da Fase 4.7B
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`) || filePath.includes('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        }
      }
    }));

    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });

    await new Promise<void>((resolve) => {
      testServer = app.listen(0, '127.0.0.1', () => {
        const addr = testServer.address();
        if (typeof addr === 'object' && addr !== null) {
          testPort = addr.port;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      if (testServer) {
        testServer.close(() => resolve());
      } else {
        resolve();
      }
    });
  });

  it('1. GET / (index.html) retorna Cache-Control: no-cache, must-revalidate', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/`);
    assert.strictEqual(res.status, 200);
    const cacheControl = res.headers.get('cache-control');
    assert.ok(cacheControl, 'Cache-Control deve existir no index.html');
    assert.ok(cacheControl.includes('no-cache'), 'Deve conter no-cache');
    assert.ok(cacheControl.includes('must-revalidate'), 'Deve conter must-revalidate');
    assert.ok(!cacheControl.includes('immutable'), 'NÃO deve conter immutable em index.html');
    assert.ok(!cacheControl.includes('max-age=31536000'), 'NÃO deve ter max-age anual em index.html');
  });

  it('2. GET rota SPA qualquer (ex: /discovery) retorna index.html com no-cache, must-revalidate', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/discovery`);
    assert.strictEqual(res.status, 200);
    const cacheControl = res.headers.get('cache-control');
    assert.ok(cacheControl?.includes('no-cache'));
    assert.ok(cacheControl?.includes('must-revalidate'));
  });

  it('3. GET /assets/*.js versionado retorna Cache-Control: public, max-age=31536000, immutable', async () => {
    const assetsFiles = fs.readdirSync(path.join(distPath, 'assets'));
    const jsChunk = assetsFiles.find((f) => f.startsWith('index-') && f.endsWith('.js'));
    assert.ok(jsChunk, 'Deve existir um chunk index-*.js');

    const res = await fetch(`http://127.0.0.1:${testPort}/assets/${jsChunk}`);
    assert.strictEqual(res.status, 200);
    const cacheControl = res.headers.get('cache-control');
    assert.ok(cacheControl, 'Cache-Control deve existir para assets');
    assert.ok(cacheControl.includes('public'), 'Deve conter public');
    assert.ok(cacheControl.includes('max-age=31536000'), 'Deve conter max-age=31536000');
    assert.ok(cacheControl.includes('immutable'), 'Deve conter immutable');
  });

  it('4. GET /assets/*.css versionado retorna Cache-Control: public, max-age=31536000, immutable', async () => {
    const assetsFiles = fs.readdirSync(path.join(distPath, 'assets'));
    const cssChunk = assetsFiles.find((f) => f.endsWith('.css'));
    assert.ok(cssChunk, 'Deve existir um chunk css');

    const res = await fetch(`http://127.0.0.1:${testPort}/assets/${cssChunk}`);
    assert.strictEqual(res.status, 200);
    const cacheControl = res.headers.get('cache-control');
    assert.ok(cacheControl?.includes('immutable'));
    assert.ok(cacheControl?.includes('max-age=31536000'));
  });

  it('5. GET /assets/*.webp retorna Cache-Control: public, max-age=31536000, immutable', async () => {
    const assetsFiles = fs.readdirSync(path.join(distPath, 'assets'));
    const webpFile = assetsFiles.find((f) => f.endsWith('.webp'));
    assert.ok(webpFile, 'Deve existir arquivo .webp em dist/assets');

    const res = await fetch(`http://127.0.0.1:${testPort}/assets/${webpFile}`);
    assert.strictEqual(res.status, 200);
    const cacheControl = res.headers.get('cache-control');
    assert.ok(cacheControl?.includes('immutable'));
    assert.ok(cacheControl?.includes('max-age=31536000'));
  });

  it('6. GET /api/health NÃO recebe immutable e mantém política no-store', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/api/health`);
    assert.strictEqual(res.status, 200);
    const cacheControl = res.headers.get('cache-control');
    assert.ok(cacheControl, 'Cache-Control deve existir');
    assert.ok(cacheControl.includes('no-store'), 'Deve conter no-store');
    assert.ok(!cacheControl.includes('immutable'), 'NÃO deve conter immutable');
    assert.ok(!cacheControl.includes('max-age=31536000'), 'NÃO deve conter max-age anual');
  });

  it('7. src/data/assets.ts importa exclusivamente arquivos WebP', () => {
    const assetsCode = fs.readFileSync(path.resolve(process.cwd(), 'src/data/assets.ts'), 'utf-8');
    assert.match(assetsCode, /\.webp['"];/g);
    assert.doesNotMatch(assetsCode, /\.jpg['"];/g);
    assert.doesNotMatch(assetsCode, /\.jpeg['"];/g);
  });

  it('8. Todas as 6 imagens essenciais possuem formato WebP e estão em dist/assets', () => {
    const assetsFiles = fs.readdirSync(path.join(distPath, 'assets'));
    const requiredImages = [
      'barbershop_banner',
      'barber_logo',
      'barber_felipe',
      'barber_diego',
      'haircut_fade',
      'barber_products'
    ];

    for (const imgName of requiredImages) {
      const found = assetsFiles.some((f) => f.includes(imgName) && f.endsWith('.webp'));
      assert.ok(found, `Imagem ${imgName} em formato .webp deve existir em dist/assets`);
    }
  });

  it('9. Nenhuma das 6 imagens legadas em .jpg foi empacotada em dist/assets', () => {
    const assetsFiles = fs.readdirSync(path.join(distPath, 'assets'));
    const jpgFiles = assetsFiles.filter((f) => f.endsWith('.jpg') || f.endsWith('.jpeg'));
    assert.strictEqual(jpgFiles.length, 0, 'Nenhum .jpg deve existir em dist/assets');
  });
});
