/**
 * api.js — UNIQUE point d'appel réseau de l'application (README §14, §15.7).
 *
 * Tout le reste est local. La clé Gemini n'est jamais ici : elle vit dans les
 * variables d'environnement Vercel, derrière `api/translate.js`.
 */

/**
 * Adresse de la fonction serverless.
 *
 * L'application est servie par GitHub Pages, qui ne sait qu'envoyer des
 * fichiers : elle n'exécute jamais `api/translate.js`. L'appel part donc vers
 * Vercel, en ABSOLU. La fonction renvoie `Access-Control-Allow-Origin: *` et
 * répond aux requêtes OPTIONS, le CORS est donc déjà couvert.
 *
 * ►► SEULE LIGNE À CHANGER après le déploiement Vercel : remplace l'hôte par
 *    celui que Vercel t'attribue.
 */
export const ENDPOINT = "https://word-code.vercel.app/api/translate";

/** Hôte témoin : tant qu'il est là, le déploiement n'a pas été fait. */
const HOTE_PAR_DEFAUT = "wordcode-api.vercel.app";

/** Le point d'appel a-t-il été configuré pour un vrai déploiement ? */
export function estConfigure(endpoint = ENDPOINT) {
  return !String(endpoint).includes(HOTE_PAR_DEFAUT);
}

/** Au-delà, on n'appelle pas : la fonction répond 400 (cf. api/translate.js). */
export const LONGUEUR_MAX = 400;

/** Un appel Gemini + sa rétro-traduction prennent quelques secondes. */
export const TIMEOUT_MS = 20000;

/** Rédiger une page prend plus longtemps que traduire une phrase (§16). */
export const TIMEOUT_HISTOIRE_MS = 45000;

/** Une rédaction dépasse de loin la longueur d'une phrase à traduire. */
export const LONGUEUR_MAX_REDACTION = 3000;

/** Bornes d'une histoire du jour, imposées par la §6.5. */
// Mesuré en production : le modèle rend 244, 248, 256, 267 mots pour une page
// demandée, donc une distribution centrée sur ~254. Refuser 244 pour exiger 250
// jetait des histoires parfaitement lisibles derrière un message d'erreur
// générique. On demande toujours 250–350 au modèle, on tolère à partir de 220.
export const HISTOIRE_MOTS_MIN = 220;
export const HISTOIRE_MOTS_MAX = 350;

/** En dessous, une génération n'a aucune chance de tenir la contrainte §6.5. */
export const MOTS_MIN_POUR_HISTOIRE = 40;

/**
 * Motifs d'échec, pour que l'écran choisisse son message sans analyser du texte.
 * @readonly
 */
export const CAUSES = {
  VIDE: "vide",
  TROP_LONG: "trop-long",
  HORS_LIGNE: "hors-ligne",
  TIMEOUT: "timeout",
  INDISPONIBLE: "indisponible",
  RESEAU: "reseau",
  REPONSE: "reponse",
  NON_CONFIGURE: "non-configure",
  LEXIQUE_TROP_MAIGRE: "lexique-trop-maigre",
};

const MESSAGES = {
  [CAUSES.VIDE]: "Écris d'abord une phrase ou un mot.",
  [CAUSES.TROP_LONG]: `Phrase trop longue : ${LONGUEUR_MAX} caractères au maximum.`,
  [CAUSES.HORS_LIGNE]: "Hors ligne. La traduction est la seule fonction qui a besoin du réseau.",
  [CAUSES.TIMEOUT]: "La traduction n'a pas répondu à temps. Réessaie.",
  [CAUSES.INDISPONIBLE]: "Le service de traduction est momentanément indisponible.",
  [CAUSES.RESEAU]: "Impossible de joindre le service de traduction.",
  [CAUSES.REPONSE]: "Réponse inattendue du service de traduction.",
  [CAUSES.NON_CONFIGURE]:
    "Le service de traduction n'est pas encore déployé. Renseigne ENDPOINT dans services/api.js.",
  [CAUSES.LEXIQUE_TROP_MAIGRE]:
    `Il faut connaître au moins ${MOTS_MIN_POUR_HISTOIRE} mots pour qu'une histoire tienne debout.`,
};

const echec = (cause) => ({ ok: false, donnees: null, cause, erreur: MESSAGES[cause] });

/**
 * Traduit une phrase entière — jamais un mot isolé : c'est le contexte qui
 * donne le bon sens (README §14, garde-fou n°1).
 *
 * Ne lève jamais : renvoie toujours un verdict exploitable.
 *
 * @param {string} texte
 * @param {object} options
 * @param {string} options.endpoint
 * @param {number} options.timeout
 * @param {Function} options.recuperer  implémentation de fetch, injectable
 * @param {boolean} options.enLigne     état réseau, injectable pour les tests
 * @returns {Promise<{ok:boolean, donnees:?object, cause:?string, erreur:?string}>}
 */
