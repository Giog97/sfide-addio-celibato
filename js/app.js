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
  historyOf,
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
const TOAST_MS = 3200;
const IOS_HINT_KEY = 'sfide-addio-celibato:ios-hint-dismissed';
const INSTALL_DISMISSED_KEY = 'sfide-addio-celibato:install-dismissed';
const supportsPopover = 'popover' in HTMLElement.prototype;

const state = {
  challenges: [],
  sync: { state: 'connecting' },
  selectedCategory: null,
  openChallengeId: null,
  editingId: null,
  deckUnlocked: false,
  drawing: false,
};

let store = null;
let deferredInstallPrompt = null;
let toastTimer = 0;

const byId = (id) => document.getElementById(id);

const els = {
  syncStatus: byId('sync-status'),
  syncLabel: byId('sync-label'),
  banners: byId('banners'),
  views: document.querySelectorAll('[data-view]'),
  deckView: byId('view-deck'),
  deckTitle: byId('deck-title'),
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
  historyList: byId('history-list'),
  historyEmpty: byId('history-empty'),
  historyCount: byId('history-count'),
  deckGroups: byId('deck-groups'),
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
  closeChallengeButton: byId('close-challenge-button'),
  formDialog: byId('form-dialog'),
  form: byId('challenge-form'),
  formTitle: byId('form-title'),
  formCategories: byId('form-categories'),
  formSubmit: byId('form-submit'),
  formDiscard: byId('form-discard'),
  formRestore: byId('form-restore'),
  formCancel: byId('form-cancel'),
  spoilerDialog: byId('spoiler-dialog'),
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

function findChallenge(id) {
  return state.challenges.find((c) => c.id === id) ?? null;
}

function remainingLabel(count) {
  if (count === 0) return 'Nessuna rimasta';
  return count === 1 ? '1 rimasta' : `${count} rimaste`;
}

function categoryChip(categoryId) {
  const label = categoryById(categoryId)?.label ?? categoryId;
  return h('span', { className: 'chip', dataset: { category: categoryId } }, icon(CATEGORY_ICONS[categoryId] ?? 'cards'), label);
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
      { type: 'button', className: 'row', dataset: { [action]: challenge.id, category: challenge.category, status: challenge.status } },
      h('span', { className: 'row-icon' }, icon(CATEGORY_ICONS[challenge.category] ?? 'cards')),
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
        { className: 'tile', dataset: { category: category.id } },
        h('input', { type: 'radio', name: 'category', value: category.id, className: 'visually-hidden' }),
        h('span', { className: 'tile-icon' }, icon(CATEGORY_ICONS[category.id])),
        h('span', { className: 'tile-name' }, category.label),
        ' ',
        h('span', { className: 'tile-count', dataset: { countFor: category.id } }),
      ),
    ),
  );
  els.formCategories.replaceChildren(
    ...CATEGORIES.map((category) =>
      h(
        'label',
        { className: 'segment', dataset: { category: category.id } },
        h('input', { type: 'radio', name: 'category', value: category.id, required: true, className: 'visually-hidden' }),
        icon(CATEGORY_ICONS[category.id]),
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
  els.drawArea.dataset.category = category.id;
  els.drawButton.hidden = remaining === 0;
  els.emptyDeck.hidden = remaining > 0;
  els.drawSub.textContent = `${category.hint} · ${remainingLabel(remaining).toLowerCase()}`;
  els.emptyDeckName.textContent = category.label;
}

function renderHistory() {
  const history = historyOf(state.challenges);
  els.historyEmpty.hidden = history.length > 0;
  els.historyCount.textContent = history.length > 0 ? String(history.length) : '';
  replaceRows(els.historyList, history.map((c) => challengeRow(c, 'open')));
}

function renderDeck() {
  const { groups, discarded } = deckView(state.challenges);
  replaceRows(
    els.deckGroups,
    groups.map(({ category, items }) =>
      h(
        'section',
        { className: 'deck-group', dataset: { category: category.id }, 'aria-labelledby': `deck-${category.id}` },
        h(
          'h3',
          { className: 'deck-group-title', id: `deck-${category.id}` },
          icon(CATEGORY_ICONS[category.id]),
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
  // Separate live region, so repeated messages are announced too.
  els.announcer.textContent = '';
  setTimeout(() => {
    els.announcer.textContent = message;
  }, 50);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, TOAST_MS);
}

function hideToast() {
  if (supportsPopover && els.toast.matches(':popover-open')) els.toast.hidePopover();
  els.toast.classList.remove('is-open');
}

// Challenge sheet

function openChallenge(id, { reveal = false } = {}) {
  if (!findChallenge(id)) return;
  state.openChallengeId = id;
  renderChallengeSheet();
  els.challengeDialog.toggleAttribute('data-reveal', reveal);
  if (!els.challengeDialog.open) els.challengeDialog.showModal();
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
  els.putBackButton.hidden = challenge.status !== STATUS.DRAWN;
  els.closeChallengeButton.textContent = challenge.status === STATUS.DRAWN ? 'Decidi dopo' : 'Chiudi';
}

// The sheet buttons submit a method="dialog" form. The result is applied on submit, which runs at
// once: the dialog 'close' event waits for the next rendered frame, which a hidden page never gets.
function onChallengeAction(event) {
  const action = event.submitter?.value;
  const challenge = findChallenge(state.openChallengeId);
  if (!challenge) return;
  const now = Date.now();
  if ((action === STATUS.PASSED || action === STATUS.FAILED) && isResolvable(challenge) && challenge.status !== action) {
    const message = action === STATUS.PASSED ? 'Superata! Grande!' : 'Non superata: scatta la penitenza!';
    applyPatch(challenge, resolvePatch(challenge, action, now), message);
  } else if (action === 'putback' && challenge.status === STATUS.DRAWN) {
    applyPatch(challenge, putBackPatch(challenge, now), 'Rimessa nel mazzo: potrà uscire di nuovo.');
  }
}

function onChallengeClosed() {
  // A late 'close' (see above) must not reset a sheet that has been opened again meanwhile.
  if (els.challengeDialog.open) return;
  const id = state.openChallengeId;
  state.openChallengeId = null;
  els.challengeDialog.removeAttribute('data-reveal');
  // The row that opened the sheet may have been rebuilt meanwhile: focus its replacement.
  if (id && document.activeElement === document.body) {
    els.historyList.querySelector(`[data-open="${CSS.escape(id)}"]`)?.focus();
  }
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

// Routing

function showView(name) {
  const changing = [...els.views].some((view) => view.hidden === (view.dataset.view === name));
  for (const view of els.views) view.hidden = view.dataset.view !== name;
  if (!changing) return;
  window.scrollTo(0, 0);
  if (name === 'deck') {
    renderDeck();
    els.deckTitle.focus();
  }
}

function renderRoute() {
  const wantsDeck = location.hash === '#/mazzo';
  if (!wantsDeck) {
    state.deckUnlocked = false;
    // A back gesture can leave the deck route while the warning is still open.
    if (els.spoilerDialog.open) els.spoilerDialog.close();
  }
  if (wantsDeck && !state.deckUnlocked) {
    showView('home');
    if (!els.spoilerDialog.open) {
      els.spoilerDialog.returnValue = '';
      els.spoilerDialog.showModal();
    }
    return;
  }
  showView(wantsDeck ? 'deck' : 'home');
}

function onSpoilerClosed() {
  if (els.spoilerDialog.returnValue === 'enter') {
    state.deckUnlocked = true;
    renderRoute();
  } else if (location.hash === '#/mazzo') {
    history.replaceState(null, '', `${location.pathname}${location.search}`);
  }
}

// Events

function bindEvents() {
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action="add"], [data-open], [data-edit]');
    if (!target) return;
    if (target.dataset.action === 'add') openForm();
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
  els.spoilerDialog.addEventListener('close', onSpoilerClosed);
  for (const dialog of [els.challengeDialog, els.spoilerDialog]) enableLightDismissFallback(dialog);
  window.addEventListener('hashchange', renderRoute);
  window.addEventListener('online', renderSync);
  window.addEventListener('offline', renderSync);
}

async function main() {
  hydrateIcons();
  buildCategoryControls();
  bindEvents();
  setupInstall();
  window.addEventListener('load', registerServiceWorker, { once: true });
  renderRoute();
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
}

main();
