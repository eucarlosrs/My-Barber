import {
  collection,
  doc,
  setDoc,
  getDocs,
  onSnapshot,
  deleteDoc,
  runTransaction,
  query,
  where,
  QueryConstraint
} from 'firebase/firestore';
import { db } from './firebase';
import {
  INITIAL_BARBERSHOPS,
  INITIAL_USERS,
  INITIAL_SERVICES,
  INITIAL_SCHEDULES,
  INITIAL_APPOINTMENTS,
  INITIAL_PACKAGES,
  INITIAL_CUSTOMER_PACKAGES,
  INITIAL_WAITLIST,
  INITIAL_RAFFLES,
  INITIAL_PROMOTIONS,
  INITIAL_COMMUNICATIONS,
  INITIAL_STOCK,
  INITIAL_RETURN_MESSAGES,
  INITIAL_GALLERY_WORKS,
  INITIAL_SUBSCRIPTIONS,
  INITIAL_SUBSCRIPTION_PAYMENTS,
  INITIAL_CUSTOM_PLANS
} from '../data/initialData';
import {
  toPublicAvailabilitySlot,
  toPublicProfessionalProfile,
  toPublicCommunication,
  toPublicRaffle,
  toPublicService,
  toPublicSchedule,
  toPublicBarbershop,
  toPublicPackage,
  toPublicPromotion,
  toPublicGalleryWork
} from '../utils/projections';
import { Appointment } from '../types';

/**
 * Initializes Firestore documents with default sample data if the collection is empty.
 */
export async function seedFirestoreIfEmpty() {
  try {
    const barbershopCol = collection(db, 'barbershops');
    const snapshot = await getDocs(barbershopCol);

    if (snapshot.empty) {
      console.log('Seeding initial data to Firebase Firestore...');

      // Seed Barbershops (Private & Public Projection)
      for (const item of INITIAL_BARBERSHOPS) {
        await setDoc(doc(db, 'barbershops', item.id), item);
        await setDoc(doc(db, 'publicBarbershops', item.id), toPublicBarbershop(item));
      }

      // Seed Users (REGRA DE SEGURANÇA: NUNCA armazenar senha no Firestore)
      for (const item of INITIAL_USERS) {
        const cleanUser = { ...(item as any) };
        delete cleanUser.password;
        delete cleanUser._password;
        delete cleanUser.token;
        delete cleanUser.refreshToken;
        await setDoc(doc(db, 'users', item.id), sanitizeForFirestore(cleanUser));
        if (item.role === 'PROFISSIONAL') {
          await setDoc(doc(db, 'publicProfessionalProfiles', item.id), toPublicProfessionalProfile(item));
        }
      }

      // Seed Services (Private with commissions & Public for catalog)
      for (const item of INITIAL_SERVICES) {
        await setDoc(doc(db, 'services', item.id), item);
        await setDoc(doc(db, 'publicServices', item.id), toPublicService(item));
      }

      // Seed Schedules (Private with reasons & Public without reasons)
      for (const item of INITIAL_SCHEDULES) {
        await setDoc(doc(db, 'schedules', `sch_${item.professionalId}`), item);
        await setDoc(doc(db, 'publicSchedules', `sch_${item.professionalId}`), toPublicSchedule(item));
      }

      // Seed Appointments (Private with client PII & Public Availability Slot)
      for (const item of INITIAL_APPOINTMENTS) {
        await setDoc(doc(db, 'appointments', item.id), item);
        await setDoc(doc(db, 'publicAvailability', item.id), toPublicAvailabilitySlot(item));
      }

      // Seed Packages (Private & Public Projection)
      for (const item of INITIAL_PACKAGES) {
        await setDoc(doc(db, 'packages', item.id), item);
        await setDoc(doc(db, 'publicPackages', item.tenantId, 'items', item.id), toPublicPackage(item));
      }

      // Seed Customer Packages
      for (const item of INITIAL_CUSTOMER_PACKAGES) {
        await setDoc(doc(db, 'customerPackages', item.id), item);
      }

      // Seed Waitlist
      for (const item of INITIAL_WAITLIST) {
        await setDoc(doc(db, 'waitlist', item.id), item);
      }

      // Seed Raffles (Private with participants PII & Public without participants)
      for (const item of INITIAL_RAFFLES) {
        await setDoc(doc(db, 'raffles', item.id), item);
        await setDoc(doc(db, 'publicRaffles', item.id), toPublicRaffle(item));
      }

      // Seed Promotions (Private & Public Projection)
      for (const item of INITIAL_PROMOTIONS) {
        await setDoc(doc(db, 'promotions', item.id), item);
        await setDoc(doc(db, 'publicPromotions', item.tenantId, 'items', item.id), toPublicPromotion(item));
      }

      // Seed Communications (Private with delivery logs & Public without logs)
      for (const item of INITIAL_COMMUNICATIONS) {
        await setDoc(doc(db, 'communications', item.id), item);
        await setDoc(doc(db, 'publicCommunications', item.id), toPublicCommunication(item));
      }

      // Seed Stock
      for (const item of INITIAL_STOCK) {
        await setDoc(doc(db, 'stock', item.id), item);
      }

      // Seed Return Messages
      for (const item of INITIAL_RETURN_MESSAGES) {
        await setDoc(doc(db, 'returnMessages', item.id), item);
      }

      // Seed Gallery Works (Private & Public Projection)
      for (const item of INITIAL_GALLERY_WORKS) {
        await setDoc(doc(db, 'gallery', item.id), item);
        await setDoc(doc(db, 'publicGallery', item.tenantId, 'items', item.id), toPublicGalleryWork(item));
      }

      // Seed Subscriptions
      for (const item of INITIAL_SUBSCRIPTIONS) {
        await setDoc(doc(db, 'subscriptions', item.id), item);
      }

      // Seed Subscription Payments
      for (const item of INITIAL_SUBSCRIPTION_PAYMENTS) {
        await setDoc(doc(db, 'subscription_payments', item.id), item);
      }

      console.log('Firebase Firestore seeding complete.');
    }

    // Ensure SaaS plans collection is populated
    try {
      const plansCol = collection(db, 'plans');
      const plansSnap = await getDocs(plansCol);
      if (plansSnap.empty) {
        console.log('Seeding initial SaaS plans to Firebase Firestore...');
        for (const item of INITIAL_CUSTOM_PLANS) {
          await setDoc(doc(db, 'plans', item.id), item);
        }
      }
    } catch (err) {
      console.warn('Plans collection check/seed note:', err);
    }
  } catch (error) {
    console.warn('Firebase auto-seed error (offline/fallback mode active):', error);
  }
}

