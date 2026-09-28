// Picks the data store: Firestore when js/firebase-config.js holds a real config, localStorage otherwise.

import { STORAGE_KEY, createLocalStore } from './local-store.js';

export async function openStore() {
  const firebaseConfig = await loadFirebaseConfig();
  if (!firebaseConfig) return createLocalStore();
  const { createFirestoreStore } = await import('./firestore-store.js');
  return createFirestoreStore(firebaseConfig);
}

async function loadFirebaseConfig() {
  const url = new URL('../firebase-config.js', import.meta.url);
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    // Network failure and no cached copy. Local mode is safe only on a device that already uses it;
    // anywhere else it would silently fork this phone's data away from the group.
    if (hasLocalData()) return null;
    throw new Error('Firebase config unreachable', { cause: error });
  }
  if (response.status === 404) return null; // No config file: local mode.
  if (!response.ok) throw new Error(`Firebase config request failed with status ${response.status}`);
  const { firebaseConfig: config } = await import(url.href);
  const values = Object.values(config ?? {});
  if (values.length === 0 || values.some((value) => String(value).includes('<'))) {
    console.warn('js/firebase-config.js still holds placeholders: running in local mode.');
    return null;
  }
  return config;
}

function hasLocalData() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}
