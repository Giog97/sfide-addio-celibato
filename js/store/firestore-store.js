// Firestore store: realtime sync across devices, persistent offline cache and queued writes.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  collection,
  doc,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  runTransaction,
  setDoc,
  updateDoc,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { newChallenge, normalizeChallenge } from '../logic.js';
import { normalizeQuiz } from '../quiz.js';
import { seedDocuments } from '../seed.js';
import { createSeeder, describeQuizWriteError, describeWriteError, errorStatus, statusOf } from './firestore-helpers.js';

export function createFirestoreStore(firebaseConfig) {
  const app = initializeApp(firebaseConfig);
  // Without IndexedDB the SDK falls back to a memory cache by itself and logs a warning.
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  const challengesRef = collection(db, 'challenges');
  const seedRef = doc(db, 'meta', 'seed');
  const quizRef = doc(db, 'quiz', 'dolce-meta');
  const errorHandlers = new Set();

  // Loads the default challenges once per project; the transaction makes concurrent first launches safe.
  // It is also the first request that reaches the backend, so setup errors (wrong project, rules not
  // published) surface here even while the listener keeps retrying silently.
  const seeder = createSeeder(() =>
    runTransaction(db, async (transaction) => {
      const marker = await transaction.get(seedRef);
      if (marker.exists()) return;
      const now = Date.now();
      transaction.set(seedRef, { seededAt: now });
      for (const { id, ...data } of seedDocuments(now)) transaction.set(doc(challengesRef, id), data);
    }),
  );

  function reportWriteError(error, describe = describeWriteError) {
    console.error(error);
    for (const handler of errorHandlers) handler(describe(error));
  }

  return {
    mode: 'firestore',
    subscribe({ onChange, onStatus = () => {}, onError = () => {} }) {
      errorHandlers.add(onError);
      onStatus({ state: 'connecting' });
      const fail = (error) => onStatus(errorStatus(error));
      const seed = () => seeder.run(fail);
      const seedWhenVisible = () => {
        if (document.visibilityState === 'visible') seed();
      };
      const unsubscribe = onSnapshot(
        challengesRef,
        { includeMetadataChanges: true },
        (snapshot) => {
          onChange(snapshot.docs.map((d) => normalizeChallenge(d.id, d.data())).filter(Boolean));
          onStatus(seeder.failure ? errorStatus(seeder.failure) : statusOf(snapshot.metadata));
          // A server snapshot proves the backend is reachable: retry seeding if it is still pending.
          if (!snapshot.metadata.fromCache) seed();
        },
        (error) => {
          console.error(error);
          fail(error);
        },
      );
      // Other retry points for a pending seed, in case no new server snapshot arrives.
      seed();
      globalThis.addEventListener('online', seed);
      document.addEventListener('visibilitychange', seedWhenVisible);
      return () => {
        unsubscribe();
        globalThis.removeEventListener('online', seed);
        document.removeEventListener('visibilitychange', seedWhenVisible);
        errorHandlers.delete(onError);
      };
    },
    // Writes are fire-and-forget: offline they queue in the local cache and never block the UI.
    add(value) {
      const ref = doc(challengesRef);
      setDoc(ref, newChallenge(value, Date.now())).catch(reportWriteError);
      return ref.id;
    },
    update(id, patch) {
      updateDoc(doc(challengesRef, id), patch).catch(reportWriteError);
    },
    // fromCache tells "no quiz yet" apart from "not downloaded on this phone yet".
    subscribeQuiz(onChange) {
      return onSnapshot(
        quizRef,
        { includeMetadataChanges: true },
        (snapshot) => onChange(normalizeQuiz(snapshot.data()), { fromCache: snapshot.metadata.fromCache }),
        // Setup problems already show through the challenges listener.
        (error) => console.error(error),
      );
    },
    saveQuiz(items) {
      setDoc(quizRef, { items: normalizeQuiz({ items }), updatedAt: Date.now() }).catch((error) =>
        reportWriteError(error, describeQuizWriteError),
      );
    },
  };
}
