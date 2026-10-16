/**
 * writing-builder.js — section §08 « Écrire » (README §2, §14).
 *
 * Trois modes, un seul corpus.
 *
 *   dictée      — on écoute, on écrit. Une seule réponse possible, par
 *                 construction : c'est ce qui a été prononcé.
 *   traduction  — on lit le français, on écrit l'anglais, sans aide.
 *   rédaction   — texte libre sur une consigne, avec des mots imposés.
 *
 * Les deux premiers modes sont les seuls exercices de l'application où
 * l'utilisateur produit une phrase entière sans modèle sous les yeux. C'est
 * aussi le seul endroit qui travaille l'oreille.
 *
 * Fonctions pures : aucun appel réseau ici. La rédaction se contente de
 * composer la consigne, c'est l'écran qui appelle l'API (§16).
 */

import { aujourdhui, appliquerResultat, motsConnus } from "./leitner.js";
import { normaliser } from "./normalize.js";
import { MARGE_FIN_S } from "./video-builder.js";

/** Les trois modes, tels qu'ils apparaissent dans l'état et dans l'écran. */
export const MODES = ["dictee", "traduction", "redaction"];

/** Mots imposés dans une rédaction libre. Au-delà, la consigne devient un carcan. */
export const MOTS_IMPOSES = 5;

/** Il faut de quoi écrire : en dessous, la rédaction n'a pas de matière. */
export const MOTS_MIN_REDACTION = 30;

/**
 * Phrases encore disponibles pour l'écriture, au palier courant.
 *
 * Une phrase déjà faite ne revient pas tant que le stock n'est pas épuisé :
 * réécrire la même dictée deux fois de suite n'apprend rien.
 *
 * @param {object} state
 * @param {object[]} phrases  contenu de content/dictees/dictee-XX.json
 * @returns {{disponibles:object[], reinitialise:boolean}}
 */
export function phrasesDisponibles(state, phrases = []) {
  const faites = new Set(state?.progression?.dictees_faites ?? []);
  const restantes = phrases.filter((p) => !faites.has(p.id));
  return restantes.length
    ? { disponibles: restantes, reinitialise: false }
    : { disponibles: phrases, reinitialise: true };
}

/**
 * Compose un exercice d'écriture.
 *
 * @param {object} options
 * @param {object} options.state
 * @param {object[]} options.phrases
 * @param {string} options.mode      "dictee" ou "traduction"
 * @param {Function} options.tirer   injectable pour les tests
 * @returns {{verrouille:boolean, raison:?string, exercice:?object, reinitialise:boolean}}
 */
/**
 * Transforme les conférences enregistrées en phrases de dictée (§08, §10).
 *
 * L'audio humain de Tatoeba imposait un fichier par phrase, et aucun n'a
 * jamais été livré — `content/audio` n'en contient qu'un seul. La dictée était
 * donc muette. Les conférences, elles, sont déjà là : découpées en phrases,
 * horodatées, et avec leur son. On dicte sur leur segment.
 *
 * Pas de `fr` : une conférence n'est pas traduite. Ces phrases ne servent donc
 * qu'à la dictée, jamais à la traduction guidée, qui garde son corpus.
 *
 * @param {object[]} videos  conférences enregistrées
 * @returns {object[]} phrases au format attendu par `composerEcriture`
 */
export function phrasesDepuisVideos(videos = []) {
  const phrases = [];
  for (const video of videos) {
    if (!video?.slug) continue;
    for (const phrase of video.phrases ?? []) {
      if (!phrase?.texte?.trim()) continue;
      phrases.push({
        id: `${video.slug}#${phrase.i}`,
        en: phrase.texte,
        fr: [],
        titre: video.titre ?? video.slug,
        source: video.video ?? null,
        hls: video.hls ?? null,
        debut: phrase.debut,
        // Même marge qu'à l'écran vidéo, sinon la dernière syllabe est coupée.
        fin: phrase.fin + MARGE_FIN_S,
      });
    }
  }
  return phrases;
}

