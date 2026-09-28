// localStorage store: one device, no sync. Used when Firebase is not configured, and in tests.

import { newChallenge, normalizeChallenge } from '../logic.js';
import { seedDocuments } from '../seed.js';

export const STORAGE_KEY = 'sfide-addio-celibato:v1:challenges';

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
  };
}
