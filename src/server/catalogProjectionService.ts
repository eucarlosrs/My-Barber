import { getFirebaseAdmin } from './firebaseAdmin.js';
import { ServicePackage, Promotion, GalleryWork } from '../types/index.js';
import { toPublicPackage, toPublicPromotion, toPublicGalleryWork } from '../utils/projections.js';
import { AuthUserClaims } from '../lib/authClaims.js';
import { assertTenantSubscriptionActive } from './subscriptionEnforcement.js';

/**
 * MY BARBER — Serviço Backend de Sincronização Autoritativa de Projeções Públicas
 * 
 * DIRETRIZES DE AUTORIDADE E SEGURANÇA (FASE 2.2E / FASE 3.4B):
 * 1. O backend NUNCA confia em objetos de projeção arbitrários enviados pelo cliente.
 * 2. Toda projeção é obtida diretamente do DOCUMENTO PRIVADO oficial no Firestore.
 * 3. O tenantId é validado contra o token/Custom Claims do usuário logado (manager/owner).
 * 4. Super Admin possui autoridade global.
 * 5. Se o documento privado não existir, a operação é rejeitada com erro explícito (DENY).
 * 6. Todas as gravações e exclusões são idempotentes (IDs determinísticos {tenantId}/items/{entityId}).
 * 7. Bloqueio de mutações de catálogo para barbearias com assinatura SUSPENSA ou CANCELADA (V3.4-03).
 */

export class CatalogAuthorizationError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 403) {
    super(message);
    this.name = 'CatalogAuthorizationError';
    this.statusCode = statusCode;
  }
}

export class CatalogNotFoundError extends Error {
  statusCode: number;
  constructor(message: string) {
    super(message);
    this.name = 'CatalogNotFoundError';
    this.statusCode = 404;
  }
}

/**
 * Valida a correspondência entre o tenant do usuário e o tenant do documento
 */
export function assertTenantAuthority(user: AuthUserClaims, targetTenantId: string, resourceName: string = 'recurso') {
  if (user.isSuperAdmin || user.role === 'super_admin') {
    return; // Super Admin possui acesso global soberano
  }

  if (user.role !== 'manager' && user.role !== 'barbershop_owner') {
    throw new CatalogAuthorizationError(
      `Acesso negado: role '${user.role}' não possui privilégios de gerenciamento de catálogo.`,
      403
    );
  }

  if (!user.tenantId || user.tenantId !== targetTenantId) {
    throw new CatalogAuthorizationError(
      `Acesso negado: usuário do tenant '${user.tenantId || 'nenhum'}' não possui autorização para gerenciar ${resourceName} no tenant '${targetTenantId}'.`,
      403
    );
  }
}

/**
 * Validação composta: autoridade de tenant + verificação de assinatura ativa no backend
 */
export async function assertCatalogTenantOperational(user: AuthUserClaims, targetTenantId: string, resourceName: string = 'recurso') {
  assertTenantAuthority(user, targetTenantId, resourceName);

  if (!user.isSuperAdmin && user.role !== 'super_admin') {
    const subCheck = await assertTenantSubscriptionActive(targetTenantId);
    if (!subCheck.allowed && (subCheck.status === 'SUSPENDED' || subCheck.status === 'CANCELED')) {
      throw new CatalogAuthorizationError(
        subCheck.reason || `Operação de catálogo bloqueada: o estabelecimento encontra-se com assinatura ${subCheck.status?.toLowerCase() || 'inativa'}.`,
        403
      );
    }
  }
}

// -----------------------------------------------------------------------------
// PACOTES (PACKAGES)
// -----------------------------------------------------------------------------

export async function syncPackageById(packageId: string, user: AuthUserClaims): Promise<void> {
  if (!packageId || typeof packageId !== 'string') {
    throw new Error('packageId inválido ou não fornecido.');
  }

  const { firestore } = getFirebaseAdmin();
  const docRef = firestore.collection('packages').doc(packageId);
  const snapshot = await docRef.get();

  if (!snapshot.exists) {
    throw new CatalogNotFoundError(`Pacote privado '${packageId}' não encontrado.`);
  }

  const privateData = snapshot.data() as ServicePackage;
  if (!privateData.tenantId) {
    throw new Error(`Pacote privado '${packageId}' não possui tenantId configurado.`);
  }

  await assertCatalogTenantOperational(user, privateData.tenantId, 'pacote');

  const cleanPackage = toPublicPackage(privateData);

  // Gravação determinística idempotente na subcoleção pública
  await firestore
    .collection('publicPackages')
    .doc(privateData.tenantId)
    .collection('items')
    .doc(packageId)
    .set(cleanPackage, { merge: true });
}

export async function deletePackageById(packageId: string, tenantId: string, user: AuthUserClaims): Promise<void> {
  if (!packageId || !tenantId) {
    throw new Error('packageId e tenantId são obrigatórios para exclusão.');
  }

  await assertCatalogTenantOperational(user, tenantId, 'pacote');

  const { firestore } = getFirebaseAdmin();
  // Exclusão idempotente: chamar delete em doc inexistente no Firestore é no-op seguro
  await firestore
    .collection('publicPackages')
    .doc(tenantId)
    .collection('items')
    .doc(packageId)
    .delete();
}

