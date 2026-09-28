// Default challenges, loaded once into an empty store. Fixed ids keep seeding idempotent.

import { newChallenge } from './logic.js';

export const SEED_CHALLENGES = Object.freeze(
  [
    {
      id: 'seed-01',
      category: 'aereo',
      title: 'Quiz sulla dolce metà',
      details: 'Rispondi alle domande che il gruppo ha preparato sulla tua dolce metà.',
    },
    {
      id: 'seed-02',
      category: 'aereo',
      title: "L'annuncio in aereo",
      details:
        "Chiedi alle hostess di poter fare un annuncio: di' semplicemente che ti sposerai a breve e che vuoi rendere partecipe tutto l'aereo. Se le hostess ti danno l'ok e tu ti tiri indietro, gin tonic immediato.",
    },
    {
      id: 'seed-03',
      category: 'aereo',
      title: 'Mano nella mano al decollo',
      details:
        "Se accanto a te c'è uno sconosciuto, tienigli la mano durante il decollo spiegando che è il tuo primo volo e che hai tanta paura.",
    },
    {
      id: 'seed-04',
      category: 'aereo',
      title: "L'audio prima del decollo",
      details: "Riproduci l'audio in aereo prima della partenza.",
    },
    {
      id: 'seed-05',
      category: 'strada',
      title: 'Il matrimonio costa troppo',
      details:
        "Con un cartello con scritto «My wedding is too expensive. Please help me!» chiedi l'elemosina ai passanti. Hai 10-15 minuti per raccogliere la cifra decisa dal gruppo: se non ci arrivi, scegli tra penitenza e bere. Serve: cartello.",
    },
    {
      id: 'seed-06',
      category: 'strada',
      title: 'Televendita',
      details: 'Convinci tre persone a comprare un oggetto totalmente inutile, inventandone le qualità.',
    },
    {
      id: 'seed-07',
      category: 'strada',
      title: 'Il mago di strada',
      details: 'Fai un trucco di magia a due passanti. Serve: mazzo di carte.',
    },
    {
      id: 'seed-08',
      category: 'strada',
      title: 'Uomo birra e poliziotto',
      details: 'Vestito da uomo birra, fatti un selfie con un poliziotto. Serve: costume da uomo birra.',
    },
    {
      id: 'seed-09',
      category: 'strada',
      title: 'Selfie con sconosciuti',
      details: 'Fatti un selfie con persone a caso incontrate per strada.',
    },
    {
      id: 'seed-10',
      category: 'strada',
      title: 'Balla per strada',
      details:
        'Balla per strada con almeno una ragazza (va benissimo anche una vecchietta). La musica la mettiamo noi. Serve: cassa o telefono per la musica.',
    },
    {
      id: 'seed-11',
      category: 'strada',
      title: 'Bella ciao sulla panchina',
      details: 'Sali su una panchina in piazza e canta «Bella ciao», da solo.',
    },
    {
      id: 'seed-12',
      category: 'strada',
      title: 'Modalità NPC',
      details: 'Per 5 minuti cammina per strada comportandoti come un NPC di un videogioco.',
    },
    {
      id: 'seed-13',
      category: 'strada',
      title: "L'inviato speciale",
      details:
        'Con il telefono in mano come un microfono, fingi di essere un inviato TV e intervista 2-3 sconosciuti: «Secondo lei, quali sono le caratteristiche fondamentali di un buon marito?»',
    },
    {
      id: 'seed-14',
      category: 'strada',
      title: 'La posa ridicola',
      details:
        'Chiedi a uno sconosciuto di farti una foto nella posa ridicola scelta dal gruppo. Poi chiedi alla stessa persona di fare una foto di gruppo con tutti noi.',
    },
    {
      id: 'seed-15',
      category: 'pub',
      title: 'Il cameriere stellato',
      details:
        'A cena fuori, vai a un tavolo e presenta un piatto a tua scelta come se fossi il cameriere di un ristorante stellato.',
    },
    {
      id: 'seed-16',
      category: 'pub',
      title: 'Birre alla cieca',
      details:
        "In birreria ordina tre birre diverse, bendati e prova a indovinarle solo assaggiandole. Se sbagli, la birra va giù tutta d'un fiato. Serve: benda.",
    },
    {
      id: 'seed-17',
      category: 'pub',
      title: 'Per sempre sì',
      details: 'Canta «Per sempre sì» di Sal Da Vinci.',
    },
    {
      id: 'seed-18',
      category: 'pub',
      title: 'Il mimo',
      details: 'Fai indovinare a uno sconosciuto una parola scelta dal gruppo, senza parlare: solo mimo.',
    },
    {
      id: 'seed-19',
      category: 'pub',
      title: 'Voto da futuro marito',
      details: 'Entra in un locale e chiedi a uno sconosciuto: «Scusa, puoi darmi un voto da 1 a 10 come futuro marito?»',
    },
    {
      id: 'seed-20',
      category: 'pub',
      title: 'La recensione dal vivo',
      details:
        'Entra in un locale e, con estrema serietà, chiedi al cameriere se può farti una recensione dal vivo del posto, perché stai valutando se tornarci dopo il matrimonio.',
    },
  ].map((challenge) => Object.freeze(challenge)),
);

/** Full documents for seeding, all in the deck and stamped with `now`. */
export function seedDocuments(now) {
  return SEED_CHALLENGES.map(({ id, ...value }) => ({ id, ...newChallenge(value, now) }));
}