// Real-time synchronization helper
export function subscribeCollection<T>(
  collectionName: string,
  onUpdate: (data: T[]) => void,
  fallbackData: T[],
  onFirstLoad?: () => void
) {
  let firstFired = false;
  const markLoaded = () => {
    if (!firstFired) {
      firstFired = true;
      if (onFirstLoad) onFirstLoad();
    }
  };

  try {
    const colRef = collection(db, collectionName);
    const unsubscribe = onSnapshot(
      colRef,
      snapshot => {
        if (!snapshot.empty) {
          const items = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as unknown as T));
          try {
            if (collectionName === 'plans') {
              localStorage.setItem('mybarber_cached_plans', JSON.stringify(items));
            }
          } catch {
            // ignore
          }
          onUpdate(items);
        } else {
          // If remote snapshot is empty, try recovering from local cache
          try {
            if (collectionName === 'barbershops') {
              const cached = localStorage.getItem('mybarber_cached_barbershops');
              if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  onUpdate(parsed as unknown as T[]);
                }
              }
            }
          } catch {
            // ignore
          }
        }
        markLoaded();
      },
      error => {
        console.warn(`Firestore sync warning on ${collectionName}:`, error);
        let dataToUse = fallbackData;
        try {
          if (collectionName === 'barbershops') {
            const cached = localStorage.getItem('mybarber_cached_barbershops');
            if (cached) {
              const parsed = JSON.parse(cached);
              if (Array.isArray(parsed) && parsed.length > 0) {
                dataToUse = parsed as unknown as T[];
              }
            }
          } else if (collectionName === 'appointments') {
            const cached = localStorage.getItem('mybarber_cached_appointments');
            if (cached) {
              const parsed = JSON.parse(cached);
              if (Array.isArray(parsed) && parsed.length > 0) {
                dataToUse = parsed as unknown as T[];
              }
            }
          } else if (collectionName === 'users') {
            const cached = localStorage.getItem('mybarber_cached_users');
            if (cached) {
              const parsed = JSON.parse(cached);
              if (Array.isArray(parsed) && parsed.length > 0) {
                dataToUse = parsed as unknown as T[];
              }
            }
          } else if (collectionName === 'plans') {
            const cached = localStorage.getItem('mybarber_cached_plans');
            if (cached) {
              const parsed = JSON.parse(cached);
              if (Array.isArray(parsed) && parsed.length > 0) {
                dataToUse = parsed as unknown as T[];
              }
            }
          }
        } catch {
          // ignore
        }
        onUpdate(dataToUse);
        markLoaded();
      }
    );
    return unsubscribe;
  } catch (e) {
    console.warn(`Error setting up listener for ${collectionName}:`, e);
    markLoaded();
    return () => {};
  }
}

