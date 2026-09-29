// App entry point: connects the store to the UI, renders the views and handles user actions.

import {
  CATEGORIES,
  STATUS,
  STATUS_LABELS,
  categoryById,
  deckOf,
  deckView,
  discardPatch,
  drawPatch,
  editPatch,
  historyGroups,
  isResolvable,
  pickRandom,
  putBackPatch,
  resolvePatch,
  restorePatch,
  splitNeeds,
  statsOf,
  validateChallengeInput,
} from './logic.js';
import { icon } from './icons.js';
import { burstLeaves, startLeaves } from './leaves.js';
import { formatQuiz, parseQuiz } from './quiz.js';
import { openStore } from './store/index.js';

const CATEGORY_ICONS = { aereo: 'plane', strada: 'signpost', pub: 'beer' };
const STATUS_ICONS = { deck: 'cards', drawn: 'clock', passed: 'check', failed: 'x', discarded: 'archive' };
const SYNC_LABELS = {
  connecting: 'Connessione...',
  synced: 'Sincronizzato',
  pending: 'In attesa di sync',
  offline: 'Offline',
  local: 'Solo locale',
  error: 'Errore di sync',
};
const FIELD_ERROR_IDS = { title: 'error-title', details: 'error-details', category: 'error-category' };
const DRAW_DELAY_MS = 450;
const SHAKE_MS = 450;
// Taps on the sheet this soon after it opens were aimed at the button under it.
const SHEET_GUARD_MS = 400;
const PUTBACK_CONFIRM_MS = 4000;
const TOAST_MS = 3200;
const IOS_HINT_KEY = 'sfide-addio-celibato:ios-hint-dismissed';
const INSTALL_DISMISSED_KEY = 'sfide-addio-celibato:install-dismissed';
const supportsPopover = 'popover' in HTMLElement.prototype;

const state = {
  challenges: [],
  sync: { state: 'connecting' },
  // The page shown, or about to be shown when a view transition is running.
  view: 'home',
  selectedCategory: null,
  openChallengeId: null,
  sheetOpenedAt: 0,
  editingId: null,
  deckUnlocked: false,
  drawing: false,
  quiz: [],
  quizLoaded: false,
  // The phone has not heard from the server yet: an empty quiz may just not be downloaded.
  quizFromCache: false,
};

let store = null;
let deferredInstallPrompt = null;
let toastTimer = 0;
let shakeTimer = 0;
let putBackTimer = 0;

const byId = (id) => document.getElementById(id);

const els = {
  leaves: byId('leaves'),
  burst: byId('burst'),
  syncStatus: byId('sync-status'),
  syncLabel: byId('sync-label'),
  banners: byId('banners'),
  views: document.querySelectorAll('[data-view]'),
  viewTitles: { home: byId('home-title'), history: byId('history-title'), deck: byId('deck-title') },
  tabs: document.querySelectorAll('[data-tab]'),
  historyBadge: byId('history-badge'),
  stats: {
    passed: byId('stat-passed'),
    failed: byId('stat-failed'),
    pending: byId('stat-pending'),
    deck: byId('stat-deck'),
  },
  tiles: byId('category-tiles'),
  drawArea: byId('draw-area'),
  drawButton: byId('draw-button'),
  drawSub: byId('draw-sub'),
  emptyDeck: byId('empty-deck'),
  emptyDeckName: byId('empty-deck-name'),
  historyView: byId('view-history'),
  pendingSection: byId('pending-section'),
  pendingCount: byId('pending-count'),
  pendingList: byId('pending-list'),
  markedSection: byId('marked-section'),
  markedCount: byId('marked-count'),
  markedList: byId('marked-list'),
  historyEmpty: byId('history-empty'),
  deckView: byId('view-deck'),
  deckGroups: byId('deck-groups'),
  quiz: byId('quiz'),
  quizCount: byId('quiz-count'),
  quizLead: byId('quiz-lead'),
  quizList: byId('quiz-list'),
  quizEmpty: byId('quiz-empty'),
  quizEdit: byId('quiz-edit'),
  quizEditLabel: byId('quiz-edit-label'),
  quizDialog: byId('quiz-dialog'),
  quizForm: byId('quiz-form'),
  quizText: byId('quiz-text'),
  quizResult: byId('quiz-result'),
  quizWarnings: byId('quiz-warnings'),
  quizCancel: byId('quiz-cancel'),
  discarded: byId('discarded'),
  discardedCount: byId('discarded-count'),
  discardedList: byId('discarded-list'),
  challengeDialog: byId('challenge-dialog'),
  challengeCard: byId('challenge-card'),
  challengeMeta: byId('challenge-meta'),
  challengeTitle: byId('challenge-title'),
  challengeText: byId('challenge-text'),
  challengeNeeds: byId('challenge-needs'),
  challengeNeedsText: byId('challenge-needs-text'),
  challengeActions: byId('challenge-actions'),
  resultRow: byId('result-row'),
  putBackButton: byId('putback-button'),
  putBackLabel: byId('putback-label'),
  closeChallengeButton: byId('close-challenge-button'),
  sheetAnnouncer: byId('sheet-announcer'),
  formDialog: byId('form-dialog'),
  form: byId('challenge-form'),
  formTitle: byId('form-title'),
  formCategories: byId('form-categories'),
  formSubmit: byId('form-submit'),
  formDiscard: byId('form-discard'),
  formRestore: byId('form-restore'),
  formCancel: byId('form-cancel'),
  spoilerDialog: byId('spoiler-dialog'),
  spoilerForm: byId('spoiler-form'),
  toast: byId('toast'),
  announcer: byId('announcer'),
};

