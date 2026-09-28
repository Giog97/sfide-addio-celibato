# Sfide Addio al Celibato: design

- Date: 2026-09-28
- Status: approved

## Goal

A mobile web app that runs the challenges of a bachelor party. The group picks a location (plane, street, pub), draws a random challenge for it, and marks the challenge passed or failed. Up to 15 phones share the same challenges in real time, and anyone can add new ones.

## Context and constraints

- Up to 15 users, organizers and possibly the groom. Undrawn challenges stay out of the normal flow, so the groom gets surprised.
- The "Aereo" challenges happen on a plane, usually without connectivity. The app works offline and syncs afterwards.
- Hosting: GitHub Pages, static files only. On GitHub Free the repository must be public.
- Sync backend: Firebase Cloud Firestore on the free Spark plan (1 GiB stored, 50,000 reads and 20,000 writes per day).
- No build step: plain HTML, CSS and JavaScript ES modules.
- UI text in Italian; code, comments and docs in English; no emojis in files.

## Features

### Home (`#/`)

- Header: app title and sync indicator.
- Counters: passed, failed, to mark, left in the deck.
- Category tiles: Aereo, In strada, Pub ("pub, ristoranti e locali"). Each tile shows how many challenges remain.
- Selecting a tile reveals the "Estrai" button.
- Buttons "Aggiungi sfida" and "Mazzo" (the deck page).
- History ("Storico"): every challenge with status drawn, passed or failed, most recent draw first, with category and status badge. Challenges to mark stand out. Tapping one opens the challenge sheet.
- Install entry point: an "Installa" button when the browser offers installation (Chrome on Android), or a dismissible hint on iOS Safari ("Condividi", then "Aggiungi alla schermata Home").

### Draw

1. "Estrai" picks a challenge uniformly at random from the selected category's deck.
2. The challenge becomes drawn at once and enters the history as "Da marcare".
3. The challenge sheet opens with a reveal animation and offers "Superata", "Non superata", "Rimetti nel mazzo" (for challenges that cannot happen right now) and "Decidi dopo".
4. "Decidi dopo" closes the sheet; the challenge stays in the history, still to mark.
5. An empty category shows a message and a shortcut to add a challenge.

A drawn challenge never comes out again unless someone puts it back in the deck.

### Challenge sheet (from the history)

- Shows the full challenge.
- Marks it passed or failed, or switches an existing result to fix a wrong tap.
- A challenge still to mark can go back to the deck.

### Add challenge

- Fields: title (required, at most 80 characters), details (optional, at most 500), category (required).
- The new challenge joins the deck. A toast confirms it; the normal flow never shows its text.

### Deck (`#/mazzo`)

- A spoiler warning precedes it every time.
- Lists all challenges by category, with status badges.
- Tapping a challenge opens the edit form: title, details, category.
- Undrawn challenges can be discarded (duplicates, bad ideas). Discarded challenges sit in a collapsed "Scartate" group and can be restored. Nothing is ever deleted.

## Data model

Firestore collection `challenges`. Local mode stores the same objects in `localStorage`.

| Field | Type | Notes |
|---|---|---|
| `title` | string, 1 to 80 characters | |
| `details` | string, 0 to 500 characters | may end with a "Serve: ..." line |
| `category` | `aereo`, `strada` or `pub` | |
| `status` | `deck`, `drawn`, `passed`, `failed` or `discarded` | |
| `createdAt`, `updatedAt` | integer, ms since epoch | client clock |
| `drawnAt`, `resolvedAt` | integer or null | |

Client timestamps (`Date.now()`) keep the history ordered offline too; phone clocks are accurate enough for a party.

The Firestore document `meta/seed` (`{ seededAt }`) records that the default challenges were loaded.

### Status transitions

| From | Action | To |
|---|---|---|
| deck | draw | drawn |
| drawn, passed, failed | mark | passed or failed |
| drawn | put back | deck (clears `drawnAt`) |
| deck | discard | discarded |
| discarded | restore | deck |

Editing title, details and category works in every status.

## Default challenges

Texts address the groom in the second person. Preparation notes become a final "Serve: ..." line. In `js/seed.js`, quotations use Italian guillemets («...»).

