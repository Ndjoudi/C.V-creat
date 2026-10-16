/**
 * video-builder.js — section §10 « Vidéo » (README §2, §14).
 *
 * La vidéo joue UNE phrase, puis s'arrête. Deux jeux sur cette phrase :
 *
 *   ordre    — remettre les mots mélangés dans le bon ordre (`WordOrder`)
 *   ecriture — écrire la phrase entière (`InputAnswer`)
 *
 * Aucun micro : l'utilisateur ne parle pas, il reconstruit.
 *
 * Ce service ne joue rien et n'appelle rien : il découpe, il choisit, il suit
 * l'avancement. La lecture est au composant, la récupération est à l'API.
 *
 * Fonctions pures.
 */

import { aujourdhui } from "./leitner.js";

/** Les deux jeux, tels qu'ils apparaissent dans l'écran. */
export const MODES = ["ordre", "ecriture"];

/**
 * Marge ajoutée à la fin d'un segment, en secondes.
 *
 * Les horodatages de TED marquent le DÉBUT de chaque ligne de sous-titre. Sans
 * marge, la lecture coupe la dernière syllabe de la phrase — exactement le mot
 * qu'il faut entendre pour le réécrire.
 */
export const MARGE_FIN_S = 0.35;

/**
 * Met une conférence reçue de l'API en forme pour l'application.
 *
 * @param {object} reponse  ce que rend le contrat `transcription`
 * @returns {?object} conférence, ou null si elle est inexploitable
 */
export function normaliserVideo(reponse) {
  const phrases = (reponse?.phrases ?? []).filter((p) => p?.texte?.trim());
  // Une conférence est jouable si elle a AU MOINS une source : le mp4 quand
  // TED le sert, le flux HLS sinon (environ une conférence sur trois n'a que
  // celui-là, son mp4 rendant 403).
  const source = reponse?.video ?? reponse?.hls ?? null;
  if (!reponse?.slug || !source || !phrases.length) return null;

  return {
    slug: reponse.slug,
    titre: reponse.titre ?? reponse.slug,
    video: reponse.video ?? null,
    hls: reponse.hls ?? null,
    duree: Number(reponse.duree) || null,
    source: reponse.source ?? null,
    licence: reponse.licence ?? null,
    phrases: phrases.map((p, i) => ({
      i,
      debut: Number(p.debut) || 0,
      fin: Number(p.fin) || Number(p.debut) || 0,
      texte: String(p.texte).replace(/\s+/g, " ").trim(),
    })),
  };
}

/**
 * Indices des phrases déjà réussies sur une conférence.
 *
 * @param {object} state
 * @param {string} slug
 * @returns {number[]}
 */
export function phrasesFaites(state, slug) {
  const suivi = state?.progression?.phrases_video ?? {};
  return Array.isArray(suivi[slug]) ? suivi[slug] : [];
}

/**
 * Première phrase non encore réussie, ou la première si tout est fait.
 *
 * On ne saute pas les phrases ratées : une phrase n'est marquée que lorsqu'elle
 * est juste, donc elle revient tant qu'elle résiste.
 *
 * @param {object} video
 * @param {object} state
 * @returns {number}
 */
export function phraseCourante(video, state, ignorer = []) {
  const faites = new Set(phrasesFaites(state, video?.slug));
  const mises = new Set(ignorer);
  const phrases = video?.phrases ?? [];

  // D'abord ce qui reste vraiment à faire.
  const suivante = phrases.find((p) => !faites.has(p.i) && !mises.has(p.i));
  if (suivante) return suivante.i;

  // Puis, si tout le reste a été passé dans la séance, on les redonne plutôt
  // que de bloquer sur un écran vide.
  const passee = phrases.find((p) => !faites.has(p.i));
  return passee ? passee.i : 0;
}

/**
 * Avancement sur une conférence, pour la barre segmentée de l'écran.
 *
 * @param {object} video
 * @param {object} state
 * @returns {{faites:number[], total:number, part:number, termine:boolean}}
 */
export function avancement(video, state) {
  const total = (video?.phrases ?? []).length;
  const faites = phrasesFaites(state, video?.slug).filter((i) => i < total);
  return {
    faites,
    total,
    part: total ? faites.length / total : 0,
    termine: total > 0 && faites.length >= total,
  };
}

