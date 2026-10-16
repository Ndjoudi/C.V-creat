/**
 * game-builder.js — sections §04 « La grille » et §05 « Mots croisés »
 * (README §2, §14).
 *
 * Les deux jeux partagent la totalité de leurs règles, sauf une : ils ne
 * servent jamais les mêmes mots. La partition se fait par partie — une partie
 * porte `jeu: "grille"` ou `jeu: "croises"` — et l'état retient ce qui a déjà
 * été servi de chaque côté.
 *
 * Ce service **sélectionne**, il ne génère rien (README §17, règle 9).
 *
 * Fonctions pures.
 */

import { aujourdhui, appliquerResultat, motsConnus } from "./leitner.js";

/** Les deux jeux, tels qu'ils apparaissent dans `partie.jeu` et dans l'état. */
export const JEUX = ["grille", "croises"];

/** Une partie compte 5 mots : sans 5 mots connus, aucun jeu n'est jouable. */
export const MOTS_PAR_PARTIE = 5;

/**
 * Parties d'un jeu dont TOUS les mots sont connus de l'utilisateur.
 *
 * Une partie dont un seul mot manque est écartée : les jeux révisent, ils
 * n'enseignent pas (§1). Rencontrer un mot inconnu dans une grille vide n'est
 * pas un apprentissage, c'est un blocage.
 *
 * @param {object[]} parties
 * @param {string}   jeu
 * @param {Set<string>} connus
 * @returns {object[]}
 */
export function partiesJouables(parties = [], jeu, connus = new Set()) {
  return parties.filter((partie) => {
    if (partie?.jeu !== jeu) return false;
    if (partie.verifie !== true) return false;
    const mots = partie.mots ?? [];
    return mots.length > 0 && mots.every((id) => connus.has(id));
  });
}

/**
 * Choisit une partie pour le jeu demandé (README §14, `gameBuilder`).
 *
 * Quand toutes les parties jouables ont déjà été servies, la liste du jeu est
 * remise à zéro et le cycle recommence : c'est le seul moyen de ne jamais
 * laisser la section vide alors que du contenu existe. `reinitialise` le
 * signale à l'appelant, qui doit enregistrer l'état renvoyé.
 *
 * @param {object} options
 * @param {object} options.state
 * @param {object[]} options.parties
 * @param {string} options.jeu
 * @param {Function} options.tirer  injectable pour les tests
 * @returns {{verrouille:boolean, raison:?string, partie:?object,
 *            state:object, reinitialise:boolean, disponibles:number}}
 */
export function choisirPartie({ state, parties = [], jeu = "grille",
                               tirer = tirerAuHasard } = {}) {
  const connus = new Set(motsConnus(state));

  if (connus.size < MOTS_PAR_PARTIE) {
    return {
      verrouille: true,
      raison: `Il faut au moins ${MOTS_PAR_PARTIE} mots connus pour jouer.`,
      partie: null,
      state,
      reinitialise: false,
      disponibles: 0,
    };
  }

  const jouables = partiesJouables(parties, jeu, connus);
  if (!jouables.length) {
    return {
      verrouille: true,
      raison: "Aucune grille ne tient encore avec les mots que tu connais.",
      partie: null,
      state,
      reinitialise: false,
      disponibles: 0,
    };
  }

  const servies = new Set(state?.progression?.parties_servies?.[jeu] ?? []);
  let candidates = jouables.filter((partie) => !servies.has(partie.id));
  let courant = state;
  let reinitialise = false;

  if (!candidates.length) {
    courant = viderServies(state, jeu);
    candidates = jouables;
    reinitialise = true;
  }

  return {
    verrouille: false,
    raison: null,
    partie: tirer(candidates),
    state: courant,
    reinitialise,
    disponibles: candidates.length,
  };
}

/**
 * Nombre de parties encore disponibles pour un jeu, sans rien tirer.
 * Sert au compteur de la carte de Home (§13).
 *
 * @param {object} state
 * @param {object[]} parties
 * @param {string} jeu
 * @returns {number}
 */