// Helpers

/** Creates an element. Children are appended as nodes or plain text, never parsed as HTML. */
function h(tag, attributes = {}, ...children) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false) continue;
    if (name === 'className') element.className = value;
    else if (name === 'dataset') Object.assign(element.dataset, value);
    else element.setAttribute(name, value === true ? '' : String(value));
  }
  element.append(...children.filter((child) => child !== null && child !== undefined && child !== false));
  return element;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const vibrate = (pattern) => navigator.vibrate?.(pattern);

function findChallenge(id) {
  return state.challenges.find((c) => c.id === id) ?? null;
}

function remainingLabel(count) {
  if (count === 0) return 'Nessuna rimasta';
  return count === 1 ? '1 rimasta' : `${count} rimaste`;
}

function categoryChip(categoryId) {
  const label = categoryById(categoryId)?.label ?? categoryId;
  return h('span', { className: 'chip' }, icon(CATEGORY_ICONS[categoryId] ?? 'cards'), label);
}

function statusBadge(status) {
  return h('span', { className: 'badge', dataset: { status } }, icon(STATUS_ICONS[status] ?? 'info'), STATUS_LABELS[status] ?? status);
}

/** Replaces a container's children and moves focus to the rebuilt row that had it. */
function replaceRows(container, children) {
  const active = document.activeElement;
  const key = active instanceof HTMLElement && container.contains(active) ? (active.dataset.open ?? active.dataset.edit) : null;
  container.replaceChildren(...children);
  if (key) container.querySelector(`[data-open="${CSS.escape(key)}"], [data-edit="${CSS.escape(key)}"]`)?.focus();
}

/** List row button; `action` is 'open' (challenge sheet) or 'edit' (form). */
function challengeRow(challenge, action) {
  const label = categoryById(challenge.category)?.label ?? challenge.category;
  return h(
    'li',
    {},
    h(
      'button',
      { type: 'button', className: 'row', 'aria-haspopup': 'dialog', dataset: { [action]: challenge.id, status: challenge.status } },
      h('span', { className: 'row-thumb', dataset: { category: challenge.category }, 'aria-hidden': 'true' }),
      h('span', { className: 'visually-hidden' }, `${label}: `),
      h('span', { className: 'row-title' }, challenge.title),
      ' ',
      statusBadge(challenge.status),
    ),
  );
}

// Setup

function hydrateIcons() {
  for (const slot of document.querySelectorAll('[data-icon]')) slot.replaceWith(icon(slot.dataset.icon));
}

function buildCategoryControls() {
  els.tiles.replaceChildren(
    ...CATEGORIES.map((category) =>
      h(
        'label',
        { className: 'place', dataset: { category: category.id } },
        h('input', { type: 'radio', name: 'category', value: category.id, className: 'visually-hidden' }),
        h(
          'span',
          { className: 'place-body' },
          h('span', { className: 'place-name' }, category.label),
          ' ',
          h('span', { className: 'place-hint' }, category.hint),
        ),
        ' ',
        h('span', { className: 'place-count', dataset: { countFor: category.id } }),
        h('span', { className: 'place-check', 'aria-hidden': 'true' }, icon('check')),
      ),
    ),
  );
  els.formCategories.replaceChildren(
    ...CATEGORIES.map((category) =>
      h(
        'label',
        { className: 'segment', dataset: { category: category.id } },
        h('input', { type: 'radio', name: 'category', value: category.id, required: true, className: 'visually-hidden' }),
        category.label,
      ),
    ),
  );
}