export async function traduire(texte, { endpoint = ENDPOINT, timeout = TIMEOUT_MS,
                                        recuperer = globalThis.fetch,
                                        enLigne = globalThis.navigator?.onLine ?? true } = {}) {
  const propre = String(texte ?? "").trim();
  if (!propre) return echec(CAUSES.VIDE);
  if (propre.length > LONGUEUR_MAX) return echec(CAUSES.TROP_LONG);
  if (!enLigne) return echec(CAUSES.HORS_LIGNE);

  // Message franc plutôt qu'un « réponse inattendue » incompréhensible tant
  // que l'adresse de la fonction n'a pas été renseignée.
  if (!estConfigure(endpoint)) return echec(CAUSES.NON_CONFIGURE);

  const arret = new AbortController();
  const minuteur = setTimeout(() => arret.abort(), timeout);

  let reponse;
  try {
    reponse = await recuperer(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texte: propre }),
      signal: arret.signal,
    });
  } catch (e) {
    clearTimeout(minuteur);
    return echec(e?.name === "AbortError" ? CAUSES.TIMEOUT : CAUSES.RESEAU);
  }
  clearTimeout(minuteur);

  // 502 : Gemini a échoué côté serveur. 400 : la requête était déjà mauvaise.
  if (reponse.status === 502) return echec(CAUSES.INDISPONIBLE);
  if (!reponse.ok) return echec(CAUSES.REPONSE);

  let donnees;
  try {
    donnees = await reponse.json();
  } catch {
    return echec(CAUSES.REPONSE);
  }

  if (!donnees || typeof donnees !== "object" || !Array.isArray(donnees.mots)) {
    return echec(CAUSES.REPONSE);
  }

  return { ok: true, donnees, cause: null, erreur: null };
}

/**
 * Demande la génération d'une histoire du jour (README §16, §6.5).
 *
 * Secours, jamais la voie normale : `storyBuilder` n'y recourt que si aucun
 * texte du stock hors ligne n'atteint 95% de couverture. L'histoire reçue est
 * enregistrée côté client avec `source: "api"` — elle n'est **jamais** écrite
 * dans `/content`, qui reste figé et vérifié hors ligne.
 *
 * Ne lève jamais : renvoie toujours un verdict exploitable.
 *
 * @param {object}   options
 * @param {string[]} options.mots      formes anglaises que le texte peut employer
 * @param {?object}  options.arc       { id, resume_en } pour une continuation
 * @param {number}   options.longueur
 * @returns {Promise<{ok:boolean, donnees:?object, cause:?string, erreur:?string}>}
 */
export async function genererHistoire({ mots = [], arc = null, longueur = 300,
                                        endpoint = ENDPOINT,
                                        timeout = TIMEOUT_HISTOIRE_MS,
                                        recuperer = globalThis.fetch,
                                        enLigne = globalThis.navigator?.onLine ?? true } = {}) {
  const lexique = [...new Set(mots.map((m) => String(m).trim().toLowerCase()).filter(Boolean))];
  if (lexique.length < MOTS_MIN_POUR_HISTOIRE) return echec(CAUSES.LEXIQUE_TROP_MAIGRE);
  if (!enLigne) return echec(CAUSES.HORS_LIGNE);
  if (!estConfigure(endpoint)) return echec(CAUSES.NON_CONFIGURE);

  const arret = new AbortController();
  const minuteur = setTimeout(() => arret.abort(), timeout);

  let reponse;
  try {
    reponse = await recuperer(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "histoire", mots: lexique, arc, longueur }),
      signal: arret.signal,
    });
  } catch (e) {
    clearTimeout(minuteur);
    return echec(e?.name === "AbortError" ? CAUSES.TIMEOUT : CAUSES.RESEAU);
  }
  clearTimeout(minuteur);

  let donnees;
  try {
    donnees = await reponse.json();
  } catch {
    return echec(reponse.status === 502 ? CAUSES.INDISPONIBLE : CAUSES.REPONSE);
  }

  // Un 502 porte le motif exact de la panne. Le masquer derrière « service
  // indisponible » a déjà coûté une séance de diagnostic à l'aveugle : on lit
  // le corps AVANT de décider, et on montre ce que le serveur a dit.
  if (reponse.status === 502) {
    return donnees?.error
      ? { ok: false, donnees: null, cause: CAUSES.INDISPONIBLE,
          erreur: `Génération impossible : ${donnees.error}` }
      : echec(CAUSES.INDISPONIBLE);
  }
  if (!reponse.ok) return echec(CAUSES.REPONSE);

  // On ne fait confiance à rien : un texte hors bornes ou vide est refusé ici
  // plutôt que servi tel quel à la lecture.
  const texte = String(donnees?.texte_en ?? "").trim();
  const nb = texte ? texte.split(/\s+/).length : 0;
  if (!texte || nb < HISTOIRE_MOTS_MIN || nb > HISTOIRE_MOTS_MAX) {
    return echec(CAUSES.REPONSE);
  }

  return { ok: true, cause: null, erreur: null, donnees: { ...donnees, texte_en: texte, nb_mots: nb } };
}

