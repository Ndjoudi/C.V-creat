/**
 * store.js — lecture/écriture de l'état, migration, export/import (README §5.4, §6).
 *
 * L'état vit en mémoire sous la forme unique décrite en §5.4, `perso` compris.
 * Il est PERSISTÉ sur deux clés, comme l'exige la §6 :
 *   wordcode_state  → v, words, verbes, progression
 *   wordcode_perso  → le tableau perso
 *
 * Le stockage est injectable : les tests travaillent sur une mémoire jetable
 * et ne touchent jamais à la progression réelle.
 */

import { aujourdhui } from "./leitner.js";

export const CLE_STATE = "wordcode_state";
export const CLE_PERSO = "wordcode_perso";

/**
 * Histoires générées par l'API (§16). Elles vivent sur leur propre clé et
 * n'entrent JAMAIS dans `/content`, qui reste figé et vérifié hors ligne.
 */
export const CLE_HISTOIRES = "wordcode_histoires";
export const CLE_VIDEOS = "wordcode_videos";

/** Version du schéma. Toute évolution incrémente ce nombre et ajoute une étape. */
export const VERSION = 4;

/** Nombre de jours entre deux rappels de sauvegarde (README §6). */
// Safari efface le stockage d'un site non ouvert depuis 7 jours : un rappel à
// 30 jours arrivait trois semaines après la perte.
export const RAPPEL_SAUVEGARDE_JOURS = 5;

/* -------------------------------------------------------------------------- */
/* État                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * État vierge, conforme au schéma §5.4.
 * @returns {object}
 */
export function etatInitial() {
  return {
    v: VERSION,
    words: {},
    verbes: {},
    progression: {
      palier_actuel: 1,
      paliers_valides: [],
      groupe_verbe_actuel: 1,
      file_decouverte: [],
      // §05 : une partie servie par un jeu n'est plus proposée par l'autre.
      parties_servies: { grille: [], croises: [] },
      histoires_lues: [],
      derniere_histoire: null,
      // §08 : phrases de dictée et de traduction déjà servies.
      dictees_faites: [],
      // §10 : phrases réussies, par conférence — { slug: [rangs] }.
      phrases_video: {},
      // §10 : conférences regardées en entier — { slug: "AAAA-MM-JJ" }. C'est
      // ce qui ouvre le quizz, indépendamment des exercices.
      videos_vues: {},
      ajouts_aujourdhui: 0,
      derniere_session: null,
      derniere_sauvegarde: null,
      objectif_quotidien: 5,
    },
    perso: [],
  };
}

/**
 * Complète un état partiel avec les valeurs par défaut, sans écraser
 * l'existant. Protège contre un fichier tronqué ou un schéma plus ancien.
 * @param {object} state
 * @returns {object}
 */
function completer(state) {
  const base = etatInitial();
  return {
    ...base,
    ...state,
    words: state?.words ?? base.words,
    verbes: state?.verbes ?? base.verbes,
    progression: completerProgression(base.progression, state?.progression),
    perso: Array.isArray(state?.perso) ? state.perso : base.perso,
  };
}

/**
 * Fusionne la progression sans perdre la structure de `parties_servies`, qui
 * est un objet imbriqué : un spread simple écraserait `{grille, croises}` par
 * un objet partiel venu d'une sauvegarde tronquée.
 * @param {object} base
 * @param {object} lue
 * @returns {object}
 */
function completerProgression(base, lue = {}) {
  const servies = lue?.parties_servies ?? {};
  return {
    ...base,
    ...lue,
    parties_servies: {
      grille: Array.isArray(servies.grille) ? servies.grille : [],
      croises: Array.isArray(servies.croises) ? servies.croises : [],
    },
    histoires_lues: Array.isArray(lue?.histoires_lues) ? lue.histoires_lues : [],
    dictees_faites: Array.isArray(lue?.dictees_faites) ? lue.dictees_faites : [],
    phrases_video: (lue?.phrases_video && typeof lue.phrases_video === "object")
      ? lue.phrases_video : {},
    videos_vues: (lue?.videos_vues && typeof lue.videos_vues === "object")
      ? lue.videos_vues : {},
  };
}

/* -------------------------------------------------------------------------- */
/* Migration                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Migrations successives, pilotées par le champ `v`. Chaque entrée fait passer
 * de la version `n` à `n + 1`.
 * @type {Object<number, function(object): object>}
 */