export function composerEcriture({ state, phrases = [], mode = "dictee",
                                   tirer = tirerAuHasard } = {}) {
  if (!phrases.length) {
    return {
      verrouille: true,
      raison: "Aucune phrase n'est encore livrée pour ton palier.",
      exercice: null,
      reinitialise: false,
    };
  }

  const { disponibles, reinitialise } = phrasesDisponibles(state, phrases);
  const phrase = tirer(disponibles);

  return {
    verrouille: false,
    raison: null,
    reinitialise,
    exercice: {
      mode,
      phrase,
      // En dictée on n'affiche rien : l'énoncé est le son. En traduction on
      // montre le français, jamais les mots anglais — c'est la demande.
      invite: mode === "dictee" ? null : phrase.fr[0],
      attendu: phrase.en,
      // Toutes les formulations anglaises que le corpus relie au même sens.
      acceptees: [phrase.en, ...(phrase.en_alt ?? [])],
    },
  };
}

/**
 * Vérifie une réponse d'écriture.
 *
 * La comparaison passe par `normaliser` (§17.4), la source unique de
 * l'application : casse, accents et ponctuation ne comptent pas. Une variante
 * reconnue est acceptée mais signalée, pour que l'utilisateur voie la
 * formulation attendue.
 *
 * @param {string} saisie
 * @param {object} exercice
 * @returns {{correct:boolean, exact:boolean, attendu:string}}
 */
export function verifierEcriture(saisie, exercice) {
  const propre = normaliser(saisie);
  const attendu = exercice?.attendu ?? "";
  if (!propre) return { correct: false, exact: false, attendu };

  const exact = propre === normaliser(attendu);
  const correct = exact
    || (exercice?.acceptees ?? []).some((v) => normaliser(v) === propre);

  return { correct, exact, attendu };
}

/**
 * Applique le résultat d'un exercice d'écriture.
 *
 * Une phrase réussie fait monter d'une boîte les mots CONNUS qu'elle contient :
 * les avoir écrits sans modèle est une preuve plus forte que de les avoir
 * reconnus. Un échec ne fait rien redescendre — en dictée, se tromper vient
 * souvent de l'oreille, pas du vocabulaire, et punir le mot serait injuste.
 *
 * @param {object} options
 * @param {object} options.state
 * @param {object} options.exercice
 * @param {boolean} options.correct
 * @param {Map<string,object>} options.catalogue
 * @param {string} options.today
 * @returns {object} nouvel état
 */
export function appliquerEcriture({ state, exercice, correct,
                                    catalogue, today = aujourdhui() } = {}) {
  if (!exercice?.phrase) return state;

  const faites = state?.progression?.dictees_faites ?? [];
  const suivant = {
    ...state,
    progression: {
      ...state.progression,
      dictees_faites: faites.includes(exercice.phrase.id)
        ? faites
        : [...faites, exercice.phrase.id],
      derniere_session: today,
    },
  };
  if (!correct) return suivant;

  const connus = new Set(motsConnus(state));
  const parEn = new Map();
  for (const mot of catalogue?.values() ?? []) if (!parEn.has(mot.en)) parEn.set(mot.en, mot.id);

  const words = { ...suivant.words };
  for (const id of idsDeLaPhrase(exercice.phrase.en, parEn)) {
    if (!connus.has(id)) continue;
    words[id] = appliquerResultat(words[id], { succes: true, date: today, statut: "connu" });
  }
  return { ...suivant, words };
}

/**
 * Ids des mots du catalogue employés dans une phrase.
 * @param {string} texte
 * @param {Map<string,string>} parEn
 * @returns {string[]}
 */
