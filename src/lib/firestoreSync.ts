import {
  collection,
  doc,
  setDoc,
  getDocs,
  onSnapshot,
  deleteDoc
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
  INITIAL_SUBSCRIPTION_PAYMENTS
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
          onUpdate(items);
        }
        markLoaded();
      },
      error => {
        console.warn(`Firestore sync warning on ${collectionName}:`, error);
        onUpdate(fallbackData);
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
