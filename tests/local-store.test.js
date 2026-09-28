import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, createLocalStore } from '../js/store/local-store.js';
import { SEED_CHALLENGES } from '../js/seed.js';
import { STATUS } from '../js/logic.js';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

function setup(storage = memoryStorage()) {
  let counter = 0;
  const store = createLocalStore({ storage, now: () => 1000, newId: () => `id-${++counter}` });
  return { storage, store };
}

function latest(store) {
  let list;
  store.subscribe({
    onChange: (challenges) => {
      list = challenges;
    },
  });
  return list;
}

test('first use seeds the default challenges', () => {
  const { store, storage } = setup();
  const list = latest(store);
  assert.equal(list.length, SEED_CHALLENGES.length);
  assert.ok(list.every((c) => c.status === STATUS.DECK && c.createdAt === 1000));
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).length, SEED_CHALLENGES.length);
});

test('subscribe reports local mode', () => {
  const { store } = setup();
  let status;
  store.subscribe({
    onChange: () => {},
    onStatus: (value) => {
      status = value;
    },
  });
  assert.deepEqual(status, { state: 'local' });
});

test('add appends a deck challenge and notifies subscribers', () => {
  const { store } = setup();
  const lists = [];
  store.subscribe({ onChange: (challenges) => lists.push(challenges) });
  const id = store.add({ title: 'Nuova', details: '', category: 'pub' });
  assert.equal(id, 'id-1');
  const last = lists.at(-1);
  assert.equal(last.length, SEED_CHALLENGES.length + 1);
  assert.deepEqual(
    last.find((c) => c.id === 'id-1'),
    {
      id: 'id-1',
      title: 'Nuova',
      details: '',
      category: 'pub',
      status: STATUS.DECK,
      createdAt: 1000,
      updatedAt: 1000,
      drawnAt: null,
      resolvedAt: null,
    },
  );
});

test('update merges the patch and persists it', () => {
  const { store, storage } = setup();
  store.update('seed-01', { status: STATUS.DRAWN, drawnAt: 5, updatedAt: 5 });
  const reloaded = createLocalStore({ storage, now: () => 2000 });
  const c = latest(reloaded).find((x) => x.id === 'seed-01');
  assert.equal(c.status, STATUS.DRAWN);
  assert.equal(c.drawnAt, 5);
  assert.equal(c.createdAt, 1000);
});

test('update rejects unknown ids', () => {
  const { store } = setup();
  assert.throws(() => store.update('nope', { status: STATUS.DRAWN }), /Unknown challenge/);
});

test('unsubscribe stops notifications', () => {
  const { store } = setup();
  let calls = 0;
  const unsubscribe = store.subscribe({
    onChange: () => {
      calls += 1;
    },
  });
  unsubscribe();
  store.add({ title: 'X', details: '', category: 'aereo' });
  assert.equal(calls, 1);
});

test('corrupt data falls back to the defaults', (t) => {
  t.mock.method(console, 'warn', () => {});
  const { store } = setup(memoryStorage({ [STORAGE_KEY]: '{not json' }));
  assert.equal(latest(store).length, SEED_CHALLENGES.length);
});

test('a stored value that is not a list falls back to the defaults', (t) => {
  t.mock.method(console, 'warn', () => {});
  const { store } = setup(memoryStorage({ [STORAGE_KEY]: '{"challenges":[]}' }));
  assert.equal(latest(store).length, SEED_CHALLENGES.length);
});

test('stored entries the app cannot show are dropped', () => {
  const valid = {
    id: 'ok',
    title: 'Valida',
    details: '',
    category: 'pub',
    status: STATUS.DECK,
    createdAt: 1,
    updatedAt: 1,
    drawnAt: null,
    resolvedAt: null,
  };
  const stored = JSON.stringify([valid, { id: 'bad', title: 'X', category: 'spiaggia', status: STATUS.DECK }]);
  const { store } = setup(memoryStorage({ [STORAGE_KEY]: stored }));
  assert.deepEqual(latest(store), [valid]);
});

test('subscribers receive copies, not the internal state', () => {
  const { store } = setup();
  latest(store)[0].status = 'tampered';
  assert.equal(latest(store)[0].status, STATUS.DECK);
});
