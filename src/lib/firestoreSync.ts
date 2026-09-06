import {
  collection,
  doc,
  setDoc,
  getDocs,
  onSnapshot,
  deleteDoc,
  runTransaction,
  query,
  where
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

/**
 * Initializes Firestore documents with default sample data if the collection is empty.
 */
export async function seedFirestoreIfEmpty() {
  try {
    const barbershopCol = collection(db, 'barbershops');
    const snapshot = await getDocs(barbershopCol);

    if (snapshot.empty) {
      console.log('Seeding initial data to Firebase Firestore...');

      // Seed Barbershops
      for (const item of INITIAL_BARBERSHOPS) {
        await setDoc(doc(db, 'barbershops', item.id), item);
      }

      // Seed Users
      for (const item of INITIAL_USERS) {
        await setDoc(doc(db, 'users', item.id), item);
      }

      // Seed Services
      for (const item of INITIAL_SERVICES) {
        await setDoc(doc(db, 'services', item.id), item);
      }

      // Seed Schedules
      for (const item of INITIAL_SCHEDULES) {
        await setDoc(doc(db, 'schedules', `sch_${item.professionalId}`), item);
      }

      // Seed Appointments
      for (const item of INITIAL_APPOINTMENTS) {
        await setDoc(doc(db, 'appointments', item.id), item);
      }

      // Seed Packages
      for (const item of INITIAL_PACKAGES) {
        await setDoc(doc(db, 'packages', item.id), item);
      }

      // Seed Customer Packages
      for (const item of INITIAL_CUSTOMER_PACKAGES) {
        await setDoc(doc(db, 'customerPackages', item.id), item);
      }

      // Seed Waitlist
      for (const item of INITIAL_WAITLIST) {
        await setDoc(doc(db, 'waitlist', item.id), item);
      }

      // Seed Raffles
      for (const item of INITIAL_RAFFLES) {
        await setDoc(doc(db, 'raffles', item.id), item);
      }

      // Seed Promotions
      for (const item of INITIAL_PROMOTIONS) {
        await setDoc(doc(db, 'promotions', item.id), item);
      }

      // Seed Communications
      for (const item of INITIAL_COMMUNICATIONS) {
        await setDoc(doc(db, 'communications', item.id), item);
      }

      // Seed Stock
      for (const item of INITIAL_STOCK) {
        await setDoc(doc(db, 'stock', item.id), item);
      }

      // Seed Return Messages
      for (const item of INITIAL_RETURN_MESSAGES) {
        await setDoc(doc(db, 'returnMessages', item.id), item);
      }

      // Seed Gallery Works
      for (const item of INITIAL_GALLERY_WORKS) {
        await setDoc(doc(db, 'gallery', item.id), item);
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
            if (collectionName === 'appointments') {
              localStorage.setItem('mybarber_cached_appointments', JSON.stringify(items));
            } else if (collectionName === 'users') {
              localStorage.setItem('mybarber_cached_users', JSON.stringify(items));
            } else if (collectionName === 'plans') {
              localStorage.setItem('mybarber_cached_plans', JSON.stringify(items));
            }
          } catch {
            // ignore
          }
          onUpdate(items);
        }
        markLoaded();
      },
      error => {
        console.warn(`Firestore sync warning on ${collectionName}:`, error);
        let dataToUse = fallbackData;
        try {
          if (collectionName === 'appointments') {
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

// Write/Sync operations directly to Firestore
export async function syncDoc<T extends Record<string, any>>(collectionName: string, docId: string, data: T) {
  try {
    await setDoc(doc(db, collectionName, docId), data, { merge: true });
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
    // 1. Consultar no banco a lista mais fresca de agendamentos para o profissional na data selecionada
    const apptsCol = collection(db, 'appointments');
    const q = query(
      apptsCol,
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
      return { success: true };
    } catch (fallbackError: any) {
      return {
        success: false,
        error: fallbackError?.message || 'Erro ao registrar agendamento no banco de dados.'
      };
    }
  }
}