/**
 * Demande la correction d'une rédaction libre (README §16, §08).
 *
 * Facultatif : la vérification des mots imposés se fait en local et suffit à
 * travailler hors ligne. Cet appel n'apporte que le regard sur la langue.
 *
 * On ne renvoie jamais un verdict chiffré : une rédaction ne se note pas en
 * boîtes Leitner. Le service rend un texte corrigé et une liste de remarques.
 *
 * @param {object}   options
 * @param {string}   options.texte     ce que l'utilisateur a écrit
 * @param {string}   options.consigne  l'énoncé, pour le contexte
 * @param {string[]} options.mots      les mots imposés
 * @returns {Promise<{ok:boolean, donnees:?object, cause:?string, erreur:?string}>}
 */
export async function corrigerRedaction({ texte, consigne = "", mots = [],
                                          endpoint = ENDPOINT, timeout = TIMEOUT_MS,
                                          recuperer = globalThis.fetch,
                                          enLigne = globalThis.navigator?.onLine ?? true } = {}) {
  const propre = String(texte ?? "").trim();
  if (!propre) return echec(CAUSES.VIDE);
  if (propre.length > LONGUEUR_MAX_REDACTION) return echec(CAUSES.TROP_LONG);
  if (!enLigne) return echec(CAUSES.HORS_LIGNE);
  if (!estConfigure(endpoint)) return echec(CAUSES.NON_CONFIGURE);

  const arret = new AbortController();
  const minuteur = setTimeout(() => arret.abort(), timeout);

  let reponse;
  try {
    reponse = await recuperer(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "redaction", texte: propre, consigne, mots }),
      signal: arret.signal,
    });
  } catch (e) {
    clearTimeout(minuteur);
    return echec(e?.name === "AbortError" ? CAUSES.TIMEOUT : CAUSES.RESEAU);
  }
  clearTimeout(minuteur);

  let donnees;
  try {
    donnees = await reponse.json();
  } catch {
    return echec(reponse.status === 502 ? CAUSES.INDISPONIBLE : CAUSES.REPONSE);
  }

  // Un 502 porte le motif exact de la panne. Le masquer derrière « service
  // indisponible » a déjà coûté une séance de diagnostic à l'aveugle : on lit
  // le corps AVANT de décider, et on montre ce que le serveur a dit.
  if (reponse.status === 502) {
    return donnees?.error
      ? { ok: false, donnees: null, cause: CAUSES.INDISPONIBLE,
          erreur: `Génération impossible : ${donnees.error}` }
      : echec(CAUSES.INDISPONIBLE);
  }
  if (!reponse.ok) return echec(CAUSES.REPONSE);

  if (!donnees?.corrige || !Array.isArray(donnees.remarques)) return echec(CAUSES.REPONSE);
  return { ok: true, donnees, cause: null, erreur: null };
}

/**
 * Récupère une conférence TED : ses phrases horodatées et son fichier vidéo
 * (README §16, §10).
 *
 * Le passage par le serveur n'est pas un choix d'architecture : ted.com
 * n'envoie aucun en-tête CORS, le navigateur ne peut pas lire la page
 * lui-même. Le fichier vidéo, lui, se lit directement — une balise <video>
 * n'a pas besoin de CORS.
 *
 * @param {object} options
 * @param {string} options.lien  adresse TED, adresse YouTube, ou slug
 * @returns {Promise<{ok:boolean, donnees:?object, cause:?string, erreur:?string}>}
 */
export async function recupererTranscription({ lien,
                                               endpoint = ENDPOINT,
                                               timeout = TIMEOUT_HISTOIRE_MS,
                                               recuperer = globalThis.fetch,
                                               enLigne = globalThis.navigator?.onLine ?? true } = {}) {
  const propre = String(lien ?? "").trim();
  if (!propre) return echec(CAUSES.VIDE);
  if (!enLigne) return echec(CAUSES.HORS_LIGNE);
  if (!estConfigure(endpoint)) return echec(CAUSES.NON_CONFIGURE);

  const arret = new AbortController();
  const minuteur = setTimeout(() => arret.abort(), timeout);

  let reponse;
  try {
    reponse = await recuperer(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "transcription", lien: propre }),
      signal: arret.signal,
    });
  } catch (e) {
    clearTimeout(minuteur);
    return echec(e?.name === "AbortError" ? CAUSES.TIMEOUT : CAUSES.RESEAU);
  }
  clearTimeout(minuteur);

  let donnees;
  try {
    donnees = await reponse.json();
  } catch {
    return echec(CAUSES.REPONSE);
  }

  // Un lien mal formé revient en 400 avec son motif : il est plus utile de le
  // montrer que de dire « service indisponible ».
  if (reponse.status === 400 && donnees?.error) {
    return { ok: false, donnees: null, cause: CAUSES.REPONSE, erreur: donnees.error };
  }
  if (reponse.status === 502) return echec(CAUSES.INDISPONIBLE);
  if (!reponse.ok) return echec(CAUSES.REPONSE);

  if (!Array.isArray(donnees?.phrases) || !donnees.phrases.length) return echec(CAUSES.REPONSE);
  return { ok: true, donnees, cause: null, erreur: null };
}
