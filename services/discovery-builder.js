/**
 * discovery-builder.js — section §02 « Découverte » (README §2, §4).
 *
 * La découverte ne fait qu'une chose : trier. Elle ne teste rien, elle
 * n'attribue aucun score. Les deux verdicts ont des conséquences opposées mais
 * coûtent le même geste, ce qui rend le tri honnête.
 *
 *   « je connais »        → le quizz (§03), qui vérifie avant d'ouvrir les jeux
 *   « je ne connais pas » → attente de 2 jours, puis Apprendre (§04)
 *
 * Se déclarer sûr de soi ne suffit pas : rien n'entre dans la grille, les mots
 * croisés ou l'histoire sans être passé par le quizz.
 *
 * Fonctions pures : rien n'est écrit ici, un nouvel état est renvoyé.
 */

import { aujourdhui, ficheAQuizzer, ficheEnAttente } from "./leitner.js";
import { fileDecouverte, retirerDeLaFile } from "./session-builder.js";

/** Mots présentés en une fois dans §02. Au-delà, le tri devient mécanique. */
export const MOTS_PAR_DECOUVERTE = 10;

/**
 * Compose la file de découverte du moment.
 *
 * L'ordre est celui de la §3 : mots ajoutés organiquement, puis mots saisis
 * manuellement, puis mots du palier courant par fréquence croissante.
 *
 * @param {object} options
 * @param {object} options.state
 * @param {Map<string,object>} options.catalogue
 * @param {number} options.limite
 * @returns {{mots:object[], restants:number, vide:boolean}}
 */
export function composerDecouverte({ state, catalogue, limite = MOTS_PAR_DECOUVERTE } = {}) {
  const file = fileDecouverte(state, catalogue);
  return {
    mots: file.slice(0, limite),
    restants: Math.max(file.length - limite, 0),
    vide: file.length === 0,
  };
}

/**
 * Enregistre un verdict de découverte.
 *
 * Le mot quitte la file explicite dans les deux cas : il a été vu, il ne doit
 * plus être proposé au tri. C'est sa fiche Leitner qui décide de la suite.
 *
 * @param {object}  state
 * @param {string}  id      id du mot trié
 * @param {boolean} connu   verdict de l'utilisateur
 * @param {string}  today
 * @returns {object} nouvel état
 */
export function appliquerDecouverte(state, id, connu, today = aujourdhui()) {
  if (!id) return state;

  const suivant = {
    ...state,
    words: {
      ...state.words,
      [id]: connu ? ficheAQuizzer(today) : ficheEnAttente(today),
    },
  };

  return retirerDeLaFile(suivant, [id]);
}

/**
 * Applique une série de verdicts en une passe, pour la fin d'un deck.
 *
 * @param {object} state
 * @param {Array<{id:string, connu:boolean}>} verdicts
 * @param {string} today
 * @returns {object} nouvel état
 */
export function appliquerDecouvertes(state, verdicts = [], today = aujourdhui()) {
  return verdicts.reduce(
    (courant, { id, connu }) => appliquerDecouverte(courant, id, connu, today),
    state,
  );
}