function enableLightDismissFallback(dialog) {
  if ('closedBy' in HTMLDialogElement.prototype) return;
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    const inside =
      event.clientY >= rect.top && event.clientY <= rect.bottom && event.clientX >= rect.left && event.clientX <= rect.right;
    if (!inside) dialog.close();
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('Service worker not registered.', error));
}

function readFlag(key) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key) {
  try {
    localStorage.setItem(key, '1');
  } catch {
    // Storage unavailable: the hint shows again next time.
  }
}

function isIos() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function setupInstall() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    if (readFlag(INSTALL_DISMISSED_KEY)) return;
    deferredInstallPrompt = event;
    showBanner('install', 'info', "Installa l'app: si apre al volo e funziona anche offline.", [
      {
        label: 'Installa',
        onClick: async () => {
          hideBanner('install');
          const prompt = deferredInstallPrompt;
          deferredInstallPrompt = null;
          await prompt?.prompt();
        },
      },
      {
        label: 'Non ora',
        quiet: true,
        onClick: () => {
          writeFlag(INSTALL_DISMISSED_KEY);
          hideBanner('install');
        },
      },
    ]);
  });
  window.addEventListener('appinstalled', () => hideBanner('install'));
  if (isIos() && !isStandalone() && !readFlag(IOS_HINT_KEY)) {
    showBanner('ios-install', 'info', 'Per installarla su iPhone: tocca Condividi e poi «Aggiungi alla schermata Home».', [
      {
        label: 'Ok',
        onClick: () => {
          writeFlag(IOS_HINT_KEY);
          hideBanner('ios-install');
        },
      },
    ]);
  }
}

// Rendering

function renderLoading() {
  document.body.toggleAttribute('data-loading', state.challenges.length === 0 && state.sync.state === 'connecting');
}

function render() {
  const stats = statsOf(state.challenges);
  renderLoading();
  for (const [key, element] of Object.entries(els.stats)) element.textContent = String(stats[key]);
  for (const element of els.tiles.querySelectorAll('[data-count-for]')) {
    element.textContent = remainingLabel(stats.deckByCategory[element.dataset.countFor] ?? 0);
  }
  renderDraw(stats);
  renderHistory();
  if (!els.deckView.hidden) renderDeck();
  if (state.openChallengeId) renderChallengeSheet();
}

function renderDraw(stats) {
  const category = categoryById(state.selectedCategory);
  els.drawArea.hidden = !category;
  if (!category) return;
  const remaining = stats.deckByCategory[category.id];
  els.drawButton.hidden = remaining === 0;
  els.emptyDeck.hidden = remaining > 0;
  els.drawSub.textContent = `${category.label} · ${remainingLabel(remaining).toLowerCase()}`;
  els.emptyDeckName.textContent = category.label;
}

function renderHistory() {
  const { pending, marked } = historyGroups(state.challenges);
  els.historyBadge.hidden = pending.length === 0;
  els.historyBadge.replaceChildren(String(pending.length), h('span', { className: 'visually-hidden' }, ' da marcare'));
  if (els.historyView.hidden) return;
  els.pendingSection.hidden = pending.length === 0;
  els.markedSection.hidden = marked.length === 0;
  els.historyEmpty.hidden = pending.length + marked.length > 0;
  els.pendingCount.textContent = String(pending.length);
  els.markedCount.textContent = String(marked.length);
  replaceRows(els.pendingList, pending.map((c) => challengeRow(c, 'open')));
  replaceRows(els.markedList, marked.map((c) => challengeRow(c, 'open')));
}

function renderDeck() {
  const { groups, discarded } = deckView(state.challenges);
  replaceRows(
    els.deckGroups,
    groups.map(({ category, items }) =>
      h(
        'section',
        { className: 'deck-group', 'aria-labelledby': `deck-${category.id}` },
        h(
          'h3',
          { className: 'deck-group-title', id: `deck-${category.id}` },
          category.label,
          h('span', { className: 'section-count' }, String(items.length)),
        ),
        items.length === 0
          ? h('p', { className: 'empty' }, 'Nessuna sfida in questa categoria.')
          : h('ul', { className: 'list' }, ...items.map((c) => challengeRow(c, 'edit'))),
      ),
    ),
  );
  els.discarded.hidden = discarded.length === 0;
  els.discardedCount.textContent = String(discarded.length);
  replaceRows(els.discardedList, discarded.map((c) => challengeRow(c, 'edit')));
}