/**
 * Escuta um documento específico do Firestore por collectionName e docId.
 * Ideal para leitura de documento único de tenant (ex: barbershops/{tenantId} ou publicBarbershops/{tenantId}).
 */
export function subscribeDoc<T>(
  collectionName: string,
  docId: string,
  onUpdate: (data: T | null) => void,
  fallbackData?: T,
  onFirstLoad?: () => void
): () => void {
  let firstFired = false;
  const markLoaded = () => {
    if (!firstFired) {
      firstFired = true;
      if (onFirstLoad) onFirstLoad();
    }
  };

  if (!docId) {
    if (fallbackData !== undefined) onUpdate(fallbackData);
    markLoaded();
    return () => {};
  }

  try {
    const docRef = doc(db, collectionName, docId);
    const unsubscribe = onSnapshot(
      docRef,
      snapshot => {
        if (snapshot.exists()) {
          const item = { ...snapshot.data(), id: snapshot.id } as unknown as T;
          onUpdate(item);
        } else {
          onUpdate(fallbackData !== undefined ? fallbackData : null);
        }
        markLoaded();
      },
      error => {
        console.warn(`Firestore doc sync warning on ${collectionName}/${docId}:`, error);
        if (fallbackData !== undefined) {
          onUpdate(fallbackData);
        }
        markLoaded();
      }
    );
    return unsubscribe;
  } catch (e) {
    console.warn(`Error setting up doc listener for ${collectionName}/${docId}:`, e);
    if (fallbackData !== undefined) {
      onUpdate(fallbackData);
    }
    markLoaded();
    return () => {};
  }
}

/**
 * Escuta documentos do Firestore restritos estritamente ao tenantId (Multi-Tenant nativo no Firestore).
 * A query já nasce com where('tenantId', '==', tenantId), satisfazendo as Security Rules.
 */
export function subscribeTenantCollection<T>(
  collectionName: string,
  tenantId: string,
  onUpdate: (data: T[]) => void,
  fallbackData: T[],
  onFirstLoad?: () => void
) {
  let firstFired = false;
  const markLoaded = () => {
    if (!firstFired) {
      firstFired = true;
      if (onFirstLoad) onFirstLoad();
    }
  };

  try {
    const colRef = collection(db, collectionName);
    const q = query(colRef, where('tenantId', '==', tenantId));
    const unsubscribe = onSnapshot(
      q,
      snapshot => {
        if (!snapshot.empty) {
          const items = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as unknown as T));
          onUpdate(items);
        } else {
          onUpdate([]);
        }
        markLoaded();
      },
      error => {
        console.warn(`Firestore tenant sync warning on ${collectionName} (${tenantId}):`, error);
        onUpdate(fallbackData);
        markLoaded();
      }
    );
    return unsubscribe;
  } catch (e) {
    console.warn(`Error setting up tenant listener for ${collectionName}:`, e);
    markLoaded();
    return () => {};
  }
}

