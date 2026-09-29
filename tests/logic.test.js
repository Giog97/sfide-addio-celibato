import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY_IDS,
  LIMITS,
  STATUS,
  deckOf,
  deckView,
  discardPatch,
  drawPatch,
  editPatch,
  historyGroups,
  historyOf,
  isResolvable,
  newChallenge,
  normalizeChallenge,
  pickRandom,
  putBackPatch,
  resolvePatch,
  restorePatch,
  splitNeeds,
  statsOf,
  validateChallengeInput,
} from '../js/logic.js';

const NOW = 1_700_000_000_000;

function challenge(overrides = {}) {
  return {
    id: 'c1',
    title: 'Titolo',
    details: '',
    category: 'pub',
    status: STATUS.DECK,
    createdAt: NOW,
    updatedAt: NOW,
    drawnAt: null,
    resolvedAt: null,
    ...overrides,
  };
}

test('categories are aereo, strada and pub', () => {
  assert.deepEqual(CATEGORY_IDS, ['aereo', 'strada', 'pub']);
});

test('validateChallengeInput trims and accepts valid input', () => {
  const result = validateChallengeInput({ title: '  Canta  ', details: ' forte ', category: 'pub' });
  assert.deepEqual(result, { ok: true, value: { title: 'Canta', details: 'forte', category: 'pub' } });
});

test('validateChallengeInput accepts fields exactly at the limits', () => {
  const result = validateChallengeInput({
    title: 'x'.repeat(LIMITS.title),
    details: 'y'.repeat(LIMITS.details),
    category: 'pub',
  });
  assert.equal(result.ok, true);
});

test('validateChallengeInput treats missing details as empty', () => {
  const result = validateChallengeInput({ title: 'Ok', category: 'strada' });
  assert.deepEqual(result.value, { title: 'Ok', details: '', category: 'strada' });
});

test('validateChallengeInput rejects empty title, long fields and unknown category', () => {
  const result = validateChallengeInput({
    title: '   ',
    details: 'x'.repeat(LIMITS.details + 1),
    category: 'spiaggia',
  });
  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result.errors).sort(), ['category', 'details', 'title']);
  const long = validateChallengeInput({ title: 'x'.repeat(LIMITS.title + 1), category: 'aereo' });
  assert.equal(long.ok, false);
  assert.ok(long.errors.title);
});

test('newChallenge starts in the deck', () => {
  assert.deepEqual(newChallenge({ title: 'T', details: 'D', category: 'aereo' }, NOW), {
    title: 'T',
    details: 'D',
    category: 'aereo',
    status: STATUS.DECK,
    createdAt: NOW,
    updatedAt: NOW,
    drawnAt: null,
    resolvedAt: null,
  });
});

test('deckOf keeps only deck challenges of the category', () => {
  const list = [
    challenge({ id: 'a', category: 'pub' }),
    challenge({ id: 'b', category: 'pub', status: STATUS.DRAWN }),
    challenge({ id: 'c', category: 'aereo' }),
    challenge({ id: 'd', category: 'pub', status: STATUS.DISCARDED }),
  ];
  assert.deepEqual(deckOf(list, 'pub').map((c) => c.id), ['a']);
});

test('pickRandom maps the random value to an index and handles edges', () => {
  const items = ['a', 'b', 'c', 'd'];
  assert.equal(pickRandom(items, () => 0), 'a');
  assert.equal(pickRandom(items, () => 0.5), 'c');
  assert.equal(pickRandom(items, () => 0.9999), 'd');
  assert.equal(pickRandom(items, () => 1), 'd');
  assert.equal(pickRandom([], () => 0.5), null);
});