const MIGRATIONS = {
  /**
   * v3 → v4 (README §6.6). Le défi quotidien disparaît, les six sections le
   * remplacent. On ne jette pas la progression de l'utilisateur : les fiches de
   * mots sont conservées telles quelles, seuls les champs du défi sont retirés
   * et les statuts sont réalignés sur le nouveau vocabulaire (§6.6).
   */
  3: (state) => {
    const { defis_faits, streak, parties_jouees, ...progression } = state.progression ?? {};
    const words = {};
    for (const [id, fiche] of Object.entries(state.words ?? {})) {
      words[id] = { ...fiche, st: statutDepuisBoite(fiche) };
    }
    return {
      ...state,
      words,
      progression: {
        ...progression,
        // Les parties déjà jouées alimentaient le défi ; en v4 elles servent à
        // ne pas re-servir la même grille. Elles sont reversées côté codeword.
        parties_servies: {
          grille: Array.isArray(parties_jouees) ? [...parties_jouees] : [],
          croises: [],
        },
        histoires_lues: [],
        derniere_histoire: null,
      },
    };
  },
};

/**
 * Statut d'un mot déduit de sa boîte Leitner (README §6.6). Un mot en boîte 3
 * ou plus est « connu » : il entre dans les jeux et les histoires.
 * @param {object} fiche
 * @returns {string}
 */
export function statutDepuisBoite(fiche) {
  if (!fiche) return "nouveau";
  if (fiche.st === "suspendu") return "suspendu";
  const boite = Number(fiche.b ?? 1);
  if (boite >= 5) return "acquis";
  if (boite >= 3) return "connu";
  return "actif";
}

/**
 * Amène un état à la version courante.
 * @param {object} state
 * @returns {object}
 */
export function migrer(state) {
  let courant = completer(state);
  let version = Number(courant.v) || 0;

  while (version < VERSION) {
    const etape = MIGRATIONS[version];
    if (!etape) break;
    courant = etape(courant);
    version += 1;
  }

  return { ...courant, v: VERSION };
}

/* -------------------------------------------------------------------------- */
/* Persistance                                                                 */
/* -------------------------------------------------------------------------- */

function lireJSON(storage, cle) {
  try {
    const brut = storage.getItem(cle);
    return brut ? JSON.parse(brut) : null;
  } catch {
    return null;
  }
}

/**
 * Charge l'état depuis le stockage, en le migrant si nécessaire.
 * Un stockage illisible ou corrompu ne casse pas l'application : on repart
 * d'un état vierge.
 * @param {{storage?:Storage}} options
 * @returns {object}
 */
export function charger({ storage = localStorage } = {}) {
  const noyau = lireJSON(storage, CLE_STATE);
  const perso = lireJSON(storage, CLE_PERSO);

  return migrer({
    ...(noyau ?? {}),
    perso: Array.isArray(perso) ? perso : (noyau?.perso ?? []),
  });
}

/**
 * Écrit l'état sur les deux clés de la §6.
 * @param {object} state
 * @param {{storage?:Storage}} options
 * @returns {boolean} false si le stockage a refusé (quota, mode privé)
 */
export function sauvegarder(state, { storage = localStorage } = {}) {
  const complet = migrer(state);
  const { perso, ...noyau } = complet;

  try {
    storage.setItem(CLE_STATE, JSON.stringify(noyau));
    storage.setItem(CLE_PERSO, JSON.stringify(perso));
    return true;
  } catch {
    return false;
  }
}

/**
 * Efface la progression stockée. Utilisé par la restauration.
 * @param {{storage?:Storage}} options
 */
export function effacer({ storage = localStorage } = {}) {
  try {
    storage.removeItem(CLE_STATE);
    storage.removeItem(CLE_PERSO);
  } catch { /* rien à faire : le stockage est déjà inaccessible */ }
}

/* -------------------------------------------------------------------------- */
/* Export / import (README §6) — fonctions pures                               */
/* -------------------------------------------------------------------------- */

/**
 * Objet de sauvegarde complet, prêt à être sérialisé. Ne télécharge rien :
 * c'est l'écran Réglages qui déclenchera le téléchargement.
 * @param {object} state
 * @param {string} date
 * @returns {object}
 */
export function exporter(state, date = aujourdhui()) {
  const complet = migrer(state);
  return {
    ...complet,
    progression: { ...complet.progression, derniere_sauvegarde: date },
  };
}

/**
 * Nom de fichier imposé par la §6.
 * @param {string} date
 * @returns {string}
 */
export function nomFichierSauvegarde(date = aujourdhui()) {
  return `wordcode-backup-${date}.json`;
}

/**
 * Relit une sauvegarde. Valide le champ `v` avant tout, comme l'exige la §6.
 * Ne remplace rien elle-même : renvoie l'état reconstruit, à charge de
 * l'appelant de le sauvegarder.
 *
 * @param {string|object} donnees  JSON brut ou objet déjà parsé
 * @returns {{ok:boolean, state:?object, erreur:?string}}
 */
