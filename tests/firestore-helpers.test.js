import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSeeder,
  describeError,
  describeQuizWriteError,
  describeWriteError,
  errorStatus,
  isSetupError,
  statusOf,
} from '../js/store/firestore-helpers.js';

const setupError = Object.assign(new Error('denied'), { code: 'permission-denied' });
const networkError = Object.assign(new Error('offline'), { code: 'unavailable' });

test('describeError maps known codes and falls back to the code', () => {
  assert.match(describeError(setupError), /negato l'accesso/);
  assert.match(describeError({ code: 'not-found' }), /non trovato/);
  assert.match(describeError({ code: 'resource-exhausted' }), /resource-exhausted/);
  assert.match(describeError(undefined), /sconosciuto/);
});

test('describeWriteError explains rejected writes as conflicts', () => {
  assert.match(describeWriteError(setupError), /un altro telefono/);
  assert.equal(describeWriteError(networkError), describeError(networkError));
});

test('describeQuizWriteError points to the rules', () => {
  assert.match(describeQuizWriteError(setupError), /firestore\.rules/);
  assert.equal(describeQuizWriteError(networkError), describeError(networkError));
});

test('isSetupError separates setup problems from transient failures', () => {
  for (const code of ['permission-denied', 'not-found', 'failed-precondition', 'invalid-argument', 'unimplemented']) {
    assert.equal(isSetupError({ code }), true, code);
  }
  for (const code of ['unavailable', 'deadline-exceeded', 'aborted', 'internal', 'unknown', 'resource-exhausted']) {
    assert.equal(isSetupError({ code }), false, code);
  }
  assert.equal(isSetupError(new Error('no code')), false);
});

test('errorStatus wraps the message', () => {
  assert.deepEqual(errorStatus(setupError), { state: 'error', message: describeError(setupError) });
});

test('statusOf reads snapshot metadata and connectivity', () => {
  assert.deepEqual(statusOf({ hasPendingWrites: true, fromCache: true }, false), { state: 'pending' });
  assert.deepEqual(statusOf({ hasPendingWrites: false, fromCache: true }, false), { state: 'offline' });
  assert.deepEqual(statusOf({ hasPendingWrites: false, fromCache: true }, true), { state: 'connecting' });
  assert.deepEqual(statusOf({ hasPendingWrites: false, fromCache: false }, true), { state: 'synced' });
});

test('createSeeder runs the seed once and shares concurrent attempts', async () => {
  let calls = 0;
  const seeder = createSeeder(async () => {
    calls += 1;
  });
  await Promise.all([seeder.run(() => {}), seeder.run(() => {})]);
  await seeder.run(() => {});
  assert.equal(calls, 1);
  assert.equal(seeder.failure, null);
});

test('createSeeder retries after a transient failure', async (t) => {
  t.mock.method(console, 'warn', () => {});
  let calls = 0;
  const failures = [];
  const seeder = createSeeder(async () => {
    calls += 1;
    if (calls === 1) throw networkError;
  });
  await seeder.run((error) => failures.push(error));
  await seeder.run((error) => failures.push(error));
  await seeder.run((error) => failures.push(error));
  assert.equal(calls, 2);
  assert.deepEqual(failures, []);
  assert.equal(seeder.failure, null);
});

test('createSeeder reports a setup error once and stops retrying', async () => {
  let calls = 0;
  const failures = [];
  const seeder = createSeeder(async () => {
    calls += 1;
    throw setupError;
  });
  await seeder.run((error) => failures.push(error));
  await seeder.run((error) => failures.push(error));
  assert.equal(calls, 1);
  assert.deepEqual(failures, [setupError]);
  assert.equal(seeder.failure, setupError);
});
