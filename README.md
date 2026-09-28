# Sfide Addio al Celibato

A mobile web app for the challenges of a bachelor party. Pick where the group is (plane, street, pub), draw a random challenge and mark it passed or failed. Up to 15 phones share the same challenges in real time through Firebase Cloud Firestore, and the app keeps working offline, on the plane too.

The interface is in Italian.

## Features

- Three categories: Aereo, In strada, Pub.
- Random draw from the selected category. A drawn challenge never comes out again, unless someone puts it back in the deck.
- History of the drawn challenges with their result: passed, failed or still to mark.
- Anyone can add challenges. The deck page, behind a spoiler warning, lets organizers edit and discard them.
- Installable on Android and iPhone; works offline and syncs when the connection returns.
- While `js/firebase-config.js` holds placeholders, the app runs in local mode: data stays on one device.

## Project structure

| Path | Purpose |
|---|---|
| `index.html`, `css/`, `js/` | the app: plain ES modules, no build step |
| `js/firebase-config.js` | Firebase web config: paste your project's values here |
| `js/seed.js` | the 20 default challenges |
| `js/store/` | data stores: Firestore and localStorage |
| `sw.js`, `manifest.webmanifest`, `icons/` | offline support and installation |
| `firestore.rules` | security rules for the Firebase console |
| `scripts/dev-server.mjs` | local static server |
| `tests/` | unit tests, run with `node --test` |
| `docs/specs/` | design notes |

## Run locally

Requires Node.js 22 or later.

```bash
npm test
npm run dev
```

Open http://127.0.0.1:8080. With placeholders in `js/firebase-config.js` the app runs in local mode; with your values it uses your Firestore database.

## Setup

### 1. Firebase

1. In the Firebase console (https://console.firebase.google.com) create a project. Google Analytics is not needed.
2. Add a Web app to the project. Firebase Hosting is not needed.
3. Create a Cloud Firestore database: Standard edition if asked, production mode, a European location.
4. In the database Rules tab, replace the content with `firestore.rules` from this repository and publish.

The free Spark plan is enough: it includes 50,000 reads and 20,000 writes per day.

To check the rules without the app, use the Rules Playground in the same tab: a `get` of `/challenges/seed-01` must be allowed, a `delete` of the same path must be denied, and a `create` of `/challenges/test` with data that has no `title` must be denied.

### 2. App config

Open `js/firebase-config.js` and replace the placeholder values with the ones from the Firebase console (Project settings > General > Your apps > SDK setup and configuration > Config). Keep the first line `export const firebaseConfig = {` and the closing `};`.

### 3. GitHub Pages

1. Create an empty public repository. On GitHub Free, GitHub Pages requires a public repository.
2. Push this project to it (commands below, from the project folder).
3. In Settings > Pages > Build and deployment, set Source to "Deploy from a branch", Branch to `main` and folder `/ (root)`, then Save.
4. After a couple of minutes the site is published at `https://<user>.github.io/<repository>/`. Share the address with the trailing slash. Every push to `main` publishes it again.

```bash
git add -A
git commit -m "feat: add bachelor party challenges web app"
git remote add origin https://github.com/<user>/<repository>.git
git push -u origin main
```

### 4. Phones

- Android, Chrome: open the site and tap "Installa" in the banner, or use the browser menu.
- iPhone, Safari: tap Share, then "Aggiungi alla schermata Home".

Before the flight, every phone must open the app from its home-screen icon while online and wait for "Sincronizzato"; afterwards it also starts offline. On iPhone this matters: the home-screen app does not share storage with Safari, so a visit in Safari alone does not make the installed app work offline.

## Checking the sync

1. Open the app on two phones: both show "Sincronizzato".
2. Draw a challenge on the first phone: within seconds it appears in the history of the second.
3. Turn on airplane mode on the first phone and mark the challenge: the indicator shows "In attesa di sync".
4. Turn airplane mode off: the result reaches the second phone.

## Security notes

- There is no login: anyone with the link can use the app. Share the link only with the group.
- The Firestore rules accept only well-formed challenges and the status changes the app makes, and they deny deletions: nobody can delete data. Anyone with the link can still add junk challenges, overwrite texts (there is no history), or use up the daily free quota of 20,000 writes.
- The Firebase config sits in the public repository. Firebase documents that API keys for Firebase services are not secrets and do not control access to data: only the Security Rules protect it. Firebase also recommends restricting the key to the Firebase APIs it needs (Google Cloud Console > APIs & Services > Credentials).
- The repository is public, so anyone can read the default challenges in `js/seed.js` and in the design notes under `docs/specs/`. Keep it in mind if the groom might look.

## Customizing

- Default challenges: edit `js/seed.js` before the first launch with Firebase. After that, change challenges from the deck page.
- App name: `index.html` (title and header) and `manifest.webmanifest`.
- After changing the file list in `sw.js`, bump the version in `CACHE`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| The published site shows "Modalità locale" | `js/firebase-config.js` still holds placeholders: paste your values and push again |
| Banner "Firestore ha negato l'accesso" | check the values in `js/firebase-config.js` and publish `firestore.rules` in the Firebase console |
| Banner "Database Firestore non trovato" | create the Firestore database (Firebase step 3) |
| Indicator stuck on "Connessione..." | the phone cannot reach Firestore: check the connection |
| Toast "Modifica rifiutata" | another phone changed that challenge first (for example while this one was offline): the app shows the current state |
| A push does not show up on the site | wait a couple of minutes for GitHub Pages, then reload the app |
