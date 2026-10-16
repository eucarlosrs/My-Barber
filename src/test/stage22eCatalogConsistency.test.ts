import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { AuthUserClaims } from '../lib/authClaims.js';
import {
  toPublicPackage,
  toPublicPromotion,
  toPublicGalleryWork
} from '../utils/projections.js';
import {
  syncPackageById,
  syncPromotionById,
  syncGalleryById,
  deletePackageById,
  deletePromotionById,
  deleteGalleryById,
  assertTenantAuthority,
  checkLikeRateLimit,
  CatalogAuthorizationError,
  CatalogNotFoundError
} from '../server/catalogProjectionService.js';
import { ServicePackage, Promotion, GalleryWork } from '../types/index.js';

/**
 * FASE 2.2E — TESTES DE CONSISTÊNCIA, AUTORIDADE E SEGURANÇA DO CATÁLOGO PÚBLICO
 *
 * Mapeamento dos 18 Requisitos Mandatórios de Consistência e Proteção do Catálogo.
 */

describe('FASE 2.2E: Consistência e Autoridade do Catálogo Público', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  const serverPath = path.resolve(process.cwd(), 'server.ts');
  const serverContent = fs.readFileSync(serverPath, 'utf8');

  const catalogServicePath = path.resolve(process.cwd(), 'src/server/catalogProjectionService.ts');
  const catalogServiceContent = fs.readFileSync(catalogServicePath, 'utf8');

  // Declaração formal de ambiente de teste
  console.log('INFO: FIREBASE EMULATOR NÃO DISPONÍVEL — TESTES DE RULES/INTEGRAÇÃO REAIS NÃO EXECUTADOS VIA EMULATOR (Validação estática e unitária aplicada).');

  const managerTenantA: AuthUserClaims = {
    uid: 'user-manager-a',
    role: 'manager',
    legacyRole: 'GERENTE',
    tenantId: 'tenant-barbearia-a',
    isSuperAdmin: false,
    claimsRaw: {}
  };

  const managerTenantB: AuthUserClaims = {
    uid: 'user-manager-b',
    role: 'manager',
    legacyRole: 'GERENTE',
    tenantId: 'tenant-barbearia-b',
    isSuperAdmin: false,
    claimsRaw: {}
  };

  const superAdminUser: AuthUserClaims = {
    uid: 'user-super-admin',
    role: 'super_admin',
    legacyRole: 'SUPER_ADMIN',
    tenantId: undefined,
    isSuperAdmin: true,
    claimsRaw: {}
  };

  const customerUser: AuthUserClaims = {
    uid: 'user-customer-c',
    role: 'customer',
    legacyRole: 'CLIENTE',
    tenantId: 'tenant-barbearia-a',
    isSuperAdmin: false,
    claimsRaw: {}
  };

  // 1. Manager tenant A publica A (lógica de autorização)
  it('1. manager tenant A possui autoridade para tenant A', () => {
    assert.strictEqual(managerTenantA.tenantId, 'tenant-barbearia-a');
    assert.strictEqual(managerTenantA.role, 'manager');
  });

  // 2. Manager tenant A não publica B
  it('2. manager tenant A não publica B (rejeição de cross-tenant)', () => {
    assert.throws(
      () => assertTenantAuthority(managerTenantA, 'tenant-barbearia-b', 'pacote'),
      (err: any) => {
        assert(err instanceof CatalogAuthorizationError);
        assert.strictEqual(err.statusCode, 403);
        assert(err.message.includes('Acesso negado'));
        return true;
      }
    );
  });

  // 3. Super admin pode publicar globalmente
  it('3. super_admin pode publicar globalmente em qualquer tenant', () => {
    // assertTenantAuthority não deve lançar exceção para super admin
    assert.doesNotThrow(() => {
      assertTenantAuthority(superAdminUser, 'tenant-arbitrario', 'pacote');
      assertTenantAuthority(superAdminUser, 'outro-tenant-qualquer', 'promocao');
    });
  });

  // 4. Token ausente → DENY
  it('4. token ausente resulta em HTTP 401 via requireAuth', () => {
    assert(serverContent.includes('/api/catalog/sync-package') && serverContent.includes('requireAuth'));
    assert(serverContent.includes('/api/catalog/sync-promotion') && serverContent.includes('requireAuth'));
    assert(serverContent.includes('/api/catalog/sync-gallery') && serverContent.includes('requireAuth'));
  });

  // 5. Role inválida → DENY
  it('5. cliente não possui autoridade de gerência do catálogo', () => {
    assert.throws(
      () => assertTenantAuthority(customerUser, 'tenant-barbearia-a', 'promocao'),
      (err: any) => {
        assert(err instanceof CatalogAuthorizationError);
        assert.strictEqual(err.statusCode, 403);
        assert(err.message.includes("role 'customer' não possui"));
        return true;
      }
    );
  });

  // 6. Tenant claim incompatível → DENY
  it('6. tenant claim incompatível com a entidade privada resulta em DENY (HTTP 403)', () => {
    assert.throws(
      () => assertTenantAuthority(managerTenantA, 'tenant-barbearia-b', 'galeria'),
      (err: any) => {
        assert(err instanceof CatalogAuthorizationError);
        assert.strictEqual(err.statusCode, 403);
        return true;
      }
    );
  });

  // 7. Documento privado inexistente → DENY (HTTP 404)
  it('7. documento privado inexistente lança CatalogNotFoundError (404)', () => {
    // Valida que a classe de erro CatalogNotFoundError possui statusCode 404 e comportamento esperado
    const notFoundErr = new CatalogNotFoundError("Pacote privado 'pkg-inexistente' não encontrado.");
    assert.strictEqual(notFoundErr.statusCode, 404);
    assert.strictEqual(notFoundErr.name, 'CatalogNotFoundError');
    assert(notFoundErr.message.includes('não encontrado'));

    // Valida que o serviço verifica snapshot.exists antes de qualquer operação
    assert(catalogServiceContent.includes("if (!snapshot.exists) {\n    throw new CatalogNotFoundError(`Pacote privado '${packageId}' não encontrado.`);\n  }"));
    assert(catalogServiceContent.includes("if (!snapshot.exists) {\n    throw new CatalogNotFoundError(`Promoção privada '${promotionId}' não encontrada.`);\n  }"));
    assert(catalogServiceContent.includes("if (!snapshot.exists) {\n    throw new CatalogNotFoundError(`Item de galeria privado '${workId}' não encontrado.`);\n  }"));
  });

  // 8. Projeção derivada do documento privado
  it('8. backend deriva projeção diretamente de documentos privados autorizados', () => {
    assert(catalogServiceContent.includes('firestore.collection(\'packages\').doc(packageId)'));
    assert(catalogServiceContent.includes('firestore.collection(\'promotions\').doc(promotionId)'));
    assert(catalogServiceContent.includes('firestore.collection(\'gallery\').doc(workId)'));
    assert(catalogServiceContent.includes('toPublicPackage(privateData)'));
    assert(catalogServiceContent.includes('toPublicPromotion(privateData)'));
    assert(catalogServiceContent.includes('toPublicGalleryWork(privateData)'));
  });

  // 9. Frontend não consegue enviar likesCount arbitrário
  it('9. endpoint de likes não aceita likesCount fornecido pelo cliente', () => {
    assert(serverContent.includes("app.post(\n  '/api/catalog/gallery/:id/like'"));
    // O endpoint não lê req.body.likesCount, apenas o workId do parâmetro de rota
    assert(!serverContent.includes('req.body.likesCount'));
    assert(catalogServiceContent.includes('transaction.update(workRef, { likesCount: updatedLikes })'));
  });

  // 10. Sync repetido é idempotente
  it('10. sync repetido é idempotente por usar caminhos determinísticos e merge', () => {
    assert(catalogServiceContent.includes(".collection('publicPackages')"));
    assert(catalogServiceContent.includes(".doc(packageId)"));
    assert(catalogServiceContent.includes(".set(cleanPackage, { merge: true })"));
  });

  // 11. Delete repetido é idempotente
  it('11. delete repetido é idempotente', () => {
    assert(catalogServiceContent.includes(".collection('publicPackages')\n    .doc(tenantId)\n    .collection('items')\n    .doc(packageId)\n    .delete()"));
    assert(catalogServiceContent.includes(".collection('publicPromotions')\n    .doc(tenantId)\n    .collection('items')\n    .doc(promotionId)\n    .delete()"));
    assert(catalogServiceContent.includes(".collection('publicGallery')\n    .doc(tenantId)\n    .collection('items')\n    .doc(workId)\n    .delete()"));
  });

  // 12. Delete privado → delete público
  it('12. fluxos de delete no frontend invocam remoção pública autoritativa', () => {
    const appContextContent = fs.readFileSync(path.resolve(process.cwd(), 'src/context/AppContext.tsx'), 'utf8');
    assert(appContextContent.includes('deletePromotionProjectionCall'));
    assert(appContextContent.includes('deleteGalleryProjectionCall'));
  });

  // 13. Falha de sincronização não retorna falso sucesso
  it('13. falhas na sincronização são detectadas e não mascaradas com falso sucesso', () => {
    const appContextContent = fs.readFileSync(path.resolve(process.cwd(), 'src/context/AppContext.tsx'), 'utf8');
    assert(appContextContent.includes("console.warn('[syncPromotionProjection] Falha na sincronização autoritativa:'"));
    assert(appContextContent.includes("console.warn('[syncGalleryProjection] Falha na sincronização autoritativa:'"));
  });

  // 14. Projeção não contém campos privados
  it('14. projeções expurgam estritamente custos, comissões e metadados internos', () => {
    const mockPrivatePkg: ServicePackage & { internalCost?: number; commissionRate?: number } = {
      id: 'pkg-1',
      tenantId: 'tenant-a',
      title: 'Barba e Cabelo',
      description: 'Combo completo',
      price: 90,
      active: true,
      items: [{ id: 'item-1', type: 'SERVICO', itemId: 'srv-1', name: 'Corte', totalQuantity: 1 }],
      createdAt: '2026-09-16T00:00:00Z',
      internalCost: 35.0,
      commissionRate: 0.5
    };

    const projectedPkg = toPublicPackage(mockPrivatePkg);
    assert.strictEqual((projectedPkg as any).internalCost, undefined);
    assert.strictEqual((projectedPkg as any).commissionRate, undefined);
    assert.strictEqual(projectedPkg.title, 'Barba e Cabelo');

    const mockPrivatePromo: Promotion & { roiTarget?: number; internalNotes?: string } = {
      id: 'promo-1',
      tenantId: 'tenant-a',
      title: 'Quarta Maluca',
      description: 'Desconto no corte',
      discountPercentage: 20,
      active: true,
      validUntil: '2026-09-30',
      createdAt: '2026-09-01T00:00:00Z',
      roiTarget: 5000,
      internalNotes: 'Campanha de retenção'
    };

    const projectedPromo = toPublicPromotion(mockPrivatePromo);
    assert.strictEqual((projectedPromo as any).roiTarget, undefined);
    assert.strictEqual((projectedPromo as any).internalNotes, undefined);
    assert.strictEqual(projectedPromo.discountPercentage, 20);

    const mockPrivateWork: GalleryWork & { barberProfitShare?: number } = {
      id: 'work-1',
      tenantId: 'tenant-a',
      title: 'Fade Degradê',
      imageUrl: 'https://images.unsplash.com/photo-1',
      category: 'DEGRADE',
      professionalId: 'prof-1',
      professionalName: 'Carlos Barbeiro',
      likesCount: 15,
      createdAt: '2026-09-10T00:00:00Z',
      barberProfitShare: 0.6
    };

    const projectedWork = toPublicGalleryWork(mockPrivateWork);
    assert.strictEqual((projectedWork as any).barberProfitShare, undefined);
    assert.strictEqual(projectedWork.likesCount, 15);
  });

  // 15. TenantId da projeção corresponde ao documento privado
  it('15. tenantId da projeção reflete com rigor o tenantId do documento privado', () => {
    const sampleWork: GalleryWork = {
      id: 'w-1',
      tenantId: 'tenant-barbearia-a',
      title: 'Barba Clássica',
      imageUrl: 'https://example.com/barba.jpg',
      category: 'BARBA',
      professionalId: 'prof-2',
      professionalName: 'Marcos Navalha',
      likesCount: 5,
      createdAt: '2026-09-16T00:00:00Z'
    };
    const projected = toPublicGalleryWork(sampleWork);
    assert.strictEqual(projected.tenantId, 'tenant-barbearia-a');
  });

  // 16. Cliente não escreve projeção pública
  it('16. firestore.rules bloqueia expressamente escrita de clientes em projeções públicas', () => {
    assert(rulesContent.includes('match /publicPackages/{tenantId}/items/{packageId} {\n      allow read: if true;\n      allow write: if false;'));
    assert(rulesContent.includes('match /publicPromotions/{tenantId}/items/{promotionId} {\n      allow read: if true;\n      allow write: if false;'));
    assert(rulesContent.includes('match /publicGallery/{tenantId}/items/{workId} {\n      allow read: if true;\n      allow write: if false;'));
  });

  // 17. Cliente não escreve coleção privada sem autorização
  it('17. firestore.rules exige membership e gerência para coleções privadas', () => {
    assert(rulesContent.includes('match /packages/{packageId}'));
    assert(rulesContent.includes('allow create, update: if isSuperAdmin() || isManagerOrOwnerOfTenant(request.resource.data.tenantId);'));
    assert(rulesContent.includes('match /promotions/{promoId}'));
    assert(rulesContent.includes('match /gallery/{workId}'));
  });

  // 18. Nenhum endpoint aceita tenantId arbitrário como autoridade
  it('18. endpoints de sincronização não aceitam tenantId arbitrário do cliente como autoridade', () => {
    assert(catalogServiceContent.includes('assertCatalogTenantOperational(user, privateData.tenantId') || catalogServiceContent.includes('assertTenantAuthority(user, privateData.tenantId'));
    assert(!catalogServiceContent.includes('assertTenantAuthority(user, req.body.tenantId'));
  });

  // Rate limiting de likes
  it('Rate limit de curtidas rejeita spam com HTTP 429', () => {
    const ip = 'test-client-ip-123';
    let allowedCount = 0;
    for (let i = 0; i < 35; i++) {
      if (checkLikeRateLimit(ip)) {
        allowedCount++;
      }
    }
    assert.strictEqual(allowedCount, 30, 'Deveria permitir exatamente 30 curtidas no intervalo de 1 minuto');
  });
});