function renderSync() {
  let current = state.sync.state;
  if (store?.mode === 'firestore' && current === 'synced' && !navigator.onLine) current = 'offline';
  els.syncStatus.dataset.state = current;
  els.syncLabel.textContent = SYNC_LABELS[current] ?? current;
  if (current === 'error') {
    // An installed app has no reload control of its own.
    showBanner('sync-error', 'error', state.sync.message ?? 'Errore di sincronizzazione.', [
      { label: 'Ricarica', onClick: () => location.reload() },
    ]);
  } else {
    hideBanner('sync-error');
  }
  renderLoading();
}

/** Shows or updates a banner. `actions` is a list of { label, onClick, quiet? } buttons. */
function showBanner(key, tone, message, actions = []) {
  let banner = els.banners.querySelector(`[data-banner="${key}"]`);
  if (banner?.dataset.message === message) return;
  if (!banner) {
    banner = h('div', { className: 'banner', role: tone === 'error' ? 'alert' : null, dataset: { banner: key, tone } });
    els.banners.append(banner);
  }
  banner.dataset.message = message;
  const buttons = actions.map(({ label, onClick, quiet }) => {
    const button = h('button', { type: 'button', className: `btn btn-small ${quiet ? 'btn-ghost' : 'btn-secondary'}` }, label);
    button.addEventListener('click', onClick);
    return button;
  });
  const content = [icon(tone === 'error' ? 'alert' : 'info'), h('p', {}, message)];
  if (buttons.length > 0) content.push(h('div', { className: 'banner-actions' }, ...buttons));
  banner.replaceChildren(...content);
}

function hideBanner(key) {
  els.banners.querySelector(`[data-banner="${key}"]`)?.remove();
}

function toast(message, tone = 'info') {
  els.toast.textContent = message;
  els.toast.dataset.tone = tone;
  if (supportsPopover) {
    if (els.toast.matches(':popover-open')) els.toast.hidePopover();
    els.toast.showPopover();
  } else {
    els.toast.classList.add('is-open');
  }
  announce(message);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, TOAST_MS);
}

/** Reads a message out through a live region; emptied first, so a repeated message is read again. */
function announce(message) {
  els.announcer.textContent = '';
  els.sheetAnnouncer.textContent = '';
  setTimeout(() => {
    // An open modal sheet makes the rest of the page inert, live regions included: speak from inside it.
    const region = els.challengeDialog.open ? els.sheetAnnouncer : els.announcer;
    region.textContent = message;
  }, 50);
}

function hideToast() {
  if (supportsPopover && els.toast.matches(':popover-open')) els.toast.hidePopover();
  els.toast.classList.remove('is-open');
}

// Challenge sheet

function openChallenge(id, { reveal = false } = {}) {
  if (!findChallenge(id)) return;
  // A shake still running belongs to the previous challenge.
  clearTimeout(shakeTimer);
  els.challengeCard.classList.remove('is-shaking');
  armPutBack(false);
  state.openChallengeId = id;
  renderChallengeSheet();
  els.challengeDialog.toggleAttribute('data-reveal', reveal);
  if (!els.challengeDialog.open) {
    els.challengeDialog.showModal();
    state.sheetOpenedAt = performance.now();
  }
}

function renderChallengeSheet() {
  const challenge = findChallenge(state.openChallengeId);
  if (!challenge) return;
  const { text, needs } = splitNeeds(challenge.details);
  els.challengeCard.dataset.category = challenge.category;
  els.challengeMeta.replaceChildren(categoryChip(challenge.category), statusBadge(challenge.status));
  els.challengeTitle.textContent = challenge.title;
  els.challengeText.textContent = text;
  els.challengeText.hidden = text === '';
  els.challengeNeedsText.textContent = needs;
  els.challengeNeeds.hidden = needs === '';
  els.resultRow.hidden = !isResolvable(challenge);
  els.putBackButton.hidden = !isResolvable(challenge);
  els.closeChallengeButton.textContent = challenge.status === STATUS.DRAWN ? 'Decidi dopo' : 'Chiudi';
}