| Id | Category | Title | Details |
|---|---|---|---|
| seed-01 | aereo | Quiz sulla dolce metà | Rispondi alle domande che il gruppo ha preparato sulla tua dolce metà. |
| seed-02 | aereo | L'annuncio in aereo | Chiedi alle hostess di poter fare un annuncio: di' semplicemente che ti sposerai a breve e che vuoi rendere partecipe tutto l'aereo. Se le hostess ti danno l'ok e tu ti tiri indietro, gin tonic immediato. |
| seed-03 | aereo | Mano nella mano al decollo | Se accanto a te c'è uno sconosciuto, tienigli la mano durante il decollo spiegando che è il tuo primo volo e che hai tanta paura. |
| seed-04 | aereo | L'audio prima del decollo | Riproduci l'audio in aereo prima della partenza. |
| seed-05 | strada | Il matrimonio costa troppo | Con un cartello con scritto "My wedding is too expensive. Please help me!" chiedi l'elemosina ai passanti. Hai 10-15 minuti per raccogliere la cifra decisa dal gruppo: se non ci arrivi, scegli tra penitenza e bere. Serve: cartello. |
| seed-06 | strada | Televendita | Convinci tre persone a comprare un oggetto totalmente inutile, inventandone le qualità. |
| seed-07 | strada | Il mago di strada | Fai un trucco di magia a due passanti. Serve: mazzo di carte. |
| seed-08 | strada | Uomo birra e poliziotto | Vestito da uomo birra, fatti un selfie con un poliziotto. Serve: costume da uomo birra. |
| seed-09 | strada | Selfie con sconosciuti | Fatti un selfie con persone a caso incontrate per strada. |
| seed-10 | strada | Balla per strada | Balla per strada con almeno una ragazza (va benissimo anche una vecchietta). La musica la mettiamo noi. Serve: cassa o telefono per la musica. |
| seed-11 | strada | Bella ciao sulla panchina | Sali su una panchina in piazza e canta Bella ciao, da solo. |
| seed-12 | strada | Modalità NPC | Per 5 minuti cammina per strada comportandoti come un NPC di un videogioco. |
| seed-13 | strada | L'inviato speciale | Con il telefono in mano come un microfono, fingi di essere un inviato TV e intervista 2-3 sconosciuti: "Secondo lei, quali sono le caratteristiche fondamentali di un buon marito?" |
| seed-14 | strada | La posa ridicola | Chiedi a uno sconosciuto di farti una foto nella posa ridicola scelta dal gruppo. Poi chiedi alla stessa persona di fare una foto di gruppo con tutti noi. |
| seed-15 | pub | Il cameriere stellato | A cena fuori, vai a un tavolo e presenta un piatto a tua scelta come se fossi il cameriere di un ristorante stellato. |
| seed-16 | pub | Birre alla cieca | In birreria ordina tre birre diverse, bendati e prova a indovinarle solo assaggiandole. Se sbagli, la birra va giù tutta d'un fiato. Serve: benda. |
| seed-17 | pub | Per sempre sì | Canta "Per sempre sì" di Sal Da Vinci. |
| seed-18 | pub | Il mimo | Fai indovinare a uno sconosciuto una parola scelta dal gruppo, senza parlare: solo mimo. |
| seed-19 | pub | Voto da futuro marito | Entra in un locale e chiedi a uno sconosciuto: "Scusa, puoi darmi un voto da 1 a 10 come futuro marito?" |
| seed-20 | pub | La recensione dal vivo | Entra in un locale e, con estrema serietà, chiedi al cameriere se può farti una recensione dal vivo del posto, perché stai valutando se tornarci dopo il matrimonio. |

## Architecture

```
index.html                     single page: views and dialogs
manifest.webmanifest
sw.js                          service worker
css/styles.css
js/app.js                      bootstrap, routing, rendering, event wiring
js/icons.js                    inline SVG icons
js/logic.js                    pure functions: validation, selection, transitions, stats
js/seed.js                     default challenges
js/store/index.js              picks the store: Firestore when configured, local otherwise
js/store/local-store.js        localStorage store
js/store/firestore-store.js    Firestore store
js/store/firestore-helpers.js  error messages, sync status and seeding logic, testable without the SDK
js/firebase-config.js          Firebase web config, committed; placeholders until the owner fills it in
icons/                         SVG source and PNG renders
firestore.rules
scripts/dev-server.mjs         static server for local testing, no dependencies
tests/                         node --test suites
.nojekyll                      GitHub Pages serves the files as they are, without Jekyll
```

- Data flows one way. The store pushes the full challenge list on every change; the app derives history, counters and deck with `logic.js` and re-renders. User actions call the store with patches built by `logic.js`.
- Store interface: `subscribe(onChange, onStatus)` returns an unsubscribe function; `add(input)` returns the new id; `update(id, patch)`. Writes return at once and never wait for the server, so the UI stays responsive offline.
- Rendering builds DOM nodes and sets `textContent`. User text never goes through `innerHTML`.
- Routes: `#/` (home) and `#/mazzo` (deck). Challenge sheet, forms and the spoiler warning are native `<dialog>` elements.

## Sync with Firestore