test('historyOf lists drawn, passed and failed by most recent draw', () => {
  const list = [
    challenge({ id: 'old', status: STATUS.PASSED, drawnAt: NOW + 1 }),
    challenge({ id: 'deck', status: STATUS.DECK }),
    challenge({ id: 'new', status: STATUS.DRAWN, drawnAt: NOW + 3 }),
    challenge({ id: 'mid', status: STATUS.FAILED, drawnAt: NOW + 2 }),
    challenge({ id: 'gone', status: STATUS.DISCARDED }),
  ];
  assert.deepEqual(historyOf(list).map((c) => c.id), ['new', 'mid', 'old']);
});

test('historyOf breaks draw-time ties by the latest update', () => {
  const list = [
    challenge({ id: 'first', status: STATUS.PASSED, drawnAt: NOW, updatedAt: NOW + 1 }),
    challenge({ id: 'second', status: STATUS.FAILED, drawnAt: NOW, updatedAt: NOW + 2 }),
  ];
  assert.deepEqual(historyOf(list).map((c) => c.id), ['second', 'first']);
});

test('statsOf counts results and the remaining deck per category', () => {
  const list = [
    challenge({ status: STATUS.PASSED }),
    challenge({ status: STATUS.FAILED }),
    challenge({ status: STATUS.FAILED }),
    challenge({ status: STATUS.DRAWN }),
    challenge({ status: STATUS.DECK, category: 'aereo' }),
    challenge({ status: STATUS.DECK, category: 'pub' }),
    challenge({ status: STATUS.DISCARDED, category: 'pub' }),
  ];
  assert.deepEqual(statsOf(list), {
    passed: 1,
    failed: 2,
    pending: 1,
    deck: 2,
    deckByCategory: { aereo: 1, strada: 0, pub: 1 },
  });
});

test('deckView groups by category and separates discarded challenges', () => {
  const list = [
    challenge({ id: 'z', title: 'Zeta', category: 'pub' }),
    challenge({ id: 'a', title: 'Alfa', category: 'pub', status: STATUS.PASSED }),
    challenge({ id: 'x', title: 'Scartata', category: 'aereo', status: STATUS.DISCARDED }),
  ];
  const view = deckView(list);
  assert.deepEqual(view.groups.map((g) => g.category.id), ['aereo', 'strada', 'pub']);
  assert.deepEqual(view.groups[0].items, []);
  assert.deepEqual(view.groups[2].items.map((c) => c.id), ['a', 'z']);
  assert.deepEqual(view.discarded.map((c) => c.id), ['x']);
});

test('splitNeeds separates a trailing "Serve:" note', () => {
  assert.deepEqual(splitNeeds('Fai un trucco di magia a due passanti. Serve: mazzo di carte.'), {
    text: 'Fai un trucco di magia a due passanti.',
    needs: 'mazzo di carte',
  });
  assert.deepEqual(splitNeeds('Serve: benda'), { text: '', needs: 'benda' });
  assert.deepEqual(splitNeeds('Nessun occorrente.'), { text: 'Nessun occorrente.', needs: '' });
  assert.deepEqual(splitNeeds(''), { text: '', needs: '' });
});

test('splitNeeds uses the last "Serve:" note', () => {
  assert.deepEqual(splitNeeds('Serve: pazienza. Poi balla. Serve: musica.'), {
    text: 'Serve: pazienza. Poi balla.',
    needs: 'musica',
  });
});

test('normalizeChallenge keeps valid documents unchanged', () => {
  const { id, ...data } = challenge({ status: STATUS.DRAWN, drawnAt: NOW });
  assert.deepEqual(normalizeChallenge(id, data), { id, ...data });
});

test('normalizeChallenge drops documents the app cannot show', () => {
  const { id, ...data } = challenge();
  assert.equal(normalizeChallenge(id, { ...data, category: 'spiaggia' }), null);
  assert.equal(normalizeChallenge(id, { ...data, status: 'lost' }), null);
  assert.equal(normalizeChallenge('', data), null);
  assert.equal(normalizeChallenge(id, null), null);
});

