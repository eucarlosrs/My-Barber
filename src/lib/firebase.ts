import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { resolveClientFirebaseConfig } from './environmentConfig.js';
import { initAppCheck } from './appCheck';

// Resolve configuration dynamically (preserving exact defaults when not in sandbox)
export const firebaseConfig = resolveClientFirebaseConfig();

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Firebase App Check early to protect outgoing Firestore and Storage requests
export const appCheck = initAppCheck(app);

// Initialize Firestore with custom databaseId and experimentalAutoDetectLongPolling for stable connection in sandbox/iframe environments
export const db = initializeFirestore(
  app,
  {
    experimentalAutoDetectLongPolling: true,
  },
  firebaseConfig.firestoreDatabaseId || undefined
);
export const auth = getAuth(app);
export const storage = getStorage(app, firebaseConfig.storageBucket || undefined);
export default app;
