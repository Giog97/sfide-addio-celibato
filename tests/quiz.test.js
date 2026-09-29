import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUIZ_LIMITS, formatQuiz, normalizeQuiz, parseQuiz } from '../js/quiz.js';

// Same layout as the list the organizers prepare. The texts are made up: the repository is public,
// and the real questions must not reach the groom.
const SAMPLE = [
  'Domande da fare allo sposo:',
  '1. Qual è il suo libro preferito?',
  '2. In che città vorrebbe vivere?',
  '3. È più da caffè o da tè?',
  '--- ',
  'Risposte:',
  '1- Il piccolo principe, Harry Potter ',
  '2-Lisbona',
  '3 - tè',
].join('\n');

test('parseQuiz pairs numbered questions and answers', () => {
  assert.deepEqual(parseQuiz(SAMPLE), {
    items: [
      { question: 'Qual è il suo libro preferito?', answer: 'Il piccolo principe, Harry Potter' },
      { question: 'In che città vorrebbe vivere?', answer: 'Lisbona' },
      { question: 'È più da caffè o da tè?', answer: 'tè' },
    ],
    warnings: [],
  });
});

test('parseQuiz starts the answers at a heading or when the numbering restarts', () => {
  const expected = [
    { question: 'Domanda uno?', answer: 'Uno' },
    { question: 'Domanda due?', answer: 'Due' },
  ];
  assert.deepEqual(parseQuiz('1. Domanda uno?\n2. Domanda due?\nLe risposte di lei\n1. Uno\n2. Due').items, expected);
  assert.deepEqual(parseQuiz('1) Domanda uno?\n2) Domanda due?\n\n1) Uno\n2) Due').items, expected);
});

test('parseQuiz joins continuation lines and skips headings', () => {
  const text = 'Domande:\n1. Una domanda\nsu due righe?\n---\nRisposte:\n1- Una risposta\nche continua';
  assert.deepEqual(parseQuiz(text).items, [{ question: 'Una domanda su due righe?', answer: 'Una risposta che continua' }]);
});

test('parseQuiz does not take a question line that mentions answers for the answers heading', () => {
  const text = '1. Libri preferiti?\n(valgono più risposte)\n2. Sport preferito?\n---\n1- Tre\n2- Nuoto';
  assert.deepEqual(parseQuiz(text).items, [
    { question: 'Libri preferiti? (valgono più risposte)', answer: 'Tre' },
    { question: 'Sport preferito?', answer: 'Nuoto' },
  ]);
});

test('parseQuiz orders the questions by number', () => {
  assert.deepEqual(parseQuiz('3. Terza?\n2. Seconda?\n---\n2- Due\n3- Tre').items, [
    { question: 'Seconda?', answer: 'Due' },
    { question: 'Terza?', answer: 'Tre' },
  ]);
});

test('parseQuiz warns about questions without answers and answers without questions', () => {
  const { items, warnings } = parseQuiz('1. Prima?\n3. Terza?\n---\n1- Sì\n2- Orfana');
  assert.deepEqual(items, [
    { question: 'Prima?', answer: 'Sì' },
    { question: 'Terza?', answer: '' },
  ]);
  assert.deepEqual(warnings, ['La domanda 3 non ha una risposta.', 'La risposta 2 non ha una domanda: la salto.']);
});

test('parseQuiz keeps the first of two entries with the same number', () => {
  const { items, warnings } = parseQuiz('1. Prima?\n2. Seconda?\n2. Doppia?\n---\n1- A\n2- B');
  assert.deepEqual(
    items.map((item) => item.question),
    ['Prima?', 'Seconda?'],
  );
  assert.deepEqual(warnings, ['La domanda 2 compare due volte: tengo la prima.']);
});

test('parseQuiz skips empty questions and cuts texts to the limits', () => {
  const question = 'a'.repeat(QUIZ_LIMITS.question + 5);
  const answer = 'b'.repeat(QUIZ_LIMITS.answer + 5);
  const { items, warnings } = parseQuiz(`1.\n2. ${question}\n---\n1- X\n2- ${answer}`);
  assert.deepEqual(items, [{ question: 'a'.repeat(QUIZ_LIMITS.question), answer: 'b'.repeat(QUIZ_LIMITS.answer) }]);
  assert.deepEqual(warnings, [
    'La domanda 1 è vuota: la salto.',
    `La domanda 2 supera i ${QUIZ_LIMITS.question} caratteri: l'ho accorciata.`,
    `La risposta 2 supera i ${QUIZ_LIMITS.answer} caratteri: l'ho accorciata.`,
  ]);
});

test('parseQuiz never splits a character made of two code units', () => {
  const smile = '\u{1F600}';
  const [item] = parseQuiz(`1. Domanda?\n---\n1- ${'x'.repeat(QUIZ_LIMITS.answer - 1)}${smile}${smile}`).items;
  assert.equal(item.answer, `${'x'.repeat(QUIZ_LIMITS.answer - 1)}${smile}`);
});

test('parseQuiz keeps at most the maximum number of questions', () => {
  const count = QUIZ_LIMITS.items + 2;
  const questions = Array.from({ length: count }, (_, i) => `${i + 1}. Domanda ${i + 1}?`);
  const answers = Array.from({ length: count }, (_, i) => `${i + 1}- Risposta ${i + 1}`);
  const { items, warnings } = parseQuiz([...questions, '---', ...answers].join('\n'));
  assert.equal(items.length, QUIZ_LIMITS.items);
  assert.deepEqual(warnings, [`Ci sono più di ${QUIZ_LIMITS.items} domande: tengo le prime ${QUIZ_LIMITS.items}.`]);
});

test('parseQuiz finds nothing in text without numbered lines', () => {
  assert.deepEqual(parseQuiz('Solo appunti\nsenza numeri'), { items: [], warnings: [] });
  assert.deepEqual(parseQuiz(''), { items: [], warnings: [] });
});

test('formatQuiz writes text that parseQuiz reads back unchanged', () => {
  const items = [
    { question: 'Qual è il suo sport preferito?', answer: 'nuoto' },
    { question: 'Chi cucina di più?', answer: '' },
  ];
  const text = formatQuiz(items);
  assert.equal(text, 'Domande:\n1. Qual è il suo sport preferito?\n2. Chi cucina di più?\n---\nRisposte:\n1- nuoto\n2-');
  assert.deepEqual(parseQuiz(text).items, items);
  assert.equal(formatQuiz([]), '');
});

test('normalizeQuiz keeps valid entries and drops the rest', () => {
  assert.deepEqual(normalizeQuiz(undefined), []);
  assert.deepEqual(normalizeQuiz({ items: 'no' }), []);
  assert.deepEqual(
    normalizeQuiz({ items: [{ question: '  Domanda  ', answer: 42 }, null, { question: '', answer: 'x' }, { answer: 'y' }] }),
    [{ question: 'Domanda', answer: '42' }],
  );
  const many = Array.from({ length: QUIZ_LIMITS.items + 1 }, (_, i) => ({ question: `D${i}`, answer: '' }));
  assert.equal(normalizeQuiz({ items: many }).length, QUIZ_LIMITS.items);
});