export function partiesDisponibles(state, parties = [], jeu = "grille") {
  const connus = new Set(motsConnus(state));
  if (connus.size < MOTS_PAR_PARTIE) return 0;
  const jouables = partiesJouables(parties, jeu, connus);
  const servies = new Set(state?.progression?.parties_servies?.[jeu] ?? []);
  const restantes = jouables.filter((partie) => !servies.has(partie.id));
  // Une fois le cycle bouclé, tout redevient disponible : on l'annonce ainsi.
  return restantes.length || jouables.length;
}

/**
 * Marque une partie comme servie pour un jeu, sans toucher à l'autre.
 *
 * @param {object} state
 * @param {string} jeu
 * @param {string} id
 * @returns {object} nouvel état
 */
export function marquerPartieServie(state, jeu, id) {
  if (!id || !JEUX.includes(jeu)) return state;
  const servies = state?.progression?.parties_servies ?? { grille: [], croises: [] };
  const liste = servies[jeu] ?? [];
  if (liste.includes(id)) return state;

  return {
    ...state,
    progression: {
      ...state.progression,
      parties_servies: { ...servies, [jeu]: [...liste, id] },
    },
  };
}

/**
 * Vide la liste des parties servies d'un seul jeu.
 * @param {object} state
 * @param {string} jeu
 * @returns {object} nouvel état
 */
export function viderServies(state, jeu) {
  const servies = state?.progression?.parties_servies ?? { grille: [], croises: [] };
  return {
    ...state,
    progression: {
      ...state.progression,
      parties_servies: { ...servies, [jeu]: [] },
    },
  };
}

/**
 * Applique le résultat d'une partie terminée (README §4.1).
 *
 * Un mot complété sans aide monte d'une boîte. Un mot pour lequel l'utilisateur
 * a consulté la traduction ne monte pas : c'est le signal de maîtrise de la §5.
 *
 * @param {object} options
 * @param {object} options.state
 * @param {object} options.partie
 * @param {string} options.jeu
 * @param {string[]} options.aides  ids des mots dont la traduction a été lue
 * @param {string} options.today
 * @returns {object} nouvel état
 */
export function appliquerPartie({ state, partie, jeu = "grille",
                                 aides = [], today = aujourdhui() } = {}) {
  if (!partie) return state;

  const consultes = new Set(aides);
  const words = { ...state.words };
  for (const id of partie.mots ?? []) {
    words[id] = appliquerResultat(words[id], {
      succes: true,
      traductionConsultee: consultes.has(id),
      date: today,
    });
  }

  return marquerPartieServie({ ...state, words }, jeu, partie.id);
}

function tirerAuHasard(liste) {
  return liste[Math.floor(Math.random() * liste.length)];
}

/**
 * Marque, dans les indices des mots d'une partie, les segments qui renvoient à
 * un mot que l'utilisateur connaît déjà (README §15.4).
 *
 * C'est ce drapeau qui permet au popover de traduction de proposer « ajouter »
 * uniquement pour un mot réellement nouveau. Les deux jeux en ont besoin : la
 * fonction vit donc ici, pas dans un écran.
 *
 * @param {object[]} mots     entités word de la partie
 * @param {object}   state
 * @param {object[]} ajoutes  mots ajoutés pendant la partie en cours
 * @returns {object[]} copies enrichies
 */
export function marquerSegmentsConnus(mots = [], state = {}, ajoutes = []) {
  const connus = new Set(Object.keys(state.words ?? {}));
  return mots.map((mot) => {
    if (!mot?.indice?.segments) return mot;
    return {
      ...mot,
      indice: {
        ...mot.indice,
        segments: mot.indice.segments.map((segment) => ({
          ...segment,
          connu: Boolean(segment.ref && connus.has(segment.ref))
                 || ajoutes.some((m) => m.en === String(segment.txt).toLowerCase()),
        })),
      },
    };
  });
}
