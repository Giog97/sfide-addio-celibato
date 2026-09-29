// localStorage store: one device, no sync. Used when Firebase is not configured, and in tests.

import { newChallenge, normalizeChallenge } from '../logic.js';
import { normalizeQuiz } from '../quiz.js';
import { seedDocuments } from '../seed.js';

export const STORAGE_KEY = 'sfide-addio-celibato:v1:challenges';
export const QUIZ_STORAGE_KEY = 'sfide-addio-celibato:v1:quiz';

export function createLocalStore({
  storage = globalThis.localStorage,
  now = Date.now,
  newId = () => crypto.randomUUID(),
} = {}) {
  const listeners = new Set();
  let challenges = load();

  function load() {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw !== null) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map((c) => normalizeChallenge(c?.id, c)).filter(Boolean);
      } catch {
        // Unreadable data: restore the defaults below.
      }
      console.warn('Local challenges unreadable: restoring the defaults.');
    }
    const seeded = seedDocuments(now());
    storage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }

  const snapshot = () => challenges.map((c) => ({ ...c }));

  function commit(next) {
    challenges = next;
    storage.setItem(STORAGE_KEY, JSON.stringify(challenges));
    for (const onChange of listeners) onChange(snapshot());
  }

  const quizListeners = new Set();
  let quiz = loadQuiz();

  function loadQuiz() {
    const raw = storage.getItem(QUIZ_STORAGE_KEY);
    if (raw === null) return [];
    try {
      return normalizeQuiz(JSON.parse(raw));
    } catch {
      console.warn('Local quiz unreadable: starting without questions.');
      return [];
    }
  }

  const quizSnapshot = () => quiz.map((item) => ({ ...item }));

  return {
    mode: 'local',
    subscribe({ onChange, onStatus = () => {} }) {
      listeners.add(onChange);
      onStatus({ state: 'local' });
      onChange(snapshot());
      return () => listeners.delete(onChange);
    },
    add(value) {
      const id = newId();
      commit([...challenges, { id, ...newChallenge(value, now()) }]);
      return id;
    },
    update(id, patch) {
      if (!challenges.some((c) => c.id === id)) throw new Error(`Unknown challenge "${id}"`);
      commit(challenges.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    },
    subscribeQuiz(onChange) {
      quizListeners.add(onChange);
      onChange(quizSnapshot(), { fromCache: false });
      return () => quizListeners.delete(onChange);
    },
    saveQuiz(items) {
      quiz = normalizeQuiz({ items });
      storage.setItem(QUIZ_STORAGE_KEY, JSON.stringify({ items: quiz, updatedAt: now() }));
      for (const onChange of quizListeners) onChange(quizSnapshot(), { fromCache: false });
    },
  };
}
