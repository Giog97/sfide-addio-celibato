// Firestore store logic that needs no SDK imports, so the Node tests can cover it.

const ERROR_MESSAGES = {
  'permission-denied':
    "Firestore ha negato l'accesso: controlla la configurazione e le regole di sicurezza del progetto, poi ricarica.",
  'not-found': 'Database Firestore non trovato: crealo nel progetto Firebase, poi ricarica.',
  'failed-precondition': 'Firestore non è pronto: controlla che il database esista nel progetto Firebase.',
  unavailable: 'Firestore non è raggiungibile: le modifiche partiranno appena torna la rete.',
};

// Errors that retrying cannot fix: wrong project, missing database, rules not published.
const SETUP_ERROR_CODES = new Set(['permission-denied', 'not-found', 'failed-precondition', 'invalid-argument', 'unimplemented']);

export function describeError(error) {
  return ERROR_MESSAGES[error?.code] ?? `Errore di sincronizzazione (${error?.code ?? error?.message ?? 'sconosciuto'}).`;
}

/** The rules reject a write when another phone already moved the challenge on (or the data is invalid). */
export function describeWriteError(error) {
  return error?.code === 'permission-denied'
    ? 'Modifica rifiutata: la sfida era già stata cambiata da un altro telefono.'
    : describeError(error);
}

/** A rejected quiz write almost always means that the rules in the Firebase console predate the quiz. */
export function describeQuizWriteError(error) {
  return error?.code === 'permission-denied'
    ? "Domande non salvate: Firestore le ha rifiutate. Pubblica il nuovo firestore.rules nella console Firebase, poi ricarica l'app."
    : describeError(error);
}

export function isSetupError(error) {
  return SETUP_ERROR_CODES.has(error?.code);
}

export function errorStatus(error) {
  return { state: 'error', message: describeError(error) };
}

export function statusOf(metadata, online = globalThis.navigator?.onLine !== false) {
  if (metadata.hasPendingWrites) return { state: 'pending' };
  if (metadata.fromCache) return { state: online ? 'connecting' : 'offline' };
  return { state: 'synced' };
}

/**
 * Runs `seed` until it succeeds once. Concurrent calls share one attempt, transient failures allow
 * a later retry, and a setup error is reported once and remembered until the page reloads.
 */
export function createSeeder(seed) {
  let done = false;
  let running = null;
  let failure = null;
  return {
    get failure() {
      return failure;
    },
    run(onFailure) {
      if (done || failure) return Promise.resolve();
      if (running) return running;
      running = Promise.resolve()
        .then(seed)
        .then(
          () => {
            done = true;
          },
          (error) => {
            if (isSetupError(error)) {
              failure = error;
              onFailure(error);
            } else {
              console.warn('Default challenges not loaded yet: Firestore unreachable.', error);
            }
          },
        )
        .finally(() => {
          running = null;
        });
      return running;
    },
  };
}
