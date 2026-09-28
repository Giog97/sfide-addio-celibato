// Pure domain logic: no DOM and no storage. Shared by the UI, the stores and the tests.

export const CATEGORIES = Object.freeze([
  Object.freeze({ id: 'aereo', label: 'Aereo', hint: 'In volo e in aeroporto' }),
  Object.freeze({ id: 'strada', label: 'In strada', hint: 'Piazze, vie e passanti' }),
  Object.freeze({ id: 'pub', label: 'Pub', hint: 'Pub, ristoranti e locali' }),
]);

export const CATEGORY_IDS = Object.freeze(CATEGORIES.map((category) => category.id));

export const STATUS = Object.freeze({
  DECK: 'deck',
  DRAWN: 'drawn',
  PASSED: 'passed',
  FAILED: 'failed',
  DISCARDED: 'discarded',
});

export const STATUS_LABELS = Object.freeze({
  deck: 'Nel mazzo',
  drawn: 'Da marcare',
  passed: 'Superata',
  failed: 'Non superata',
  discarded: 'Scartata',
});

export const LIMITS = Object.freeze({ title: 80, details: 500 });

const HISTORY_STATUSES = new Set([STATUS.DRAWN, STATUS.PASSED, STATUS.FAILED]);
const RESOLVABLE_STATUSES = [STATUS.DRAWN, STATUS.PASSED, STATUS.FAILED];

export function categoryById(id) {
  return CATEGORIES.find((category) => category.id === id) ?? null;
}

/** Validates a new or edited challenge. Returns trimmed values or per-field errors. */
export function validateChallengeInput(input) {
  const title = String(input?.title ?? '').trim();
  const details = String(input?.details ?? '').trim();
  const category = String(input?.category ?? '');
  const errors = {};

  if (!title) errors.title = 'Scrivi un titolo.';
  else if (title.length > LIMITS.title) errors.title = `Massimo ${LIMITS.title} caratteri.`;
  if (details.length > LIMITS.details) errors.details = `Massimo ${LIMITS.details} caratteri.`;
  if (!CATEGORY_IDS.includes(category)) errors.category = 'Scegli una categoria.';

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value: { title, details, category } };
}

/** Stored shape of a brand new challenge, without id. */
export function newChallenge(value, now) {
  return {
    title: value.title,
    details: value.details,
    category: value.category,
    status: STATUS.DECK,
    createdAt: now,
    updatedAt: now,
    drawnAt: null,
    resolvedAt: null,
  };
}

export function deckOf(challenges, category) {
  return challenges.filter((c) => c.status === STATUS.DECK && c.category === category);
}

/** Uniformly random element, or null for an empty list. `random` returns a number in [0, 1). */
export function pickRandom(items, random = Math.random) {
  if (items.length === 0) return null;
  return items[Math.min(Math.floor(random() * items.length), items.length - 1)];
}

/** Drawn, passed and failed challenges, most recent draw first. */
export function historyOf(challenges) {
  return challenges
    .filter((c) => HISTORY_STATUSES.has(c.status))
    .sort((a, b) => (b.drawnAt ?? 0) - (a.drawnAt ?? 0) || b.updatedAt - a.updatedAt);
}

export function statsOf(challenges) {
  const stats = { passed: 0, failed: 0, pending: 0, deck: 0, deckByCategory: {} };
  for (const id of CATEGORY_IDS) stats.deckByCategory[id] = 0;
  for (const c of challenges) {
    if (c.status === STATUS.PASSED) stats.passed += 1;
    else if (c.status === STATUS.FAILED) stats.failed += 1;
    else if (c.status === STATUS.DRAWN) stats.pending += 1;
    else if (c.status === STATUS.DECK) {
      stats.deck += 1;
      if (Object.hasOwn(stats.deckByCategory, c.category)) stats.deckByCategory[c.category] += 1;
    }
  }
  return stats;
}

/** Deck page model: challenges by category (discarded excluded) plus the discarded ones. */
export function deckView(challenges) {
  const byTitle = (a, b) => a.title.localeCompare(b.title, 'it');
  const groups = CATEGORIES.map((category) => ({
    category,
    items: challenges.filter((c) => c.category === category.id && c.status !== STATUS.DISCARDED).sort(byTitle),
  }));
  const discarded = challenges.filter((c) => c.status === STATUS.DISCARDED).sort(byTitle);
  return { groups, discarded };
}

/** Splits the last "Serve: ..." note (what to bring) off the details text. */
export function splitNeeds(details) {
  const text = details ?? '';
  const match = /^(.*)\bServe:\s*(.+?)\.?\s*$/s.exec(text);
  return match ? { text: match[1].trim(), needs: match[2] } : { text, needs: '' };
}

/**
 * Coerces a stored document into a challenge the UI can render, or returns null.
 * Documents written by the app always pass unchanged; this guards against edits made by hand
 * in the Firebase console, which bypass the security rules.
 */
export function normalizeChallenge(id, data) {
  if (typeof id !== 'string' || id === '' || !data) return null;
  if (!CATEGORY_IDS.includes(data.category) || !Object.hasOwn(STATUS_LABELS, data.status)) return null;
  const time = (value) => (Number.isFinite(value) ? value : null);
  return {
    id,
    title: String(data.title ?? '').slice(0, LIMITS.title) || 'Senza titolo',
    details: String(data.details ?? ''),
    category: data.category,
    status: data.status,
    createdAt: time(data.createdAt) ?? 0,
    updatedAt: time(data.updatedAt) ?? 0,
    drawnAt: time(data.drawnAt),
    resolvedAt: time(data.resolvedAt),
  };
}

export function isResolvable(challenge) {
  return RESOLVABLE_STATUSES.includes(challenge.status);
}

// Transitions: each returns the patch to store, or throws if the move is not allowed.

function assertStatus(challenge, allowed, action) {
  if (!allowed.includes(challenge.status)) {
    throw new Error(`Cannot ${action} a challenge with status "${challenge.status}"`);
  }
}

export function drawPatch(challenge, now) {
  assertStatus(challenge, [STATUS.DECK], 'draw');
  return { status: STATUS.DRAWN, drawnAt: now, resolvedAt: null, updatedAt: now };
}

export function resolvePatch(challenge, result, now) {
  if (result !== STATUS.PASSED && result !== STATUS.FAILED) throw new Error(`Invalid result "${result}"`);
  assertStatus(challenge, RESOLVABLE_STATUSES, 'resolve');
  return { status: result, resolvedAt: now, updatedAt: now };
}

export function putBackPatch(challenge, now) {
  assertStatus(challenge, [STATUS.DRAWN], 'put back');
  return { status: STATUS.DECK, drawnAt: null, resolvedAt: null, updatedAt: now };
}

export function discardPatch(challenge, now) {
  assertStatus(challenge, [STATUS.DECK], 'discard');
  return { status: STATUS.DISCARDED, updatedAt: now };
}

export function restorePatch(challenge, now) {
  assertStatus(challenge, [STATUS.DISCARDED], 'restore');
  return { status: STATUS.DECK, drawnAt: null, resolvedAt: null, updatedAt: now };
}

export function editPatch(value, now) {
  return { title: value.title, details: value.details, category: value.category, updatedAt: now };
}
