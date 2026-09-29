// Questions about the bride for the "Quiz sulla dolce metà" challenge: parsing of the pasted list,
// formatting back for editing, normalization of stored data. Pure functions: no DOM, no storage.

export const QUIZ_LIMITS = Object.freeze({ items: 60, question: 200, answer: 500 });

// "1. text", "1) text", "1- text", "19 - text", "3-text"
const NUMBERED_LINE = /^(\d{1,3})\s*[.):\-–—]\s*(.*)$/;
const SEPARATOR_LINE = /^[-–—_=*]{3,}$/;
// "Risposte:", "Risposte di lei", "Le risposte": not a question line that merely mentions answers.
const ANSWERS_HEADING = /^(le\s+)?risposte\b/i;

const clean = (text) => text.replace(/\s+/g, ' ').trim();
// Lengths in code points, so that an emoji is never cut in half.
const length = (text) => Array.from(text).length;
const cut = (text, max) => Array.from(text).slice(0, max).join('');

/**
 * Reads numbered questions, then numbered answers, and pairs them by number. The answers start after
 * a "---" line, a heading that starts with "Risposte", or numbering that starts again from 1. Other lines
 * are headings (ending with ":") or continue the entry above them.
 * Returns the questions in numeric order, each with its answer ('' when missing), and Italian warnings.
 */
export function parseQuiz(text) {
  const sections = { questions: new Map(), answers: new Map() };
  const warnings = [];
  let section = 'questions';
  let current = null;

  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.trim();
    const numbered = NUMBERED_LINE.exec(line);
    if (line === '' || SEPARATOR_LINE.test(line)) {
      if (line !== '') section = 'answers';
      current = null;
    } else if (numbered) {
      const number = Number(numbered[1]);
      if (section === 'questions' && number === 1 && sections.questions.size > 0) section = 'answers';
      const entries = sections[section];
      if (entries.has(number)) {
        warnings.push(`${section === 'questions' ? 'La domanda' : 'La risposta'} ${number} compare due volte: tengo la prima.`);
        current = null;
      } else {
        current = { text: numbered[2] };
        entries.set(number, current);
      }
    } else if (ANSWERS_HEADING.test(line)) {
      section = 'answers';
      current = null;
    } else if (line.endsWith(':')) {
      current = null;
    } else if (current) {
      current.text = `${current.text} ${line}`;
    }
  }

  const items = [];
  for (const [number, entry] of [...sections.questions].sort(([a], [b]) => a - b)) {
    let question = clean(entry.text);
    let answer = clean(sections.answers.get(number)?.text ?? '');
    if (question === '') {
      warnings.push(`La domanda ${number} è vuota: la salto.`);
      continue;
    }
    if (length(question) > QUIZ_LIMITS.question) {
      question = cut(question, QUIZ_LIMITS.question);
      warnings.push(`La domanda ${number} supera i ${QUIZ_LIMITS.question} caratteri: l'ho accorciata.`);
    }
    if (answer === '') {
      warnings.push(`La domanda ${number} non ha una risposta.`);
    } else if (length(answer) > QUIZ_LIMITS.answer) {
      answer = cut(answer, QUIZ_LIMITS.answer);
      warnings.push(`La risposta ${number} supera i ${QUIZ_LIMITS.answer} caratteri: l'ho accorciata.`);
    }
    items.push({ question, answer });
  }
  for (const number of sections.answers.keys()) {
    if (!sections.questions.has(number)) warnings.push(`La risposta ${number} non ha una domanda: la salto.`);
  }
  if (items.length > QUIZ_LIMITS.items) {
    warnings.push(`Ci sono più di ${QUIZ_LIMITS.items} domande: tengo le prime ${QUIZ_LIMITS.items}.`);
    items.length = QUIZ_LIMITS.items;
  }
  return { items, warnings };
}

/** Writes a quiz back in the format that parseQuiz reads, so that it can be edited as text. */
export function formatQuiz(items) {
  if (items.length === 0) return '';
  return [
    'Domande:',
    ...items.map((item, index) => `${index + 1}. ${item.question}`),
    '---',
    'Risposte:',
    ...items.map((item, index) => `${index + 1}- ${item.answer}`.trimEnd()),
  ].join('\n');
}

/**
 * Coerces a stored quiz document into a list of { question, answer }; unusable entries are dropped.
 * The security rules cannot check each entry of a list, and the Firebase console bypasses them.
 */
export function normalizeQuiz(data) {
  if (!Array.isArray(data?.items)) return [];
  const text = (value) => (typeof value === 'string' || typeof value === 'number' ? clean(String(value)) : '');
  return data.items
    .map((item) => ({
      question: cut(text(item?.question), QUIZ_LIMITS.question),
      answer: cut(text(item?.answer), QUIZ_LIMITS.answer),
    }))
    .filter((item) => item.question !== '')
    .slice(0, QUIZ_LIMITS.items);
}
