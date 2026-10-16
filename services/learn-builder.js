/**
 * learn-builder.js — section §04 « Apprendre » (README §2, §4, §5.1).
 *
 * Reçoit deux flux : les mots marqués « je ne connais pas » en découverte, et
 * les mots ratés au quizz (§03). Dans les deux cas après le délai de 2 jours.
 *
 * Deux exercices, toujours dans cet ordre :
 *   1. QUIZ     — QCM 4 options, distracteurs proches graphiquement
 *   2. Écriture — FR → EN à taper, sans aide
 *
 * Les deux doivent être réussis pour que le mot monte d'une boîte. Rater l'un
 * des deux renvoie en boîte 1 : reconnaître n'est pas savoir écrire, et savoir
 * écrire sans reconnaître n'arrive pas.
 *
 * Un mot qui atteint la boîte 3 ne file PAS dans les jeux : il retourne au
 * quizz (§03), seule porte d'entrée des sections de révision.
 *
 * Fonctions pures.
 */

import { aujourdhui, appliquerResultat, motsAApprendre,
         BOITE_CONNU } from "./leitner.js";
import { construireQCM, construireRappel } from "./session-builder.js";

/** Mots travaillés en une session d'apprentissage. */
export const MOTS_PAR_APPRENTISSAGE = 5;

/**
 * Résout les ids dus en entités complètes, catalogue et mots perso confondus.
 *
 * @param {object} state
 * @param {Map<string,object>} catalogue
 * @param {string} today
 * @returns {object[]}
 */
export function motsDusResolus(state, catalogue, today = aujourdhui()) {
  const perso = new Map((state?.perso ?? []).map((mot) => [mot.id, mot]));
  return motsAApprendre(state, today)
    .map(({ id }) => catalogue?.get(id) ?? perso.get(id))
    .filter(Boolean);
}

/**
 * Compose la session d'apprentissage du moment.
 *
 * Les distracteurs du QCM sont pris dans le catalogue entier, pas seulement
 * parmi les mots dus : c'est ce qui permet à `construireQCM` de trouver des
 * formes réellement proches (MENU / MEAL / MEET / MELT).
 *
 * @param {object} options
 * @param {object} options.state
 * @param {Map<string,object>} options.catalogue
 * @param {number} options.limite
 * @param {string} options.today
 * @returns {{exercices:Array, restants:number, vide:boolean}}
 */
export function composerApprentissage({ state, catalogue,
                                        limite = MOTS_PAR_APPRENTISSAGE,
                                        today = aujourdhui() } = {}) {
  const dus = motsDusResolus(state, catalogue, today);
  const retenus = dus.slice(0, limite);
  const candidats = [...(catalogue?.values() ?? [])];

  return {
    exercices: retenus.map((mot) => ({
      mot,
      quiz: construireQCM(mot, candidats),
      ecriture: construireRappel(mot),
    })),
    restants: Math.max(dus.length - limite, 0),
    vide: dus.length === 0,
  };
}

/**
 * Applique le résultat d'un mot travaillé dans §03.
 *
 * @param {object}  state
 * @param {string}  id
 * @param {object}  resultat
 * @param {boolean} resultat.quizCorrect
 * @param {boolean} resultat.ecritureCorrecte
 * @param {string}  today
 * @returns {object} nouvel état
 */
export function appliquerApprentissage(state, id, { quizCorrect, ecritureCorrecte } = {},
                                       today = aujourdhui()) {
  if (!id) return state;

  const reussi = Boolean(quizCorrect) && Boolean(ecritureCorrecte);
  const fiche = appliquerResultat(state.words?.[id], { succes: reussi, date: today,
                                                       statut: reussi ? "actif" : "attente" });

  // Sorti d'apprentissage : le mot repasse par le quizz avant d'ouvrir §05-§07.
  if (reussi && fiche.b >= BOITE_CONNU) {
    fiche.st = "quizz";
    fiche.r = today;
  }

  return { ...state, words: { ...state.words, [id]: fiche } };
}