export function idsDeLaPhrase(texte, parEn) {
  const ids = new Set();
  for (const jeton of String(texte).split(/\s+/)) {
    const nu = jeton.toLowerCase().replace(/[^a-z']/g, "");
    const id = nu && parEn.get(nu);
    if (id) ids.add(id);
  }
  return [...ids];
}

/* -------------------------------------------------------------------------- */
/* Rédaction libre (§08, mode 3)                                               */
/* -------------------------------------------------------------------------- */

/** Consignes de rédaction. Volontairement concrètes et personnelles. */
export const CONSIGNES = [
  { id: "matin", fr: "Raconte ta matinée.", en: "Describe your morning." },
  { id: "ville", fr: "Décris la ville où tu vis.", en: "Describe the town where you live." },
  { id: "ami", fr: "Parle d'une personne que tu aimes bien.", en: "Write about a person you like." },
  { id: "journee", fr: "Qu'as-tu fait hier ?", en: "What did you do yesterday?" },
  { id: "projet", fr: "Qu'aimerais-tu faire l'an prochain ?", en: "What would you like to do next year?" },
  { id: "repas", fr: "Décris un repas que tu aimes.", en: "Describe a meal you like." },
  { id: "voyage", fr: "Raconte un voyage, vrai ou inventé.", en: "Tell the story of a trip." },
  { id: "maison", fr: "Décris la pièce où tu es.", en: "Describe the room you are in." },
];

/**
 * Compose une consigne de rédaction avec ses mots imposés.
 *
 * Les mots sont tirés parmi ceux que l'utilisateur a VALIDÉS au quizz : imposer
 * un mot qu'il n'a pas appris transformerait l'exercice en devinette.
 *
 * @param {object} options
 * @param {object} options.state
 * @param {Map<string,object>} options.catalogue
 * @param {number} options.combien
 * @param {Function} options.tirer
 * @returns {{verrouille:boolean, raison:?string, consigne:?object, mots:object[]}}
 */
export function composerRedaction({ state, catalogue, combien = MOTS_IMPOSES,
                                    tirer = tirerAuHasard } = {}) {
  const connus = motsConnus(state)
    .map((id) => catalogue?.get(id))
    .filter(Boolean);

  if (connus.length < MOTS_MIN_REDACTION) {
    return {
      verrouille: true,
      raison: `Il faut au moins ${MOTS_MIN_REDACTION} mots validés au quizz pour rédiger. `
            + `Tu en as ${connus.length}.`,
      consigne: null,
      mots: [],
    };
  }

  // Des noms, des verbes et des adjectifs : imposer des mots-outils ne
  // demanderait aucun effort.
  const utiles = connus.filter((m) => ["n", "v", "adj", "adv"].includes(m.type));
  const pioche = utiles.length >= combien ? utiles : connus;

  // On PARCOURT une copie mélangée plutôt que de retirer jusqu'à trouver du
  // neuf : un tirage qui rend deux fois le même mot ferait tourner la boucle
  // indéfiniment, et un vivier à peine plus grand que `combien` la ferait
  // tourner très longtemps.
  const restants = [...pioche];
  const mots = [];
  while (mots.length < combien && restants.length) {
    const choisi = tirer(restants);
    const rang = restants.indexOf(choisi);
    mots.push(...restants.splice(rang === -1 ? 0 : rang, 1));
  }

  return { verrouille: false, raison: null, consigne: tirer(CONSIGNES), mots };
}

/**
 * Vérifie mécaniquement qu'une rédaction emploie les mots imposés.
 *
 * Ce contrôle est local et instantané : il ne juge pas la langue, seulement la
 * consigne. La correction linguistique passe par l'API (§16) et reste
 * facultative — hors ligne, l'exercice garde du sens.
 *
 * @param {string} texte
 * @param {object[]} mots
 * @returns {{employes:string[], manquants:string[], nbMots:number}}
 */
export function verifierRedaction(texte, mots = []) {
  const jetons = new Set(
    String(texte).toLowerCase().split(/\s+/).map((j) => j.replace(/[^a-z']/g, "")).filter(Boolean));

  const employes = [];
  const manquants = [];
  for (const mot of mots) {
    const base = String(mot.en).toLowerCase();
    const present = jetons.has(base)
      || [...jetons].some((j) => j.startsWith(base) && j.length - base.length <= 3);
    (present ? employes : manquants).push(mot.en);
  }

  return {
    employes,
    manquants,
    nbMots: String(texte).trim() ? String(texte).trim().split(/\s+/).length : 0,
  };
}

function tirerAuHasard(liste) {
  return liste[Math.floor(Math.random() * liste.length)];
}