export function importer(donnees) {
  let objet = donnees;

  if (typeof donnees === "string") {
    try {
      objet = JSON.parse(donnees);
    } catch {
      return { ok: false, state: null, erreur: "Fichier illisible : ce n'est pas du JSON." };
    }
  }

  if (!objet || typeof objet !== "object" || Array.isArray(objet)) {
    return { ok: false, state: null, erreur: "Fichier invalide : objet attendu." };
  }

  const version = Number(objet.v);
  if (!Number.isInteger(version) || version < 1) {
    return { ok: false, state: null, erreur: "Fichier invalide : champ « v » absent ou illisible." };
  }
  if (version > VERSION) {
    return {
      ok: false,
      state: null,
      erreur: `Sauvegarde en version ${version}, l'application lit jusqu'à la version ${VERSION}.`,
    };
  }

  if (objet.words && typeof objet.words !== "object") {
    return { ok: false, state: null, erreur: "Fichier invalide : « words » corrompu." };
  }

  return { ok: true, state: migrer(objet), erreur: null };
}

/**
 * Faut-il rappeler à l'utilisateur de sauvegarder ? (README §6, tous les 30 jours)
 * Jamais sauvegardé et rien à perdre → non.
 * @param {object} state
 * @param {string} today
 * @returns {boolean}
 */
export function sauvegardeARappeler(state, today = aujourdhui()) {
  const complet = completer(state);
  const rien = Object.keys(complet.words).length === 0
    && Object.keys(complet.verbes).length === 0
    && complet.perso.length === 0;
  if (rien) return false;

  const derniere = complet.progression.derniere_sauvegarde;
  if (!derniere) return true;

  const echeance = new Date(`${derniere}T12:00:00`);
  echeance.setDate(echeance.getDate() + RAPPEL_SAUVEGARDE_JOURS);
  return aujourdhui(echeance) <= today;
}

/* -------------------------------------------------------------------------- */
/* Histoires générées (README §7, §16)                                         */
/* -------------------------------------------------------------------------- */

/**
 * Relit les histoires produites par l'API lors des jours précédents.
 * Un stockage illisible renvoie une liste vide : l'application se rabat alors
 * sur le stock hors ligne, elle ne reste jamais sans histoire.
 *
 * @param {{storage?:Storage}} options
 * @returns {object[]}
 */
export function chargerHistoiresGenerees({ storage = localStorage } = {}) {
  const lu = lireJSON(storage, CLE_HISTOIRES);
  return Array.isArray(lu) ? lu : [];
}

/**
 * Ajoute une histoire générée au stock local, sans doublon d'identifiant.
 *
 * @param {object} histoire
 * @param {{storage?:Storage}} options
 * @returns {object[]} le stock complet après ajout
 */
export function ajouterHistoireGeneree(histoire, { storage = localStorage } = {}) {
  const stock = chargerHistoiresGenerees({ storage });
  if (!histoire?.id || stock.some((h) => h.id === histoire.id)) return stock;

  const suivant = [...stock, histoire];
  try {
    storage.setItem(CLE_HISTOIRES, JSON.stringify(suivant));
  } catch {
    // Quota plein : l'histoire reste lisible pour la session en cours.
  }
  return suivant;
}

/* -------------------------------------------------------------------------- */
/* Conférences récupérées (README §10)                                         */
/* -------------------------------------------------------------------------- */

/**
 * Relit les conférences déjà récupérées.
 *
 * Elles vivent en localStorage, jamais dans /content : ce sont des données
 * tierces sous licence CC BY-NC-ND, récupérées pour un usage personnel. Le
 * contenu livré avec l'application reste figé et vérifié.
 *
 * @param {{storage?:Storage}} options
 * @returns {object[]}
 */
export function chargerVideos({ storage = localStorage } = {}) {
  const lu = lireJSON(storage, CLE_VIDEOS);
  return Array.isArray(lu) ? lu : [];
}

/**
 * Ajoute une conférence au stock local, ou remplace celle du même slug.
 *
 * Remplacer plutôt qu'ignorer : une transcription re-récupérée est la plus
 * fraîche, et l'URL du fichier vidéo de TED peut changer.
 *
 * @param {object} video
 * @param {{storage?:Storage}} options
 * @returns {object[]} le stock complet après ajout
 */
export function ajouterVideo(video, { storage = localStorage } = {}) {
  const stock = chargerVideos({ storage });
  if (!video?.slug) return stock;

  const suivant = [...stock.filter((v) => v.slug !== video.slug), video];
  try {
    storage.setItem(CLE_VIDEOS, JSON.stringify(suivant));
  } catch {
    // Quota plein : la conférence reste utilisable pour la session en cours.
  }
  return suivant;
}
