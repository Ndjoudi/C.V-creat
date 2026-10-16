/**
 * quiz-builder.js — section §03 « Quizz » (README §2, §4).
 *
 * Le quizz est la SEULE porte vers la grille, les mots croisés et l'histoire.
 * On y montre la définition périphrasée du mot — celle-là même qui sert
 * d'indice dans les grilles (§6.1) — et l'utilisateur choisit le mot parmi
 * quatre. Rien d'autre.
 *
 * Pourquoi la définition plutôt que la traduction française : reconnaître
 * « eau » → WATER ne teste que l'appariement de deux étiquettes. Lire
 * « you drink it when you are thirsty » et retrouver le mot, c'est comprendre
 * de l'anglais. C'est aussi exactement ce que la grille demandera.
 *
 * Fonctions pures.
 */

import { aujourdhui, appliquerResultat, motsAQuizzer,
         BOITE_CONNU, BOITE_MIN, DELAIS, ajouterJours } from "./leitner.js";
import { construireQCM } from "./session-builder.js";

/** Mots présentés en une passe de quizz. */
export const MOTS_PAR_QUIZZ = 8;

/**
 * Résout les ids dus en entités complètes, catalogue et mots perso confondus.
 *
 * @param {object} state
 * @param {Map<string,object>} catalogue
 * @param {string} today
 * @returns {object[]}
 */
export function motsAQuizzerResolus(state, catalogue, today = aujourdhui()) {
  const perso = new Map((state?.perso ?? []).map((mot) => [mot.id, mot]));
  return motsAQuizzer(state, today)
    .map(({ id }) => catalogue?.get(id) ?? perso.get(id))
    .filter(Boolean);
}

/**
 * Compose une passe de quizz.
 *
 * Un mot sans définition ne peut pas être quizzé : on ne va pas demander de
 * reconnaître un mot à partir de rien. Ces mots-là passent directement en
 * « connu », faute de moyen de les vérifier — c'est signalé à l'appelant pour
 * qu'il enregistre la promotion.
 *
 * @param {object} options
 * @param {object} options.state
 * @param {Map<string,object>} options.catalogue
 * @param {number} options.limite
 * @param {string} options.today
 * @returns {{questions:Array, sansDefinition:object[], restants:number, vide:boolean}}
 */
export function composerQuizz({ state, catalogue, limite = MOTS_PAR_QUIZZ,
                                today = aujourdhui() } = {}) {
  const dus = motsAQuizzerResolus(state, catalogue, today);
  const quizzables = dus.filter((mot) => (mot.indice?.segments ?? []).length > 0);
  const sansDefinition = dus.filter((mot) => !(mot.indice?.segments ?? []).length);

  const retenus = quizzables.slice(0, limite);
  const candidats = [...(catalogue?.values() ?? [])];

  return {
    questions: retenus.map((mot) => ({
      mot,
      // La définition est affichée telle quelle, segments tappables compris :
      // un mot inconnu dans l'énoncé doit pouvoir partir en apprentissage.
      segments: mot.indice.segments,
      ...construireQCM(mot, candidats),
    })),
    sansDefinition,
    restants: Math.max(quizzables.length - limite, 0),
    vide: dus.length === 0,
  };
}

/**
 * Applique le verdict du quizz pour un mot.
 *
 *   réussi → boîte 3, statut « connu » : il entre dans §05, §06 et §07
 *   raté   → boîte 1, statut « attente » : il repart en apprentissage (§04)
 *
 * @param {object}  state
 * @param {string}  id
 * @param {boolean} correct
 * @param {string}  today
 * @returns {object} nouvel état
 */
export function appliquerQuizz(state, id, correct, today = aujourdhui()) {
  if (!id) return state;
  const fiche = state.words?.[id];

  if (correct) {
    return {
      ...state,
      words: {
        ...state.words,
        [id]: appliquerResultat(fiche, { succes: true, date: today, statut: "connu" }),
      },
    };
  }

  // Un mot raté ne revient pas immédiatement : le délai de deux jours vaut ici
  // comme partout ailleurs (§5), sinon on le reverrait dans la même minute.
  return {
    ...state,
    words: {
      ...state.words,
      [id]: {
        ...(fiche ?? {}),
        b: BOITE_MIN,
        r: ajouterJours(today, DELAIS[0]),
        s: fiche?.s ?? 0,
        e: (fiche?.e ?? 0) + 1,
        d: today,
        st: "attente",
      },
    },
  };
}

/**
 * Promeut les mots qu'on ne sait pas quizzer, faute de définition.
 *
 * @param {object} state
 * @param {object[]} mots
 * @param {string} today
 * @returns {object} nouvel état
 */
export function promouvoirSansDefinition(state, mots = [], today = aujourdhui()) {
  if (!mots.length) return state;
  const words = { ...state.words };
  for (const mot of mots) {
    words[mot.id] = appliquerResultat(words[mot.id],
      { succes: true, date: today, statut: "connu" });
    words[mot.id].b = Math.max(words[mot.id].b, BOITE_CONNU);
  }
  return { ...state, words };
}