/**
 * Jetons mélangés d'une phrase, pour la remise en ordre.
 *
 * La ponctuation reste collée à son mot : « stress? » est un jeton. C'est ce
 * que fait le jeu dont l'utilisateur est parti, et `estCorrect` normalise la
 * ponctuation de toute façon.
 *
 * Un mélange qui rendrait l'ordre d'origine est rejoué : proposer la phrase
 * déjà dans l'ordre supprime l'exercice.
 *
 * @param {string} texte
 * @param {Function} melanger  injectable pour les tests
 * @returns {string[]}
 */
export function jetonsMelanges(texte, melanger = melangerParDefaut) {
  const jetons = String(texte ?? "").trim().split(/\s+/).filter(Boolean);
  if (jetons.length < 3) return jetons;

  for (let essai = 0; essai < 8; essai += 1) {
    const propose = melanger(jetons);
    if (propose.join(" ") !== jetons.join(" ")) return propose;
  }
  // Mélange impossible à distinguer (mots identiques) : on rend tel quel.
  return jetons;
}

/**
 * Compose l'exercice de la phrase courante.
 *
 * @param {object} options
 * @param {object} options.video
 * @param {object} options.state
 * @param {string} options.mode      "ordre" ou "ecriture"
 * @param {Function} options.melanger
 * @param {number[]} options.ignorer   phrases passées pendant la séance
 * @returns {{verrouille:boolean, raison:?string, exercice:?object}}
 */
export function composerPhrase({ video, state, mode = "ordre",
                                 melanger = melangerParDefaut, ignorer = [] } = {}) {
  if (!video?.phrases?.length) {
    return { verrouille: true, raison: "Aucune conférence chargée.", exercice: null };
  }

  const rang = phraseCourante(video, state, ignorer);
  const phrase = video.phrases[rang];

  return {
    verrouille: false,
    raison: null,
    exercice: {
      mode,
      rang,
      phrase,
      debut: phrase.debut,
      // La marge évite de couper la dernière syllabe (voir MARGE_FIN_S).
      fin: phrase.fin + MARGE_FIN_S,
      attendu: phrase.texte,
      tokens: mode === "ordre" ? jetonsMelanges(phrase.texte, melanger) : [],
    },
  };
}

/**
 * Enregistre le résultat d'une phrase.
 *
 * Seule une réussite marque la phrase : un échec la laisse à refaire, sans
 * aucune pénalité. Rien ici ne touche au Leitner — les mots d'une conférence
 * TED sortent largement des 1000 du catalogue, les compter fausserait les
 * boîtes.
 *
 * @param {object} options
 * @param {object} options.state
 * @param {string} options.slug
 * @param {number} options.rang
 * @param {boolean} options.correct
 * @param {string} options.today
 * @returns {object} nouvel état
 */
