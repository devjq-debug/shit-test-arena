import {
  browserSessionPersistence,
  onAuthStateChanged,
  setPersistence,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { auth } from './firebase-config.js?v=2';

export { auth, onAuthStateChanged };

async function useSessionPersistence() {
  await setPersistence(auth, browserSessionPersistence);
}

export async function ensurePlayerUser({ fresh = false } = {}) {
  await useSessionPersistence();
  await auth.authStateReady?.();
  if (!fresh && auth.currentUser?.isAnonymous) return auth.currentUser;
  if (auth.currentUser) await signOut(auth);
  return (await signInAnonymously(auth)).user;
}

export async function signInAdmin(email, password) {
  await useSessionPersistence();
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signOutCurrentUser() {
  return signOut(auth);
}

export function watchAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}