test('normalizeChallenge repairs missing or malformed fields', () => {
  assert.deepEqual(normalizeChallenge('manual', { category: 'aereo', status: STATUS.DECK, extra: true, drawnAt: 'ieri' }), {
    id: 'manual',
    title: 'Senza titolo',
    details: '',
    category: 'aereo',
    status: STATUS.DECK,
    createdAt: 0,
    updatedAt: 0,
    drawnAt: null,
    resolvedAt: null,
  });
});

test('drawPatch moves a deck challenge to drawn', () => {
  assert.deepEqual(drawPatch(challenge(), NOW), {
    status: STATUS.DRAWN,
    drawnAt: NOW,
    resolvedAt: null,
    updatedAt: NOW,
  });
  assert.throws(() => drawPatch(challenge({ status: STATUS.PASSED }), NOW));
});

test('resolvePatch marks and re-marks results', () => {
  assert.deepEqual(resolvePatch(challenge({ status: STATUS.DRAWN }), STATUS.PASSED, NOW), {
    status: STATUS.PASSED,
    resolvedAt: NOW,
    updatedAt: NOW,
  });
  assert.equal(resolvePatch(challenge({ status: STATUS.PASSED }), STATUS.FAILED, NOW).status, STATUS.FAILED);
  assert.throws(() => resolvePatch(challenge({ status: STATUS.DECK }), STATUS.PASSED, NOW));
  assert.throws(() => resolvePatch(challenge({ status: STATUS.DRAWN }), STATUS.DECK, NOW));
});

test('isResolvable is true only for drawn, passed and failed', () => {
  assert.deepEqual(
    Object.values(STATUS).filter((status) => isResolvable(challenge({ status }))),
    [STATUS.DRAWN, STATUS.PASSED, STATUS.FAILED],
  );
});

test('putBackPatch returns drawn and already marked challenges to the deck', () => {
  for (const status of [STATUS.DRAWN, STATUS.PASSED, STATUS.FAILED]) {
    assert.deepEqual(putBackPatch(challenge({ status, drawnAt: NOW, resolvedAt: NOW }), NOW + 1), {
      status: STATUS.DECK,
      drawnAt: null,
      resolvedAt: null,
      updatedAt: NOW + 1,
    });
  }
  assert.throws(() => putBackPatch(challenge({ status: STATUS.DECK }), NOW));
  assert.throws(() => putBackPatch(challenge({ status: STATUS.DISCARDED }), NOW));
});

test('historyGroups splits challenges to mark from marked ones, most recent first', () => {
  const list = [
    challenge({ id: 'old-pass', status: STATUS.PASSED, drawnAt: NOW + 1 }),
    challenge({ id: 'new-draw', status: STATUS.DRAWN, drawnAt: NOW + 4 }),
    challenge({ id: 'deck', status: STATUS.DECK }),
    challenge({ id: 'old-draw', status: STATUS.DRAWN, drawnAt: NOW + 2 }),
    challenge({ id: 'new-fail', status: STATUS.FAILED, drawnAt: NOW + 3 }),
  ];
  const groups = historyGroups(list);
  assert.deepEqual(groups.pending.map((c) => c.id), ['new-draw', 'old-draw']);
  assert.deepEqual(groups.marked.map((c) => c.id), ['new-fail', 'old-pass']);
});

test('discardPatch and restorePatch only move between deck and discarded', () => {
  assert.deepEqual(discardPatch(challenge(), NOW), { status: STATUS.DISCARDED, updatedAt: NOW });
  assert.throws(() => discardPatch(challenge({ status: STATUS.DRAWN }), NOW));
  assert.deepEqual(restorePatch(challenge({ status: STATUS.DISCARDED }), NOW), {
    status: STATUS.DECK,
    drawnAt: null,
    resolvedAt: null,
    updatedAt: NOW,
  });
  assert.throws(() => restorePatch(challenge(), NOW));
});

test('editPatch copies the editable fields', () => {
  assert.deepEqual(editPatch({ title: 'T', details: 'D', category: 'strada' }, NOW), {
    title: 'T',
    details: 'D',
    category: 'strada',
    updatedAt: NOW,
  });
});