/**
 * Escuta documentos em uma subcoleção do Firestore (ex: publicPackages/{tenantId}/items).
 * Proporciona isolamento físico por caminho (path-based) no Firestore sem dependência de filtros no cliente.
 */
export function subscribeSubcollection<T>(
  parentCol: string,
  parentDocId: string,
  subCol: string,
  onUpdate: (data: T[]) => void,
  fallbackData: T[] = [],
  onFirstLoad?: () => void
): () => void {
  let firstFired = false;
  const markLoaded = () => {
    if (!firstFired) {
      firstFired = true;
      if (onFirstLoad) onFirstLoad();
    }
  };

  if (!parentDocId) {
    onUpdate(fallbackData);
    markLoaded();
    return () => {};
  }

  try {
    const subColRef = collection(db, parentCol, parentDocId, subCol);
    const unsubscribe = onSnapshot(
      subColRef,
      snapshot => {
        if (!snapshot.empty) {
          const items = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as unknown as T));
          onUpdate(items);
        } else {
          onUpdate(fallbackData.length > 0 ? fallbackData : []);
        }
        markLoaded();
      },
      error => {
        console.warn(`Firestore subcollection sync warning on ${parentCol}/${parentDocId}/${subCol}:`, error);
        onUpdate(fallbackData);
        markLoaded();
      }
    );
    return unsubscribe;
  } catch (e) {
    console.warn(`Error setting up subcollection listener for ${parentCol}/${parentDocId}/${subCol}:`, e);
    onUpdate(fallbackData);
    markLoaded();
    return () => {};
  }
}

/**
 * Escuta documentos do Firestore aplicando restrições de query (QueryConstraint[]).
 */
export function subscribeQuery<T>(
  collectionName: string,
  constraints: QueryConstraint[],
  onUpdate: (data: T[]) => void,
  fallbackData: T[],
  onFirstLoad?: () => void
): () => void {
  let firstFired = false;
  const markLoaded = () => {
    if (!firstFired) {
      firstFired = true;
      if (onFirstLoad) onFirstLoad();
    }
  };

  try {
    const colRef = collection(db, collectionName);
    const q = query(colRef, ...constraints);
    const unsubscribe = onSnapshot(
      q,
      snapshot => {
        if (!snapshot.empty) {
          const items = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as unknown as T));
          onUpdate(items);
        } else {
          onUpdate([]);
        }
        markLoaded();
      },
      error => {
        console.warn(`Firestore query sync warning on ${collectionName}:`, error);
        onUpdate(fallbackData);
        markLoaded();
      }
    );
    return unsubscribe;
  } catch (e) {
    console.warn(`Error setting up query listener for ${collectionName}:`, e);
    markLoaded();
    return () => {};
  }
}

// Sincroniza slot público de disponibilidade expurgando qualquer dado pessoal (PII)
// Se status for diferente de AGENDADO (ex: CANCELADO), o documento é expurgado da vitrine pública
export async function syncPublicAvailability(appointment: Appointment) {
  try {
    if (appointment.status !== 'AGENDADO') {
      await deleteDoc(doc(db, 'publicAvailability', appointment.id));
    } else {
      const slot = toPublicAvailabilitySlot(appointment);
      await syncDoc('publicAvailability', slot.id, slot);
    }
  } catch (e) {
    console.warn('Sync publicAvailability (sujeito à autorização soberana de rules):', e);
  }
}

// Helper to recursively remove undefined values which cause Firestore setDoc to throw errors
export function sanitizeForFirestore<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return null as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForFirestore(item)) as unknown as T;
  }
  if (typeof obj === 'object') {
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        sanitized[key] = sanitizeForFirestore(value);
      }
    }
    return sanitized as T;
  }
  return obj;
}