// The sheet buttons submit a method="dialog" form. The result is applied on submit, which runs at
// once: the dialog 'close' event waits for the next rendered frame, which a hidden page never gets.
function onChallengeAction(event) {
  const action = event.submitter?.value;
  const challenge = findChallenge(state.openChallengeId);
  if (!challenge) return;
  if (performance.now() - state.sheetOpenedAt < SHEET_GUARD_MS) {
    event.preventDefault();
    return;
  }
  const now = Date.now();
  if (action === STATUS.PASSED && isResolvable(challenge) && challenge.status !== action) {
    const origin = event.submitter.getBoundingClientRect();
    applyPatch(challenge, resolvePatch(challenge, action, now), 'Superata! Grande!');
    burstLeaves(origin.left + origin.width / 2, origin.top + origin.height / 2);
    vibrate(40);
  } else if (action === STATUS.FAILED && isResolvable(challenge) && challenge.status !== action) {
    applyPatch(challenge, resolvePatch(challenge, action, now), 'Non superata: scatta la penitenza!');
    vibrate([60, 50, 60]);
    if (!prefersReducedMotion()) {
      // Keep the sheet open for the shake, then close it.
      event.preventDefault();
      shakeThenClose(challenge.id);
    }
  } else if (action === 'putback' && isResolvable(challenge)) {
    if (challenge.status !== STATUS.DRAWN && !els.putBackButton.hasAttribute('data-armed')) {
      // Putting back a marked challenge erases its result: the first tap only asks for confirmation.
      event.preventDefault();
      armPutBack(true);
      toast("Tocca di nuovo per rimetterla nel mazzo: l'esito verrà cancellato.");
      return;
    }
    const message =
      challenge.status === STATUS.DRAWN ? 'Rimessa nel mazzo: potrà uscire di nuovo.' : "Rimessa nel mazzo: l'esito è stato cancellato.";
    applyPatch(challenge, putBackPatch(challenge, now), message);
  }
}

function shakeThenClose(id) {
  els.challengeCard.classList.add('is-shaking');
  clearTimeout(shakeTimer);
  shakeTimer = setTimeout(() => {
    els.challengeCard.classList.remove('is-shaking');
    if (state.openChallengeId === id && els.challengeDialog.open) els.challengeDialog.close();
  }, SHAKE_MS);
}

/** Switches "Rimetti nel mazzo" to its confirmation state, which expires after a few seconds. */
function armPutBack(armed) {
  clearTimeout(putBackTimer);
  els.putBackButton.toggleAttribute('data-armed', armed);
  els.putBackLabel.textContent = armed ? "Sì, cancella l'esito" : 'Rimetti nel mazzo';
  if (armed) putBackTimer = setTimeout(() => armPutBack(false), PUTBACK_CONFIRM_MS);
}

function onChallengeClosed() {
  // A late 'close' (see above) must not reset a sheet that has been opened again meanwhile.
  if (els.challengeDialog.open) return;
  const id = state.openChallengeId;
  state.openChallengeId = null;
  els.challengeDialog.removeAttribute('data-reveal');
  armPutBack(false);
  restoreFocus(els.challengeDialog, id ? `[data-open="${CSS.escape(id)}"]` : null);
}

/**
 * After a sheet closes, focuses the row it was opened from, or the page heading when that row is gone.
 * The browser restores focus by itself, unless the element that had it has been rebuilt or hidden meanwhile.
 */
function restoreFocus(dialog, rowSelector) {
  const active = document.activeElement;
  if (active && active !== document.body && !dialog.contains(active)) return;
  const row = rowSelector ? document.querySelector(`.view:not([hidden]) ${rowSelector}`) : null;
  row?.focus();
  // A row in the collapsed "Scartate" group cannot take focus.
  if (document.activeElement !== row) els.viewTitles[state.view]?.focus();
}

function applyPatch(challenge, patch, message) {
  try {
    store.update(challenge.id, patch);
  } catch (error) {
    console.error(error);
    toast('Operazione non riuscita: riprova.', 'error');
    return false;
  }
  // Optimistic update: the next store snapshot confirms it.
  state.challenges = state.challenges.map((c) => (c.id === challenge.id ? { ...c, ...patch } : c));
  render();
  if (message) toast(message);
  return true;
}

async function onDraw() {
  const category = state.selectedCategory;
  if (state.drawing || !category || !store) return;
  state.drawing = true;
  vibrate(30);
  els.drawButton.classList.add('is-rolling');
  await wait(prefersReducedMotion() ? 0 : DRAW_DELAY_MS);
  els.drawButton.classList.remove('is-rolling');
  state.drawing = false;
  // A dialog opened during the roll: do not draw behind the user's back.
  if (document.querySelector('dialog[open]')) return;
  const candidate = pickRandom(deckOf(state.challenges, category));
  if (!candidate) {
    render();
    return;
  }
  if (applyPatch(candidate, drawPatch(candidate, Date.now()))) openChallenge(candidate.id, { reveal: true });
}

