// Use runtime requires so `firebase` is optional and Metro won't try to
// statically resolve the module during bundling if it's not installed.
let app: any = null;
let db: any = null;
let firestoreFns: any = null;
let auth: any = null;
let authFns: any = null;

export const initFirebase = (config: Record<string, any>) => {
  if (app) {
    return;
  }

  try {
    // runtime require to avoid Metro resolving this at bundle-time
    // if the dependency isn't installed.
    const firebaseApp = require('firebase/app');
    const firestore = require('firebase/firestore');
    const firebaseAuth = require('firebase/auth');

    app = firebaseApp.initializeApp(config);
    db = firestore.getFirestore(app);
    firestoreFns = firestore;
    auth = firebaseAuth.getAuth(app);
    authFns = firebaseAuth;
  } catch (e) {
    // rethrow with clearer message
    throw new Error(
      'Failed to initialize Firebase. Ensure `firebase` is installed and configured.',
    );
  }
};

export const getFirestoreInstance = () => {
  if (!db) {
    throw new Error('Firestore not initialized. Call initFirebase first.');
  }

  return db;
};

export const getAuthInstance = () => {
  if (!auth) {
    throw new Error('Firebase Auth not initialized. Call initFirebase first.');
  }

  return auth;
};

// Export a small set of firestore helpers that delegate to the runtime
// firestore functions. They will throw if `initFirebase` wasn't called.
export const doc = (...args: any[]) => firestoreFns?.doc(...args);
export const getDoc = (...args: any[]) => firestoreFns?.getDoc(...args);
export const setDoc = (...args: any[]) => firestoreFns?.setDoc(...args);
export const updateDoc = (...args: any[]) => firestoreFns?.updateDoc(...args);
export const collection = (...args: any[]) => firestoreFns?.collection(...args);
export const query = (...args: any[]) => firestoreFns?.query(...args);
export const where = (...args: any[]) => firestoreFns?.where(...args);
export const getDocs = (...args: any[]) => firestoreFns?.getDocs(...args);
export const writeBatch = (...args: any[]) => firestoreFns?.writeBatch(...args);
export const onAuthStateChanged = (...args: any[]) =>
  authFns?.onAuthStateChanged(...args);
export const signInWithEmailAndPassword = (...args: any[]) =>
  authFns?.signInWithEmailAndPassword(...args);
export const createUserWithEmailAndPassword = (...args: any[]) =>
  authFns?.createUserWithEmailAndPassword(...args);
export const signOutFirebase = (...args: any[]) => authFns?.signOut(...args);