// -----------------------------------------------------------------------------
// PROMOÇÕES (PROMOTIONS)
// -----------------------------------------------------------------------------

export async function syncPromotionById(promotionId: string, user: AuthUserClaims): Promise<void> {
  if (!promotionId || typeof promotionId !== 'string') {
    throw new Error('promotionId inválido ou não fornecido.');
  }

  const { firestore } = getFirebaseAdmin();
  const docRef = firestore.collection('promotions').doc(promotionId);
  const snapshot = await docRef.get();

  if (!snapshot.exists) {
    throw new CatalogNotFoundError(`Promoção privada '${promotionId}' não encontrada.`);
  }

  const privateData = snapshot.data() as Promotion;
  if (!privateData.tenantId) {
    throw new Error(`Promoção privada '${promotionId}' não possui tenantId configurado.`);
  }

  await assertCatalogTenantOperational(user, privateData.tenantId, 'promoção');

  const cleanPromo = toPublicPromotion(privateData);

  await firestore
    .collection('publicPromotions')
    .doc(privateData.tenantId)
    .collection('items')
    .doc(promotionId)
    .set(cleanPromo, { merge: true });
}

export async function deletePromotionById(promotionId: string, tenantId: string, user: AuthUserClaims): Promise<void> {
  if (!promotionId || !tenantId) {
    throw new Error('promotionId e tenantId são obrigatórios para exclusão.');
  }

  await assertCatalogTenantOperational(user, tenantId, 'promoção');

  const { firestore } = getFirebaseAdmin();
  await firestore
    .collection('publicPromotions')
    .doc(tenantId)
    .collection('items')
    .doc(promotionId)
    .delete();
}

// -----------------------------------------------------------------------------
// GALERIA (GALLERY)
// -----------------------------------------------------------------------------

export async function syncGalleryById(workId: string, user: AuthUserClaims): Promise<void> {
  if (!workId || typeof workId !== 'string') {
    throw new Error('workId inválido ou não fornecido.');
  }

  const { firestore } = getFirebaseAdmin();
  const docRef = firestore.collection('gallery').doc(workId);
  const snapshot = await docRef.get();

  if (!snapshot.exists) {
    throw new CatalogNotFoundError(`Item de galeria privado '${workId}' não encontrado.`);
  }

  const privateData = snapshot.data() as GalleryWork;
  if (!privateData.tenantId) {
    throw new Error(`Item de galeria privado '${workId}' não possui tenantId configurado.`);
  }

  await assertCatalogTenantOperational(user, privateData.tenantId, 'item de galeria');

  const cleanWork = toPublicGalleryWork(privateData);

  await firestore
    .collection('publicGallery')
    .doc(privateData.tenantId)
    .collection('items')
    .doc(workId)
    .set(cleanWork, { merge: true });
}

export async function deleteGalleryById(workId: string, tenantId: string, user: AuthUserClaims): Promise<void> {
  if (!workId || !tenantId) {
    throw new Error('workId e tenantId são obrigatórios para exclusão.');
  }

  await assertCatalogTenantOperational(user, tenantId, 'item de galeria');

  const { firestore } = getFirebaseAdmin();
  await firestore
    .collection('publicGallery')
    .doc(tenantId)
    .collection('items')
    .doc(workId)
    .delete();
}

// -----------------------------------------------------------------------------
// LIKES AUTORITATIVOS NA GALERIA (FASE 2.2E)
// -----------------------------------------------------------------------------

// Rate limiting em memória para likes por IP/visitante (max 30 likes por minuto)
const likeRateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkLikeRateLimit(identifier: string): boolean {
  const now = Date.now();
  const entry = likeRateLimitMap.get(identifier);
  if (!entry || now > entry.resetAt) {
    likeRateLimitMap.set(identifier, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= 30) {
    return false;
  }
  entry.count++;
  return true;
}

/**
 * Incrementa com autoridade o likesCount de uma foto na coleção privada e na projeção pública
 */
export async function incrementGalleryLike(workId: string, clientIp: string): Promise<{ newLikesCount: number }> {
  if (!checkLikeRateLimit(clientIp)) {
    throw new CatalogAuthorizationError('Muitas curtidas em sequência. Aguarde um instante.', 429);
  }

  const { firestore } = getFirebaseAdmin();
  const workRef = firestore.collection('gallery').doc(workId);

  const newLikes = await firestore.runTransaction(async (transaction) => {
    const doc = await transaction.get(workRef);
    if (!doc.exists) {
      throw new CatalogNotFoundError(`Foto da galeria '${workId}' não encontrada.`);
    }

    const data = doc.data() as GalleryWork;
    const currentLikes = typeof data.likesCount === 'number' ? data.likesCount : 0;
    const updatedLikes = currentLikes + 1;

    // Atualiza coleção privada
    transaction.update(workRef, { likesCount: updatedLikes });

    // Atualiza projeção pública se existir
    if (data.tenantId) {
      const publicRef = firestore
        .collection('publicGallery')
        .doc(data.tenantId)
        .collection('items')
        .doc(workId);
      transaction.set(publicRef, { likesCount: updatedLikes }, { merge: true });
    }

    return updatedLikes;
  });

  return { newLikesCount: newLikes };
}
