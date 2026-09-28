import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED_CHALLENGES, seedDocuments } from '../js/seed.js';
import { STATUS, validateChallengeInput } from '../js/logic.js';

test('there are 20 default challenges with unique ids', () => {
  assert.equal(SEED_CHALLENGES.length, 20);
  assert.equal(new Set(SEED_CHALLENGES.map((c) => c.id)).size, 20);
});

test('every default challenge passes validation unchanged', () => {
  for (const c of SEED_CHALLENGES) {
    const result = validateChallengeInput(c);
    assert.equal(result.ok, true, `${c.id}: ${JSON.stringify(result.errors)}`);
    assert.deepEqual(result.value, { title: c.title, details: c.details, category: c.category });
  }
});

test('categories hold 4, 10 and 6 challenges', () => {
  const count = (id) => SEED_CHALLENGES.filter((c) => c.category === id).length;
  assert.deepEqual([count('aereo'), count('strada'), count('pub')], [4, 10, 6]);
});

test('seedDocuments builds deck challenges stamped with the given time', () => {
  const docs = seedDocuments(42);
  assert.equal(docs.length, 20);
  assert.equal(docs[0].id, 'seed-01');
  for (const d of docs) {
    assert.equal(d.status, STATUS.DECK);
    assert.equal(d.createdAt, 42);
    assert.equal(d.updatedAt, 42);
    assert.equal(d.drawnAt, null);
  }
});