// Add and edit form

function formControls(field) {
  return field === 'category' ? [...els.formCategories.querySelectorAll('input[type="radio"]')] : [els.form.elements[field]];
}

function clearFieldError(field) {
  if (!Object.hasOwn(FIELD_ERROR_IDS, field)) return;
  const errorElement = byId(FIELD_ERROR_IDS[field]);
  errorElement.hidden = true;
  // Empty it too: aria-describedby still reads hidden text.
  errorElement.replaceChildren();
  for (const control of formControls(field)) control.removeAttribute('aria-invalid');
}

function clearFormErrors() {
  for (const field of Object.keys(FIELD_ERROR_IDS)) clearFieldError(field);
}

function showFormErrors(errors) {
  clearFormErrors();
  let firstInvalid = null;
  for (const [field, message] of Object.entries(errors)) {
    const errorElement = byId(FIELD_ERROR_IDS[field]);
    errorElement.replaceChildren(icon('alert'), message);
    errorElement.hidden = false;
    const controls = formControls(field);
    for (const control of controls) control.setAttribute('aria-invalid', 'true');
    firstInvalid ??= controls[0];
  }
  firstInvalid?.focus();
}

function openForm(id = null) {
  if (!store) return;
  const challenge = id ? findChallenge(id) : null;
  state.editingId = challenge?.id ?? null;
  els.form.reset();
  clearFormErrors();
  els.formTitle.textContent = challenge ? 'Modifica sfida' : 'Nuova sfida';
  els.formSubmit.textContent = challenge ? 'Salva modifiche' : 'Aggiungi al mazzo';
  els.formDiscard.hidden = challenge?.status !== STATUS.DECK;
  els.formRestore.hidden = challenge?.status !== STATUS.DISCARDED;
  els.form.elements.title.value = challenge?.title ?? '';
  els.form.elements.details.value = challenge?.details ?? '';
  const category = challenge?.category ?? state.selectedCategory;
  for (const radio of formControls('category')) radio.checked = radio.value === category;
  els.formDialog.showModal();
}

function onFormSubmit(event) {
  event.preventDefault();
  const result = validateChallengeInput(Object.fromEntries(new FormData(els.form)));
  if (!result.ok) {
    showFormErrors(result.errors);
    return;
  }
  const editing = state.editingId ? findChallenge(state.editingId) : null;
  els.formDialog.close();
  if (editing) {
    applyPatch(editing, editPatch(result.value, Date.now()), 'Sfida aggiornata.');
    return;
  }
  try {
    store.add(result.value);
  } catch (error) {
    console.error(error);
    toast('Salvataggio non riuscito: riprova.', 'error');
    return;
  }
  toast(`Aggiunta al mazzo ${categoryById(result.value.category).label}. Resterà una sorpresa!`);
}

function onDiscard() {
  const challenge = findChallenge(state.editingId);
  els.formDialog.close();
  if (challenge?.status === STATUS.DECK) {
    applyPatch(challenge, discardPatch(challenge, Date.now()), 'Sfida scartata: la trovi tra le scartate.');
  }
}

function onRestore() {
  const challenge = findChallenge(state.editingId);
  els.formDialog.close();
  if (challenge?.status === STATUS.DISCARDED) {
    applyPatch(challenge, restorePatch(challenge, Date.now()), 'Sfida rimessa nel mazzo.');
  }
}

// Quiz on the bride (deck page)

const questionsLabel = (count) => (count === 1 ? '1 domanda' : `${count} domande`);
const answersLabel = (count) => (count === 1 ? '1 risposta' : `${count} risposte`);

function onQuiz(items, { fromCache = false } = {}) {
  const changed = JSON.stringify(items) !== JSON.stringify(state.quiz);
  state.quiz = items;
  state.quizLoaded = true;
  state.quizFromCache = fromCache;
  // Rebuilding the list would close the answers someone is reading: only when the texts change.
  if (changed) renderQuizList();
  renderQuiz();
}

function renderQuiz() {
  const count = state.quiz.length;
  els.quizCount.textContent = state.quizLoaded ? String(count) : '';
  els.quizLead.hidden = count === 0;
  els.quizEditLabel.textContent = count > 0 ? 'Modifica le domande' : 'Incolla le domande';
  els.quizEmpty.hidden = !state.quizLoaded || count > 0;
  els.quizEmpty.textContent = state.quizFromCache
    ? "Nessuna domanda su questo telefono. Se le avete già caricate, apri l'app con internet per scaricarle."
    : "Nessuna domanda ancora: incolla l'elenco preparato per il quiz.";
}