export function appliquerPhrase({ state, slug, rang, correct,
                                  today = aujourdhui() } = {}) {
  if (!slug || !Number.isInteger(rang)) return state;

  const suivi = state?.progression?.phrases_video ?? {};
  const faites = Array.isArray(suivi[slug]) ? suivi[slug] : [];
  const ajout = correct && !faites.includes(rang) ? [...faites, rang].sort((a, b) => a - b) : faites;

  return {
    ...state,
    progression: {
      ...state.progression,
      phrases_video: { ...suivi, [slug]: ajout },
      derniere_session: today,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Quizz de fin de conférence (§10)                                            */
/* -------------------------------------------------------------------------- */

/**
 * Part de la conférence à avoir vue pour que le quizz s'ouvre.
 *
 * Pas 100 % : le générique de fin et les applaudissements ne sont pas du
 * contenu, et exiger la dernière milliseconde bloquerait pour rien.
 */
export const SEUIL_VU = 0.97;

/** Nombre de questions d'un quizz, et minimum de phrases pour en composer un. */
export const QUESTIONS_QUIZ = 8;
export const PHRASES_MIN_QUIZ = 12;

/** Mots trop courts ou trop communs : les masquer n'apprend rien. */
const MOTS_OUTILS = new Set([
  "the", "and", "that", "this", "with", "have", "has", "had", "for", "from",
  "was", "were", "you", "your", "they", "them", "their", "not", "but", "are",
  "our", "out", "who", "what", "when", "how", "all", "can", "will", "would",
  "about", "there", "here", "just", "some", "more", "than", "then", "into",
]);

const motsUtiles = (texte) =>
  String(texte).split(/\s+/)
    .map((m) => m.replace(/[^A-Za-z'-]/g, ""))
    .filter((m) => m.length >= 4 && !MOTS_OUTILS.has(m.toLowerCase()));

/** La conférence a-t-elle été regardée en entier ? */
export function estVue(state, slug) {
  return Boolean((state?.progression?.videos_vues ?? {})[slug]);
}

/**
 * Enregistre qu'une conférence a été vue jusqu'au bout.
 *
 * @param {object} options
 * @param {object} options.state
 * @param {string} options.slug
 * @param {number} options.position  position atteinte, en secondes
 * @param {number} options.duree
 * @param {string} options.today
 * @returns {object} nouvel état — inchangé si le seuil n'est pas atteint
 */
export function marquerVue({ state, slug, position, duree, today = aujourdhui() } = {}) {
  if (!slug || !Number.isFinite(position) || !Number.isFinite(duree) || duree <= 0) return state;
  if (position / duree < SEUIL_VU) return state;
  if (estVue(state, slug)) return state;

  return {
    ...state,
    progression: {
      ...state.progression,
      videos_vues: { ...(state?.progression?.videos_vues ?? {}), [slug]: today },
    },
  };
}

/**
 * Compose le quizz d'une conférence, **sans réseau** : tout vient de la
 * transcription déjà en mémoire.
 *
 * Deux formes, parce qu'elles testent deux choses différentes :
 *
 *   trou   — un mot de contenu est masqué dans une phrase entendue ; c'est du
 *            vocabulaire en contexte.
 *   suite  — quelle phrase suit celle-ci ; c'est le fil du discours.
 *
 * @param {object} options
 * @param {object} options.video
 * @param {object} options.state
 * @param {Function} options.melanger  injectable pour les tests
 * @returns {{verrouille:boolean, raison:?string, questions:object[]}}
 */
export function composerQuizVideo({ video, state, melanger = melangerParDefaut } = {}) {
  const phrases = video?.phrases ?? [];
  if (!estVue(state, video?.slug)) {
    return { verrouille: true, questions: [],
             raison: "Regarde la conférence en entier pour ouvrir le quizz." };
  }
  if (phrases.length < PHRASES_MIN_QUIZ) {
    return { verrouille: true, questions: [],
             raison: "Cette conférence est trop courte pour un quizz." };
  }

  // Réservoir de mots pris ailleurs dans la conférence : les mauvaises réponses
  // doivent venir du même univers, sinon la bonne saute aux yeux.
  const reservoir = [...new Set(phrases.flatMap((p) => motsUtiles(p.texte)))];

  const candidates = phrases.filter((p) => motsUtiles(p.texte).length >= 2);
  const choisies = melanger(candidates).slice(0, QUESTIONS_QUIZ);
  const questions = [];

  for (const [rang, phrase] of choisies.entries()) {
    const suivante = phrases[phrase.i + 1];

    // On alterne pour ne pas enchaîner huit fois le même exercice.
    if (rang % 2 === 1 && suivante) {
      const leurres = melanger(phrases.filter((p) => p.i !== phrase.i && p.i !== suivante.i))
        .slice(0, 3).map((p) => p.texte);
      if (leurres.length < 3) continue;
      questions.push({
        type: "suite",
        invite: phrase.texte,
        attendu: suivante.texte,
        choix: melanger([suivante.texte, ...leurres]),
      });
      continue;
    }

    const mots = motsUtiles(phrase.texte);
    const cible = melanger(mots)[0];
    const leurres = melanger(reservoir.filter((m) => m.toLowerCase() !== cible.toLowerCase()))
      .slice(0, 3);
    if (leurres.length < 3) continue;
    questions.push({
      type: "trou",
      invite: phrase.texte.replace(new RegExp(`\\b${cible}\\b`), "……"),
      attendu: cible,
      choix: melanger([cible, ...leurres]),
    });
  }

  return { verrouille: false, raison: null, questions };
}

function melangerParDefaut(liste) {
  const copie = [...liste];
  for (let i = copie.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}
