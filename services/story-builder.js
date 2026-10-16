/**
 * story-builder.js — section §06 « Histoire du jour » (README §2, §6.5, §14).
 *
 * Choisit le texte du jour parmi le stock hors ligne, en fonction de ce que
 * l'utilisateur connaît réellement. La règle des 95% n'est pas décorative :
 * en dessous, la lecture cesse d'être fluide, les mots inconnus ne se devinent
 * plus au contexte et le texte devient un exercice de traduction.
 *
 * Ce service ne fait aucun appel réseau. Quand le stock ne suffit pas, il le
 * DIT — c'est l'écran qui décide de demander une génération à l'API (§16).
 *
 * Fonctions pures.
 */

import { aujourdhui, motsConnus } from "./leitner.js";

/** Couverture minimale pour qu'une histoire soit servie telle quelle (§6.5). */
export const COUVERTURE_MIN = 0.95;

/**
 * Part du lexique d'une histoire que l'utilisateur connaît déjà.
 * Une histoire sans lexique déclaré est considérée comme non couverte : on ne
 * sert pas un texte dont on ne sait pas mesurer la difficulté.
 *
 * @param {object} histoire
 * @param {Set<string>} connus
 * @returns {number} entre 0 et 1
 */
export function couverture(histoire, connus = new Set()) {
  const lexique = histoire?.lexique ?? [];
  if (!lexique.length) return 0;
  const sus = lexique.filter((id) => connus.has(id)).length;
  return sus / lexique.length;
}

/**
 * Choisit l'histoire du jour (README §14, `storyBuilder`).
 *
 * À couverture égale, la continuation d'un arc déjà entamé l'emporte : une
 * histoire suivie tient le lecteur mieux qu'une succession de textes isolés.
 *
 * @param {object} options
 * @param {object} options.state
 * @param {object[]} options.histoires
 * @param {string} options.today
 * @returns {{histoire:?object, couverture:number, suffisante:boolean,
 *            dejaLue:boolean, verrouille:boolean, raison:?string}}
 */
export function choisirHistoire({ state, histoires = [], today = aujourdhui() } = {}) {
  const lues = new Set(state?.progression?.histoires_lues ?? []);

  if (state?.progression?.derniere_histoire === today) {
    const id = [...lues].at(-1);
    return {
      histoire: histoires.find((h) => h.id === id) ?? null,
      couverture: 1,
      suffisante: true,
      dejaLue: true,
      verrouille: false,
      raison: null,
    };
  }

  const connus = new Set(motsConnus(state));
  const candidates = histoires.filter((h) => !lues.has(h.id));

  if (!candidates.length) {
    return {
      histoire: null, couverture: 0, suffisante: false, dejaLue: false,
      verrouille: true,
      raison: histoires.length
        ? "Tu as lu toutes les histoires disponibles."
        : "Aucune histoire n'est encore livrée.",
    };
  }

  const arcsEnCours = new Set(
    histoires.filter((h) => lues.has(h.id) && h.arc).map((h) => h.arc));

  const classees = candidates
    .map((histoire) => ({ histoire, part: couverture(histoire, connus) }))
    .sort((a, b) => {
      if (b.part !== a.part) return b.part - a.part;
      const suiteA = a.histoire.arc && arcsEnCours.has(a.histoire.arc) ? 1 : 0;
      const suiteB = b.histoire.arc && arcsEnCours.has(b.histoire.arc) ? 1 : 0;
      if (suiteA !== suiteB) return suiteB - suiteA;
      return Number(a.histoire.ordre ?? 0) - Number(b.histoire.ordre ?? 0);
    });

  const meilleure = classees[0];
  return {
    histoire: meilleure.histoire,
    couverture: meilleure.part,
    suffisante: meilleure.part >= COUVERTURE_MIN,
    dejaLue: false,
    verrouille: false,
    raison: null,
  };
}