function renderQuizList() {
  els.quizList.replaceChildren(
    ...state.quiz.map((item) =>
      h(
        'li',
        { className: 'quiz-item' },
        h(
          'details',
          {},
          h('summary', {}, h('span', { className: 'quiz-question' }, item.question)),
          h('p', { className: 'quiz-answer' }, h('span', { className: 'quiz-answer-label' }, 'Risposta'), item.answer || 'Nessuna risposta.'),
        ),
      ),
    ),
  );
}

/** Closes the section and every answer, so that the next visit to the deck starts clean. */
function collapseQuiz() {
  els.quiz.open = false;
  for (const details of els.quizList.querySelectorAll('details[open]')) details.open = false;
}

function openQuizEditor() {
  if (!store) return;
  els.quizText.value = formatQuiz(state.quiz);
  checkQuiz();
  els.quizDialog.showModal();
}

/** Previews what saving would store, and returns the parsed questions. */
function checkQuiz({ submitting = false } = {}) {
  const text = els.quizText.value;
  const { items, warnings } = parseQuiz(text);
  let result = '';
  if (items.length > 0) {
    result = `${questionsLabel(items.length)}, ${answersLabel(items.filter((item) => item.answer !== '').length)}.`;
    if (items.length < state.quiz.length) result += ` Ora ne sono salvate ${state.quiz.length}: le altre verranno tolte.`;
  } else if (submitting || text.trim() !== '') {
    result = 'Nessuna domanda trovata: ogni domanda deve iniziare con il suo numero, per esempio «1. ...».';
  }
  els.quizResult.textContent = result;
  els.quizWarnings.replaceChildren(...warnings.map((warning) => h('li', {}, warning)));
  return items;
}

function onQuizSubmit(event) {
  event.preventDefault();
  const items = checkQuiz({ submitting: true });
  if (items.length === 0) {
    els.quizText.focus();
    return;
  }
  els.quizDialog.close();
  try {
    store.saveQuiz(items);
  } catch (error) {
    console.error(error);
    toast('Salvataggio non riuscito: riprova.', 'error');
    return;
  }
  toast(items.length === 1 ? 'Domanda salvata.' : `${items.length} domande salvate.`);
}

// Routing

function routeView() {
  if (location.hash === '#/mazzo') return 'deck';
  if (location.hash === '#/storico') return 'history';
  return 'home';
}