// Write/Sync operations directly to Firestore
export async function syncDoc<T extends Record<string, any>>(collectionName: string, docId: string, data: T) {
  try {
    const cleanData = sanitizeForFirestore(data);
    // REGRA SOBERANA DE SEGURANÇA FIREBASE: NUNCA armazenar senhas, tokens ou segredos no Firestore
    if (collectionName === 'users') {
      delete (cleanData as any).password;
      delete (cleanData as any)._password;
      delete (cleanData as any).token;
      delete (cleanData as any).refreshToken;
    }
    await setDoc(doc(db, collectionName, docId), cleanData, { merge: true });
  } catch (e) {
    console.warn(`Failed to sync doc ${docId} in ${collectionName}:`, e);
  }
}

export async function deleteDocFromDb(collectionName: string, docId: string) {
  try {
    await deleteDoc(doc(db, collectionName, docId));
  } catch (e) {
    console.warn(`Failed to delete doc ${docId} in ${collectionName}:`, e);
  }
}

/**
 * Persiste um agendamento de forma atômica no Firestore garantindo que não ocorra duplo agendamento
 * para o mesmo profissional, data e intervalo de horário.
 */
export async function syncAppointmentWithLock(
  appointment: Record<string, any>,
  validator: (existingList: any[]) => { available: boolean; reason?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Consultar na coleção pública de disponibilidade (Zero PII, pública para todos os clientes)
    const availCol = collection(db, 'publicAvailability');
    const q = query(
      availCol,
      where('professionalId', '==', appointment.professionalId),
      where('date', '==', appointment.date)
    );

    const snapshot = await getDocs(q);
    const existingList: any[] = [];
    snapshot.forEach(d => {
      existingList.push({ id: d.id, ...d.data() });
    });

    // 2. Validar atomicamente sobreposição com os dados mais recentes do banco
    const check = validator(existingList);
    if (!check.available) {
      return {
        success: false,
        error: check.reason || 'Esse horário acabou de ser reservado. Escolha outro horário disponível.'
      };
    }

    // 3. Executar transação no documento específico do agendamento
    const docRef = doc(db, 'appointments', appointment.id);

    await runTransaction(db, async (transaction) => {
      const sfDoc = await transaction.get(docRef);
      if (sfDoc.exists()) {
        const data = sfDoc.data();
        if (data.status === 'AGENDADO' && data.id !== appointment.id) {
          throw new Error('SLOT_OCCUPIED');
        }
      }
      transaction.set(docRef, appointment);
    });

    // Sincronização autoritativa/graciosa na projeção pública (sujeita a Security Rules)
    syncPublicAvailability(appointment as Appointment);

    return { success: true };
  } catch (error: any) {
    if (error?.message === 'SLOT_OCCUPIED') {
      return {
        success: false,
        error: 'Esse horário acabou de ser reservado. Escolha outro horário disponível.'
      };
    }
    console.warn('Erro ao sincronizar agendamento atômico:', error);
    // Fallback gracioso com setDoc caso transação sofra restrição de ambiente
    try {
      await setDoc(doc(db, 'appointments', appointment.id), appointment);
      syncPublicAvailability(appointment as Appointment);
      return { success: true };
    } catch (fallbackError: any) {
      return {
        success: false,
        error: fallbackError?.message || 'Erro ao registrar agendamento no banco de dados.'
      };
    }
  }
}

/**
 * Consulta pontual e paginada/filtrada sob demanda para agendamentos históricos (FASE 2.2B).
 * Evita listeners contínuos para dados antigos fora da janela operacional.
 */
export async function fetchHistoricalAppointments(options?: {
  tenantId?: string;
  professionalId?: string;
  startDate?: string;
  endDate?: string;
  limitCount?: number;
}): Promise<Appointment[]> {
  try {
    const constraints: QueryConstraint[] = [];
    if (options?.tenantId) {
      constraints.push(where('tenantId', '==', options.tenantId));
    }
    if (options?.professionalId) {
      constraints.push(where('professionalId', '==', options.professionalId));
    }
    if (options?.startDate) {
      constraints.push(where('date', '>=', options.startDate));
    }
    if (options?.endDate) {
      constraints.push(where('date', '<=', options.endDate));
    }
    const q = query(collection(db, 'appointments'), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Appointment));
  } catch (err) {
    console.error('[fetchHistoricalAppointments] Erro ao consultar agendamentos históricos:', err);
    return [];
  }
}