/**
 * Marque l'histoire du jour comme lue et fait monter d'une boîte les mots de
 * son lexique lus sans consulter la traduction (README §4.1).
 *
 * @param {object} options
 * @param {object} options.state
 * @param {object} options.histoire
 * @param {string[]} options.aides  ids dont la traduction a été consultée
 * @param {Function} options.appliquer  injectée pour rester sans dépendance forte
 * @param {string} options.today
 * @returns {object} nouvel état
 */
export function appliquerHistoire({ state, histoire, aides = [], appliquer,
                                    today = aujourdhui() } = {}) {
  if (!histoire) return state;

  const consultes = new Set(aides);
  const words = { ...state.words };
  for (const id of histoire.lexique ?? []) {
    // Un mot que l'utilisateur ne connaît pas encore n'a rien à faire ici :
    // l'histoire révise, elle n'introduit pas (§1).
    if (!words[id]) continue;
    words[id] = appliquer(words[id], {
      succes: true,
      traductionConsultee: consultes.has(id),
      date: today,
    });
  }

  const lues = state?.progression?.histoires_lues ?? [];
  return {
    ...state,
    words,
    progression: {
      ...state.progression,
      histoires_lues: lues.includes(histoire.id) ? lues : [...lues, histoire.id],
      derniere_histoire: today,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Secours par génération (README §16)                                         */
/* -------------------------------------------------------------------------- */

/**
 * Compose la requête à envoyer à l'API quand le stock ne suffit pas.
 *
 * On n'envoie que des mots RÉELLEMENT connus : c'est la seule garantie que le
 * texte reçu sera lisible. Si un arc est en cours, on joint son résumé pour
 * que la génération enchaîne au lieu de repartir de zéro.
 *
 * @param {object} options
 * @param {object} options.state
 * @param {Map<string,object>} options.catalogue
 * @param {object[]} options.histoires
 * @param {number} options.longueur
 * @returns {{mots:string[], arc:?object, longueur:number}}
 */
export function requeteHistoire({ state, catalogue, histoires = [], longueur = 300 } = {}) {
  const mots = motsConnus(state)
    .map((id) => catalogue?.get(id)?.en)
    .filter(Boolean);

  const lues = new Set(state?.progression?.histoires_lues ?? []);
  const derniere = [...histoires].reverse().find((h) => lues.has(h.id) && h.arc);

  return {
    mots,
    arc: derniere ? { id: derniere.arc, resume_en: derniere.titre_en ?? null } : null,
    longueur,
  };
}

/**
 * Transforme une réponse de l'API en histoire exploitable (§6.5).
 *
 * Le lexique est recalculé à partir du texte reçu, jamais lu dans la réponse :
 * le modèle n'est pas une source fiable pour dire ce qu'il a employé.
 *
 * @param {object} reponse
 * @param {object} options
 * @param {Map<string,object>} options.catalogue
 * @param {string} options.id
 * @param {?string} options.arc
 * @param {?string} options.suiteDe
 * @returns {?object}
 */
export function histoireDepuisApi(reponse, { catalogue, id, arc = null, suiteDe = null } = {}) {
  const texte = String(reponse?.texte_en ?? "").trim();
  if (!texte) return null;

  const parEn = new Map();
  for (const mot of catalogue?.values() ?? []) if (!parEn.has(mot.en)) parEn.set(mot.en, mot.id);

  const lexique = new Set();
  const hors = new Set();
  for (const jeton of texte.split(/\s+/)) {
    const nu = jeton.toLowerCase().replace(/[^a-z']/g, "");
    if (!nu) continue;
    const ref = parEn.get(nu);
    if (ref) lexique.add(ref);
    else hors.add(nu);
  }

  return {
    id,
    arc,
    ordre: null,
    titre_en: reponse.titre_en ?? null,
    titre_fr: reponse.titre_fr ?? null,
    texte_en: texte,
    texte_fr: reponse.texte_fr ?? null,
    nb_mots: texte.split(/\s+/).length,
    lexique: [...lexique],
    hors_lexique: [...hors].sort(),
    suite_de: suiteDe,
    source: "api",
  };
}

/** Identifiant d'une histoire générée : daté, donc unique et lisible. */
export function idHistoireGeneree(today = aujourdhui()) {
  return `h_api_${today}`;
}