function updateTabs(name) {
  for (const tab of els.tabs) {
    if (tab.dataset.tab === name) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
}

/** Shows a page. `initial` is the first render: no animation, and focus stays where the browser puts it. */
function showView(name, { initial = false } = {}) {
  updateTabs(name);
  if (state.view === name) return;
  state.view = name;
  // Applies the latest target: a newer navigation can start before this transition updates the page.
  const update = () => {
    for (const view of els.views) view.hidden = view.dataset.view !== state.view;
    if (state.view === 'history') renderHistory();
    if (state.view === 'deck') renderDeck();
    window.scrollTo(0, 0);
  };
  // Move focus to the new page heading, as the page itself changes under the user.
  const focusHeading = () => els.viewTitles[state.view]?.focus();
  // A hidden page cannot run a transition: the browser would only abort it.
  const animate =
    !initial && document.startViewTransition && !prefersReducedMotion() && document.visibilityState === 'visible';
  if (!animate) {
    update();
    if (!initial) focusHeading();
    return;
  }
  const transition = document.startViewTransition(update);
  // A newer navigation skips this transition; the page is updated anyway.
  transition.ready.catch(() => {});
  transition.updateCallbackDone.then(focusHeading, () => {});
}

function renderRoute({ initial = false } = {}) {
  const view = routeView();
  if (view !== 'deck') {
    // The warning shows every time the deck is opened again.
    state.deckUnlocked = false;
    if (els.spoilerDialog.open) els.spoilerDialog.close();
    // A challenge being edited, the quiz editor and the answers shown belong to the deck page.
    if (els.formDialog.open && state.editingId) els.formDialog.close();
    if (els.quizDialog.open) els.quizDialog.close();
    collapseQuiz();
    showView(view, { initial });
    return;
  }
  if (state.deckUnlocked) {
    showView('deck', { initial });
    return;
  }
  // Reached #/mazzo without the warning (reload, back and forward): ask first.
  if (!els.spoilerDialog.open) els.spoilerDialog.showModal();
}

function openDeck() {
  if (routeView() === 'deck') return;
  els.spoilerDialog.showModal();
}

// Like the challenge sheet, the warning acts on submit: its 'close' event can come late.
function onSpoilerSubmit(event) {
  if (event.submitter?.value === 'enter') {
    state.deckUnlocked = true;
    // Navigate after the dialog has closed, so that its focus restore does not win over the new heading.
    if (routeView() === 'deck') setTimeout(renderRoute, 0);
    else location.hash = '#/mazzo';
  } else {
    setTimeout(leaveDeckRoute, 0);
  }
}

/** Esc or a tap outside the warning. */
function onSpoilerClosed() {
  leaveDeckRoute();
}

/** Leaves #/mazzo when the warning was dismissed there, without adding a history entry. */
function leaveDeckRoute() {
  if (state.deckUnlocked || routeView() !== 'deck') return;
  history.replaceState(null, '', `${location.pathname}${location.search}#/`);
  renderRoute();
}

// Events

function bindEvents() {
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action], [data-open], [data-edit]');
    if (!target) return;
    if (target.dataset.action === 'add') openForm();
    else if (target.dataset.action === 'deck') openDeck();
    else if (target.dataset.open) openChallenge(target.dataset.open);
    else if (target.dataset.edit) openForm(target.dataset.edit);
  });
  els.tiles.addEventListener('change', (event) => {
    state.selectedCategory = event.target.value;
    render();
  });
  els.drawButton.addEventListener('click', onDraw);
  els.challengeActions.addEventListener('submit', onChallengeAction);
  els.challengeDialog.addEventListener('close', onChallengeClosed);
  els.form.addEventListener('submit', onFormSubmit);
  els.form.addEventListener('input', (event) => clearFieldError(event.target.name));
  // The keyboard shows "next" on the title, but Enter would submit the form: move on instead.
  els.form.elements.title.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    els.form.elements.details.focus();
  });
  els.formDiscard.addEventListener('click', onDiscard);
  els.formRestore.addEventListener('click', onRestore);
  els.formCancel.addEventListener('click', () => els.formDialog.close());
  els.formDialog.addEventListener('close', () =>
    restoreFocus(els.formDialog, state.editingId ? `[data-edit="${CSS.escape(state.editingId)}"]` : null),
  );
  els.quizEdit.addEventListener('click', openQuizEditor);
  els.quizForm.addEventListener('submit', onQuizSubmit);
  els.quizText.addEventListener('input', () => checkQuiz());
  els.quizCancel.addEventListener('click', () => els.quizDialog.close());
  els.spoilerForm.addEventListener('submit', onSpoilerSubmit);
  els.spoilerDialog.addEventListener('close', onSpoilerClosed);
  for (const dialog of [els.challengeDialog, els.spoilerDialog]) enableLightDismissFallback(dialog);
  window.addEventListener('hashchange', () => renderRoute());
  window.addEventListener('online', renderSync);
  window.addEventListener('offline', renderSync);
}

async function main() {
  hydrateIcons();
  buildCategoryControls();
  bindEvents();
  setupInstall();
  try {
    startLeaves(els.leaves, els.burst);
  } catch (error) {
    // Decoration only: the app works without it.
    console.warn('Leaves not started.', error);
  }
  // Ms Madi draws only the accented letters of the titles, so a page may never ask for it:
  // fetch it now, while online, and the service worker keeps it for the flight.
  document.fonts?.load('1em "Ms Madi"', 'àèéìòù').catch(() => {});
  window.addEventListener('load', registerServiceWorker, { once: true });
  renderRoute({ initial: true });
  render();
  renderSync();
  try {
    store = await openStore();
  } catch (error) {
    console.error(error);
    state.sync = { state: 'error', message: 'Impossibile avviare la sincronizzazione: controlla la connessione e ricarica la pagina.' };
    renderSync();
    return;
  }
  if (store.mode === 'local') {
    showBanner(
      'local-mode',
      'info',
      'Modalità locale: le sfide restano su questo dispositivo. Configura Firebase per condividerle con il gruppo.',
    );
  }
  store.subscribe({
    onChange: (challenges) => {
      state.challenges = challenges;
      render();
    },
    onStatus: (sync) => {
      state.sync = sync;
      renderSync();
    },
    onError: (message) => toast(message, 'error'),
  });
  // Started with the app, not with the deck page: the phone keeps the quiz for the flight.
  store.subscribeQuiz(onQuiz);
}

main();