- Firebase JS SDK 12.19.0 as ES modules from `www.gstatic.com`, loaded only when a config exists.
- `initializeFirestore` with `persistentLocalCache({ tabManager: persistentMultipleTabManager() })`: reads come from the IndexedDB cache when offline, writes queue and sync on reconnect. If IndexedDB is unavailable, the SDK itself falls back to a memory cache and logs a warning.
- One `onSnapshot` listener on `challenges`, with metadata changes; `hasPendingWrites` and `fromCache` drive the sync indicator.
- Seeding: a transaction reads `meta/seed`; when missing, it writes `meta/seed` and the 20 default challenges under fixed ids. Concurrent first launches cannot duplicate them. Transactions need connectivity: after a network failure, seeding retries on the next server snapshot. Any other failure (wrong project, rules not published) shows the error banner, because the listener alone keeps retrying silently in those cases.
- Concurrency: last write wins. The group sits together and one person usually draws, so simultaneous draws are unlikely and harmless.

## Local mode

While `js/firebase-config.js` holds placeholders (or is missing: the server answers 404) the app stores data in `localStorage`, seeds itself, and shows a banner saying that data stays on this phone. Local mode lets the owner try the app before creating the Firebase project, and it backs the manual UI tests. A network failure while fetching the config is an error, not local mode, unless the device already holds local data: otherwise a synced phone would silently fork its data.

Both stores pass documents through `normalizeChallenge`, which drops or repairs documents the UI cannot render (for example ones edited by hand in the Firebase console).

## Offline and installability

- Manifest: `start_url` and `scope` set to `./`, because the site lives under `/<repo>/`; `display: standalone`; icons at 192 and 512 px plus a maskable 512 px; `apple-touch-icon` at 180 px. The PNG files are rendered from the SVG source.
- Service worker:
  - precaches the app shell on install, bypassing the HTTP cache; the Firebase config and SDK files are cached one by one, so a missing file never breaks installation;
  - same-origin GET requests: network first with a 3-second timeout, revalidated with the server (GitHub Pages sets a 10-minute HTTP cache), cache fallback, cache refreshed on every success; navigations fall back to `index.html`;
  - a page that had to come from the cache gets its other files cache first, so a hanging network does not delay every module in turn;
  - `www.gstatic.com/firebasejs/`: cache first, since versioned URLs never change;
  - all other traffic, Firestore included, passes through untouched.
- Cache names carry the `sfide-addio-celibato-` prefix and activation deletes only older caches with that prefix: every GitHub Pages site of an account shares one origin, hence one Cache Storage.
- Network first keeps every online load current, so the app needs no update prompt. Changing the precache list requires bumping the cache version in `sw.js`.

## Configuration and deploy

Simplest possible setup, chosen by the owner on 2026-09-28 (it replaces an earlier design that injected the config from a repository variable through a GitHub Actions workflow):

- The owner pastes the Firebase web config into `js/firebase-config.js`, which is committed like any other file.
- GitHub Pages publishes the repository root of `main` directly ("Deploy from a branch"); `.nojekyll` skips the Jekyll build. Every push to `main` publishes the site again.
- Firebase documentation states that the web API key is not a secret and that Security Rules protect the data. The config is visible in the public repository and on the published site.

## Security rules

`firestore.rules`, pasted into the Firebase console:

- `challenges`: anyone reads; create and update require a valid shape (allowed keys, types, lengths, enums, integer timestamps); new challenges start in the deck; `createdAt` never changes; updates follow the status transition table, so a stale offline write (a draw or mark of a challenge another phone already changed) is rejected and the phone reverts to the server state; delete denied.
- `meta/seed`: anyone reads; create once with `{ seededAt: int }`; update and delete denied.
- No login: anyone with the link can use the app. At worst, someone edits or discards challenges; nobody can delete data.
- `index.html` sets a Content-Security-Policy meta tag that allows scripts only from the site itself and from the Firebase SDK path.

## Error handling

| Situation | Behavior |
|---|---|
| Placeholders in `js/firebase-config.js` | local mode banner |
| Offline | indicator "Offline"; writes queue |
| Pending writes | indicator "In attesa di sync" |
| Permission denied (rules missing) | error banner that points to the rules |
| Write rejected by the rules | toast "Modifica rifiutata"; the local cache reverts to the server state |
| Setup error (wrong project, rules not published) | error banner with a "Ricarica" button, detected by the seeding transaction |
| Invalid form input | inline field errors |
| Empty category | message plus "Aggiungi sfida" |
| Corrupt local data | reset to the default challenges, warning in the console |

## Testing

- `node --test` suites, Node 24, no dependencies:
  - `logic`: validation, random pick with an injected random source, deck, history, stats, transitions;
  - `seed`: every default challenge valid, unique ids, 4/10/6 per category;
  - `local-store`: seeding, add, update, persistence, notifications, corrupt data;
  - `firestore-helpers`: error classification, sync status, seeding retries and sticky setup errors.
- Manual UI check in a phone-sized browser in local mode, offline reload through the service worker included.
- The Firestore store needs the owner's Firebase project. Automated checks cover module loading only; the owner verifies sync after setup with two phones and airplane mode.

## Out of scope

Login, per-player scores, penalty lists, push notifications, photo uploads.
