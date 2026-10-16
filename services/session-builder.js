/**
 * session-builder.js — composition d'une session (README §3.1, §3.3, §17.8).
 *
 * Toute la logique de sélection vit ici. Les écrans se contentent d'appeler
 * ces fonctions et de passer le résultat aux organisms.
 */

import { aujourdhui, motsDus, estDue, FORMES_VERBE,
         appliquerResultatVerbe } from "./leitner.js";
import { normaliser } from "./normalize.js";


/** Nombre d'options d'un QCM d'ancrage (README §3.2). */
export const OPTIONS_QCM = 4;

/** Plafond d'ajouts organiques par partie (README §3.5). */
export const AJOUTS_MAX_PAR_PARTIE = 3;

/* -------------------------------------------------------------------------- */
/* File de découverte (README §3.1)                                            */
/* -------------------------------------------------------------------------- */

/**
 * Mots à découvrir, dans l'ordre imposé par la §3.1 :
 *   1. mots ajoutés organiquement lors des sessions précédentes
 *   2. mots saisis manuellement
 *   3. mots du palier courant
 *
 * Un mot déjà rencontré — présent dans `state.words` — n'y figure plus.
 *
 * @param {object} state
 * @param {Map<string,object>} catalogue  mots des paliers chargés
 * @returns {object[]}
 */
export function fileDecouverte(state, catalogue) {
  const connus = new Set(Object.keys(state?.words ?? {}));
  const perso = new Map((state?.perso ?? []).map((mot) => [mot.id, mot]));
  const vus = new Set();
  const file = [];

  const ajouter = (mot) => {
    if (!mot || connus.has(mot.id) || vus.has(mot.id)) return;
    vus.add(mot.id);
    file.push(mot);
  };

  // 1 et 2 — la file explicite, dans l'ordre où elle a été remplie.
  // L'organique y entre en premier : c'est un mot sur lequel l'utilisateur a
  // réellement buté pendant une grille, il passe donc en priorité (§3.1).
  const explicite = state?.progression?.file_decouverte ?? [];
  for (const id of explicite) ajouter(perso.get(id) ?? catalogue?.get(id));

  const organiques = [...perso.values()].filter((m) => m.source === "organique");
  const manuels = [...perso.values()].filter((m) => m.source === "perso");
  for (const mot of organiques) ajouter(mot);
  for (const mot of manuels) ajouter(mot);

  // 3 — les mots du palier courant, DANS L'ORDRE DU FICHIER.
  //
  // Cet ordre n'est pas celui de la fréquence : le générateur groupe les mots
  // par blocs de cinq, et chaque bloc devient une partie. Servir la découverte
  // dans cet ordre fait qu'au bout de cinq mots triés, une grille exactement
  // devient jouable. Trier par `rang_freq` disperserait les mots entre les
  // blocs et laisserait les sections §04 et §05 verrouillées très longtemps —
  // les 50 mots d'un palier sont de toute façon de même rang de fréquence.
  const palier = Number(state?.progression?.palier_actuel ?? 1);
  const duPalier = [...(catalogue?.values() ?? [])]
    .filter((mot) => Number(mot.palier) === palier);
  for (const mot of duPalier) ajouter(mot);

  return file;
}

/* -------------------------------------------------------------------------- */
/* Composition                                                                 */
/* -------------------------------------------------------------------------- */






/* -------------------------------------------------------------------------- */
/* Exercices                                                                   */
/* -------------------------------------------------------------------------- */

/** Lettres communes à deux mots, pour mesurer une proximité graphique. */
function lettresCommunes(a, b) {
  const restantes = [...String(b).toLowerCase()];
  let compte = 0;
  for (const lettre of String(a).toLowerCase()) {
    const rang = restantes.indexOf(lettre);
    if (rang !== -1) {
      restantes.splice(rang, 1);
      compte += 1;
    }
  }
  return compte;
}

/**
 * Proximité graphique entre deux mots anglais. Plus c'est haut, plus le
 * distracteur est trompeur — c'est ce que demande la §3.2 (MENU / MEAL /
 * MEET / MELT), pas des options éliminables d'un coup d'œil.
 */
export function proximite(a, b) {
  const x = String(a ?? "").toLowerCase();
  const y = String(b ?? "").toLowerCase();
  if (!x || !y || x === y) return -1;

  let score = lettresCommunes(x, y) * 2;
  if (x.length === y.length) score += 4;
  else score -= Math.abs(x.length - y.length);
  if (x[0] === y[0]) score += 3;
  if (x.at(-1) === y.at(-1)) score += 1;
  return score;
}

/**
 * QCM d'ancrage : on montre le sens français, on fait reconnaître la forme
 * anglaise parmi des distracteurs graphiquement proches (README §3.2).
 *
 * @param {object} mot
 * @param {Iterable<object>} candidats  mots disponibles pour les distracteurs
 * @param {Function} melanger           injectable, pour des tests reproductibles
 * @returns {{question:string, options:Array<{id:string,label:string}>, correctId:string}}
 */
export function construireQCM(mot, candidats = [], melanger = melangerParDefaut) {
  const distracteurs = [...candidats]
    .filter((c) => c.id !== mot.id && c.en)
    .sort((a, b) => proximite(mot.en, b.en) - proximite(mot.en, a.en))
    .slice(0, OPTIONS_QCM - 1);

  const options = melanger([mot, ...distracteurs]
    .map((c) => ({ id: c.id, label: String(c.en).toUpperCase() })));

  return { question: mot.fr, options, correctId: mot.id };
}

function melangerParDefaut(tableau) {
  const copie = [...tableau];
  for (let i = copie.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

/**
 * Exercice de rappel actif (README §3.4).
 *
 * Pour les mots `perso` et `organique`, on utilise la phrase source à trous
 * plutôt que la traduction isolée : l'ancrage épisodique vaut mieux.
 *
 * @param {object} mot
 * @returns {{type:string, mot:object, prompt?:string, expected:string,
 *            sentence?:string, blankIndex?:number, translation?:string}}
 */
export function construireRappel(mot) {
  const contextuel = (mot.source === "perso" || mot.source === "organique")
    && typeof mot.phrase_en === "string" && mot.phrase_en.trim().length > 0;

  if (contextuel) {
    const mots = mot.phrase_en.trim().split(/\s+/);
    const cible = String(mot.en).toLowerCase();
    const rang = mots.findIndex((m) => m.toLowerCase().replace(/[^a-z']/g, "") === cible);
    return {
      type: "cloze",
      mot,
      sentence: mot.phrase_en.trim(),
      blankIndex: rang === -1 ? 0 : rang,
      expected: mot.en,
      translation: mot.phrase_fr ?? mot.fr,
    };
  }

  return { type: "input", mot, prompt: mot.fr, expected: mot.en };
}

/* -------------------------------------------------------------------------- */
/* Filière verbes irréguliers (README §2.2, §3.6, §4)                          */
/* -------------------------------------------------------------------------- */

/** Les quatre familles de patterns de la §2.2, dans l'ordre d'apprentissage. */
export const GROUPES_VERBE = {
  1: { code: "G1", titre: "Invariables", pattern: "A-A-A" },
  2: { code: "G2", titre: "En -ought / -aught", pattern: "" },
  3: { code: "G3", titre: "Deux formes identiques", pattern: "A-B-B" },
  4: { code: "G4", titre: "Trois formes différentes", pattern: "A-B-C" },
};

/**
 * Seuil de passage au groupe suivant. Le README ne le fixe que pour les
 * paliers (§2.1, 80 % en boîte 3+) ; on applique la même règle aux groupes de
 * verbes, en comptant les DEUX formes séparément.
 */
export const SEUIL_GROUPE = 0.8;

/**
 * Composition d'une session de verbes.
 *
 * L'ordre est celui des patterns, jamais l'alphabet (§2.2) : on reste dans le
 * groupe courant. Les formes dues passent avant les verbes jamais vus, et un
 * verbe n'apparaît qu'une fois dans la file même si ses deux formes sont dues
 * — c'est `VerbTriad` qui les redemande toutes les deux.
 *
 * @param {object} options
 * @param {object} options.state
 * @param {object[]} options.verbes  catalogue complet de la filière
 * @param {string} options.today
 * @returns {{groupe:number, file:object[], nouveaux:object[], dus:object[],
 *            duGroupe:object[], vide:boolean}}
 */
export function composerSessionVerbes({ state, verbes = [], today = aujourdhui() } = {}) {
  const groupe = Number(state?.progression?.groupe_verbe_actuel ?? 1);
  const duGroupe = verbes.filter((v) => Number(v.groupe_verbe) === groupe);
  const fiches = state?.verbes ?? {};

  const dus = duGroupe.filter((verbe) => {
    const formes = fiches[verbe.id];
    if (!formes) return false;
    return FORMES_VERBE.some((forme) => estDue(formes[forme], today));
  });

  const nouveaux = duGroupe.filter((verbe) => !fiches[verbe.id]);

  return {
    groupe,
    duGroupe,
    dus,
    nouveaux,
    file: [...dus, ...nouveaux],
    vide: dus.length === 0 && nouveaux.length === 0,
  };
}

/**
 * Enregistre le résultat d'un `VerbTriad`. Les deux formes montent ou
 * redescendent indépendamment (README §4).
 *
 * @param {object} state
 * @param {string} id
 * @param {{preteritCorrect:boolean, participeCorrect:boolean, date?:string}} verdict
 * @returns {object} nouvel état
 */
export function appliquerVerbe(state, id, { preteritCorrect, participeCorrect,
                                            date = aujourdhui() } = {}) {
  const formes = state?.verbes?.[id] ?? {};
  return {
    ...state,
    verbes: {
      ...state.verbes,
      [id]: {
        preterit: appliquerResultatVerbe(formes.preterit, { succes: preteritCorrect, date }),
        participe: appliquerResultatVerbe(formes.participe, { succes: participeCorrect, date }),
      },
    },
  };
}

/**
 * Avancement du groupe courant : part des formes en boîte 3 ou plus.
 *
 * `depasse` dit qu'on peut passer au groupe suivant : soit le seuil est
 * atteint, soit le groupe ne contient aucun verbe — sans quoi un groupe vide
 * bloquerait définitivement la progression.
 *
 * @param {object} state
 * @param {object[]} duGroupe
 * @returns {{formes:number, acquises:number, part:number,
 *            termine:boolean, depasse:boolean}}
 */
export function avancementGroupe(state, duGroupe = []) {
  const fiches = state?.verbes ?? {};
  const formes = duGroupe.length * FORMES_VERBE.length;
  let acquises = 0;

  for (const verbe of duGroupe) {
    for (const forme of FORMES_VERBE) {
      if (Number(fiches[verbe.id]?.[forme]?.b ?? 0) >= 3) acquises += 1;
    }
  }

  const part = formes ? acquises / formes : 0;
  const termine = formes > 0 && part >= SEUIL_GROUPE;
  return { formes, acquises, part, termine, depasse: termine || formes === 0 };
}

/**
 * Passe au groupe de patterns suivant, s'il en reste un.
 * @param {object} state
 * @returns {object} nouvel état
 */
export function avancerGroupe(state) {
  const courant = Number(state?.progression?.groupe_verbe_actuel ?? 1);
  const suivant = Math.min(courant + 1, Object.keys(GROUPES_VERBE).length);
  if (suivant === courant) return state;
  return {
    ...state,
    progression: { ...state.progression, groupe_verbe_actuel: suivant },
  };
}

/* -------------------------------------------------------------------------- */
/* Paliers (README §2.1)                                                       */
/* -------------------------------------------------------------------------- */

/** Boîte à partir de laquelle un mot compte comme acquis pour un palier (§2.1). */
export const BOITE_ACQUISE = 3;

/** « Déblocage de palier : 80 % des mots en boîte 3+, pas la complétion » (§2.1). */
export const SEUIL_PALIER = 0.8;

/**
 * Avancement d'un palier, en DEUX chiffres calculés d'un seul tenant.
 *
 *   `vus`    — mots déjà rencontrés. C'est ce qui bouge à chaque session, donc
 *              ce que l'utilisateur doit voir avancer.
 *   `acquis` — mots en boîte 3 ou plus. C'est le seuil de déblocage (§2.1),
 *              mais il ne peut pas bouger avant deux jours : une boîte 3
 *              demande deux réussites à des dates différentes. L'afficher seul
 *              donne une barre figée à zéro après une session parfaite.
 *
 * Ne peut se calculer que pour un palier CHARGÉ : les mots d'un palier
 * verrouillé ne sont pas en mémoire (chargement paresseux, §6).
 *
 * @param {object} state
 * @param {Map<string,object>} catalogue
 * @param {number} palierId
 * @returns {{mots:number, vus:number, acquis:number, seuil:number,
 *            part:number, partVus:number, atteint:boolean, charge:boolean}}
 */
export function avancementPalier(state, catalogue, palierId) {
  const mots = [...(catalogue?.values() ?? [])]
    .filter((mot) => Number(mot.palier) === Number(palierId));

  if (!mots.length) {
    return { mots: 0, vus: 0, acquis: 0, seuil: 0,
             part: 0, partVus: 0, atteint: false, charge: false };
  }

  const fiches = state?.words ?? {};
  const vus = mots.filter((mot) => Boolean(fiches[mot.id])).length;
  const acquis = mots.filter(
    (mot) => Number(fiches[mot.id]?.b ?? 0) >= BOITE_ACQUISE).length;
  const part = acquis / mots.length;

  return {
    mots: mots.length,
    vus,
    acquis,
    seuil: Math.ceil(mots.length * SEUIL_PALIER),
    part,
    partVus: vus / mots.length,
    atteint: part >= SEUIL_PALIER,
    charge: true,
  };
}

/**
 * Applique la règle de déblocage de la §2.1 : quand 80 % des mots du palier
 * courant sont en boîte 3+, le palier est validé et le suivant s'ouvre.
 *
 * @param {object} state
 * @param {Map<string,object>} catalogue
 * @param {object} manifeste
 * @returns {object} nouvel état
 */
export function debloquerPaliers(state, catalogue, manifeste) {
  const courant = Number(state?.progression?.palier_actuel ?? 1);
  if (!avancementPalier(state, catalogue, courant).atteint) return state;

  const ids = (manifeste?.paliers ?? []).map((p) => Number(p.id)).sort((a, b) => a - b);
  const suivant = ids.find((id) => id > courant);

  const valides = state.progression?.paliers_valides ?? [];
  const nouveauxValides = valides.includes(courant) ? valides : [...valides, courant];

  return {
    ...state,
    progression: {
      ...state.progression,
      paliers_valides: nouveauxValides,
      palier_actuel: suivant ?? courant,
    },
  };
}

/**
 * Entrées de palier prêtes à afficher, pour TOUS les écrans.
 *
 * Source unique : sans elle, chaque écran recalculait l'avancement à sa façon
 * et affichait un chiffre différent pour la même chose.
 *
 * @param {object} state
 * @param {Map<string,object>} catalogue
 * @param {object} manifeste
 * @returns {object[]} entrées du manifeste enrichies de `valide` et `avancement`
 */
export function entreesPaliers(state, catalogue, manifeste) {
  const valides = new Set(state?.progression?.paliers_valides ?? []);
  return (manifeste?.paliers ?? []).map((palier) => ({
    ...palier,
    valide: valides.has(Number(palier.id)),
    avancement: avancementPalier(state, catalogue, palier.id),
  }));
}

/**
 * Choix explicite d'un palier par l'utilisateur.
 *
 * La §2.1 décrit le déblocage AUTOMATIQUE ; elle n'interdit pas de choisir
 * soi-même. Les paliers déjà validés restent validés : revenir en arrière ne
 * dévalide rien.
 *
 * @param {object} state
 * @param {number} palierId
 * @returns {object} nouvel état
 */
export function choisirPalier(state, palierId) {
  const id = Number(palierId);
  if (!Number.isInteger(id) || id < 1) return state;
  if (Number(state?.progression?.palier_actuel) === id) return state;
  return {
    ...state,
    progression: { ...state.progression, palier_actuel: id },
  };
}

/* -------------------------------------------------------------------------- */
/* Filière phrasal verbs (README §3.3)                                         */
/* -------------------------------------------------------------------------- */

/** Les trois modes de la §3.3, dans l'ordre où ils sont cités. */
export const MODES_PHRASAL = ["cle", "ordre", "particule"];

/** Particules de repli, quand le catalogue n'offre pas assez de voisins. */
const PARTICULES_COURANTES = ["up", "out", "on", "off", "in", "over", "through", "away", "back", "down"];

/**
 * Compose une session de phrasal verbs : les dus d'abord, puis les inconnus.
 *
 * Ils passent par le MÊME moteur Leitner que le reste (§5) — leur fiche vit
 * dans `state.words`, comme n'importe quel mot.
 *
 * @param {object} options
 * @param {object} options.state
 * @param {object[]} options.phrasal
 * @param {string} options.today
 * @returns {{file:object[], dus:object[], nouveaux:object[], vide:boolean}}
 */
export function composerSessionPhrasal({ state, phrasal = [], today = aujourdhui() } = {}) {
  const fiches = state?.words ?? {};
  const dusIds = new Set(motsDus(state, today).map((entree) => entree.id));

  const dus = phrasal.filter((mot) => dusIds.has(mot.id));
  const nouveaux = phrasal.filter((mot) => !fiches[mot.id]);

  return { file: [...dus, ...nouveaux], dus, nouveaux, vide: !dus.length && !nouveaux.length };
}

/**
 * Mode d'exercice pour un phrasal donné.
 *
 * Les trois modes tournent selon le rang dans la file, pour qu'une session les
 * exerce tous. Le README ne fixe pas d'ordre de difficulté : on n'en invente
 * pas, on alterne.
 *
 * @param {number} rang
 * @returns {string}
 */
export function modePhrasal(rang) {
  return MODES_PHRASAL[rang % MODES_PHRASAL.length];
}

/**
 * Construit l'exercice d'un phrasal verb (README §3.3).
 *
 * Jamais de rappel actif « tape l'expression entière » : trop punitif sur
 * quatre mots. Les trois modes sont :
 *   - `cle`       : le verbe de base est masqué dans la phrase → `ClozeInput`
 *   - `ordre`     : remise en ordre de l'expression → `WordOrder`
 *   - `particule` : discrimination de particule → `MCQ`
 *
 * @param {object} mot
 * @param {object[]} catalogue  les autres phrasal, pour les distracteurs
 * @param {string} mode
 * @param {Function} melanger   injectable, pour des tests reproductibles
 * @returns {object} descripteur d'exercice
 */
export function construireExercicePhrasal(mot, catalogue = [], mode = "particule",
                                          melanger = melangerParDefaut) {
  const phrase = String(mot.exemple_en ?? mot.en);
  const mots = phrase.trim().split(/\s+/);
  const sansPonctuation = (m) => m.toLowerCase().replace(/[^a-z']/g, "");

  if (mode === "cle") {
    // Le mot-clé, c'est le verbe de base : c'est lui qui porte le sens.
    // Il est souvent conjugué dans l'exemple — « He got over » pour `get` —
    // donc la comparaison directe échoue. On se rabat alors sur la position :
    // dans un phrasal, le verbe précède immédiatement la particule.
    const exact = mots.findIndex(
      (m) => sansPonctuation(m) === String(mot.verbe_base).toLowerCase());
    const rangParticule = mots.findIndex(
      (m) => sansPonctuation(m) === String(mot.particule).toLowerCase());

    const rang = exact !== -1 ? exact
      : (rangParticule > 0 ? rangParticule - 1 : 0);

    return {
      type: "cloze", mode, mot,
      sentence: phrase,
      blankIndex: rang,
      // La forme attendue est celle qui figure dans la phrase : exiger
      // l'infinitif quand la phrase est au prétérit serait un piège.
      expected: sansPonctuation(mots[rang] ?? mot.verbe_base),
      translation: mot.exemple_fr ?? mot.fr,
    };
  }

  if (mode === "ordre") {
    const jetons = String(mot.en).trim().split(/\s+/);
    return {
      type: "ordre", mode, mot,
      tokens: melanger(jetons),
      expected: mot.en,
      prompt: mot.fr,
    };
  }

  // Discrimination de particule : les distracteurs viennent des phrasal qui
  // partagent le même verbe de base — get up / over / through / out (§3.3).
  const voisines = catalogue
    .filter((autre) => autre.id !== mot.id
                    && String(autre.verbe_base).toLowerCase() === String(mot.verbe_base).toLowerCase())
    .map((autre) => autre.particule);

  const distracteurs = [...new Set([...voisines, ...PARTICULES_COURANTES])]
    .filter((p) => p && p.toLowerCase() !== String(mot.particule).toLowerCase())
    .slice(0, 3);

  const options = melanger([mot.particule, ...distracteurs]
    .map((particule) => ({ id: particule, label: particule })));

  const rangParticule = mots.findIndex(
    (m) => sansPonctuation(m) === String(mot.particule).toLowerCase());

  return {
    type: "mcq", mode, mot,
    question: mot.exemple_fr ?? mot.fr,
    phrase: mots.map((m, i) => (i === rangParticule ? "_____" : m)).join(" "),
    options,
    correctId: mot.particule,
  };
}

/* -------------------------------------------------------------------------- */
/* Capture manuelle (README §2.5, §5.2, §14)                                   */
/* -------------------------------------------------------------------------- */

/** Taille d'un palier de fréquence (README §2.1). */
export const MOTS_PAR_PALIER = 50;

/** NGSL : 2800 mots, soit 56 paliers. */
export const PALIER_MAX = 56;

/**
 * Écart de paliers à partir duquel on prévient l'utilisateur qu'un mot est
 * très au-dessus de son niveau (README §14). Un seul palier d'avance est
 * banal ; deux méritent un mot.
 */
export const ECART_PALIER_ALERTE = 2;

/**
 * Palier de fréquence correspondant à un rang NGSL.
 * @param {?number} rang
 * @returns {?number}
 */
export function palierPourRang(rang) {
  const valeur = Number(rang);
  if (!Number.isFinite(valeur) || valeur < 1) return null;
  return Math.min(Math.ceil(valeur / MOTS_PAR_PALIER), PALIER_MAX);
}

/**
 * Cherche une entrée existante pour un mot anglais, au catalogue comme dans
 * les mots perso. Sert la détection de polysémie de la §5.2.
 *
 * @param {string} en
 * @param {{catalogue?:Map<string,object>, perso?:object[]}} sources
 * @returns {?object}
 */
export function trouverExistant(en, { catalogue, perso = [] } = {}) {
  const cible = normaliser(en);
  if (!cible) return null;

  for (const mot of perso) {
    if (normaliser(mot.en) === cible) return mot;
  }
  for (const mot of catalogue?.values() ?? []) {
    if (normaliser(mot.en) === cible) return mot;
  }
  return null;
}

/**
 * Identifiant perso libre, préfixe `p_` (README §5.1).
 * @param {object[]} perso
 * @returns {string}
 */
export function prochainIdPerso(perso = []) {
  const rangs = perso
    .map((mot) => Number(String(mot.id ?? "").replace(/^p_/, "")))
    .filter(Number.isFinite);
  const suivant = (rangs.length ? Math.max(...rangs) : 0) + 1;
  return `p_${String(suivant).padStart(5, "0")}`;
}

/**
 * Construit une entité `word` complète à partir d'un mot renvoyé par l'API.
 *
 * La phrase capturée est conservée : elle sert d'exercice à trous en rappel
 * actif plutôt que la traduction isolée (README §3.4).
 *
 * Une entrée par sens (§5.2) : si le mot existe déjà, la nouvelle entrée
 * partage sa `famille` et incrémente `sens_index`.
 *
 * @param {object} options
 * @param {object} options.mot       entrée renvoyée par l'API
 * @param {string} options.phrase_en
 * @param {string} options.phrase_fr
 * @param {?object} options.existant
 * @param {string} options.id
 * @param {string} options.date
 * @returns {object}
 */
export function motDepuisTraduction({ mot, phrase_en = null, phrase_fr = null,
                                      existant = null, id, date = aujourdhui() }) {
  const en = String(mot.en ?? "").trim();
  return {
    id,
    en,
    fr: mot.fr ?? "",
    type: mot.type ?? null,
    source: "perso",
    phonetique: mot.phonetique ?? null,

    famille: existant?.famille ?? en,
    sens_index: existant ? Number(existant.sens_index ?? 1) + 1 : 1,

    rang_freq: Number.isFinite(Number(mot.rang_freq)) ? Number(mot.rang_freq) : null,
    palier: null,
    themes: [],
    def_en: mot.def_en ?? null,
    exemple_en: null,
    exemple_fr: null,

    phrase_en,
    phrase_fr,
    date_capture: date,
    origine_partie: null,

    preterit: null,
    participe: null,
    groupe_verbe: null,

    famille_expr: null,
    verbe_base: null,
    particule: null,
    litteral: null,

    eligible_grille: /^[A-Za-z]{3,8}$/.test(en),
    eligible_phrase_cachee: false,
  };
}

/**
 * Construit un mot `organique` à partir d'un segment d'indice tappé (§3.5).
 *
 * @param {object} options
 * @param {{txt:string, trad:string}} options.segment
 * @param {string} options.id
 * @param {?string} options.origine_partie
 * @param {string} options.date
 * @returns {object}
 */
export function motDepuisSegment({ segment, id, origine_partie = null,
                                   date = aujourdhui() }) {
  // Le segment porte la casse de la phrase : « Very » en tête d'indice n'est
  // pas une entrée de vocabulaire valable. On redescend en minuscules.
  const mot = motDepuisTraduction({
    mot: { en: String(segment.txt ?? "").toLowerCase(), fr: segment.trad },
    id,
    date,
  });
  return { ...mot, source: "organique", origine_partie };
}

/**
 * Lit un fichier de mots rapporté d'ailleurs — typiquement une conversation
 * orale où l'on a relevé ce qu'on ne savait pas dire (README §3.4).
 *
 * Le format d'entrée est **volontairement minuscule** : cinq champs. Une fiche
 * interne en compte vingt-cinq (`famille`, `sens_index`, `rang_freq`,
 * `eligible_grille`…) ; les faire produire ailleurs, c'est inviter l'erreur.
 * Tout le reste est calculé ici.
 *
 * ```json
 * { "version": 1,
 *   "mots": [{ "en": "to make up for", "fr": "compenser", "type": "expr",
 *              "def_en": "To do something good to balance a mistake",
 *              "exemple_en": "I worked late to make up for the delay." }] }
 * ```
 *
 * **`def_en` n'est pas décoratif.** Le quizz (§03) choisit le mot par sa
 * définition : `composerQuizz` ne retient que les fiches dont
 * `indice.segments` est rempli, et promeut les autres SANS les tester. Un mot
 * importé sans définition traverserait donc la porte sans la franchir. On
 * range la définition où le quizz la cherche, et on signale ceux qui n'en ont
 * pas plutôt que de les laisser filer en silence.
 *
 * @param {object|string} donnees
 * @param {object} options
 * @param {object[]} options.perso  mots déjà ajoutés, pour la suite des identifiants
 * @param {string} options.date
 * @returns {{ok:boolean, mots:object[], sansDefinition:string[], erreur:?string}}
 */
export function motsDepuisImport(donnees, { perso = [], date = aujourdhui() } = {}) {
  let objet = donnees;
  if (typeof donnees === "string") {
    try {
      objet = JSON.parse(donnees);
    } catch {
      return { ok: false, mots: [], sansDefinition: [],
               erreur: "Fichier illisible : ce n'est pas du JSON." };
    }
  }

  const liste = Array.isArray(objet) ? objet : objet?.mots;
  if (!Array.isArray(liste) || !liste.length) {
    return { ok: false, mots: [], sansDefinition: [],
             erreur: "Aucun mot dans ce fichier : une liste « mots » est attendue." };
  }

  const mots = [];
  const sansDefinition = [];
  const vus = new Set((perso ?? []).map((m) => String(m.en ?? "").toLowerCase()));

  for (const brut of liste) {
    const en = String(brut?.en ?? "").trim().toLowerCase();
    const fr = String(brut?.fr ?? "").trim();
    if (!en || !fr || vus.has(en)) continue;   // doublons et entrées creuses
    vus.add(en);

    const definition = String(brut?.def_en ?? "").trim();
    const mot = motDepuisTraduction({
      mot: { en, fr, type: brut?.type ?? null, def_en: definition || null },
      id: prochainIdPerso([...(perso ?? []), ...mots]),
      date,
    });

    mots.push({
      ...mot,
      source: "conversation",
      exemple_en: String(brut?.exemple_en ?? "").trim() || null,
      // Là où le quizz va la chercher.
      indice: definition ? { en: definition, segments: segmenterDefinition(definition) } : null,
    });
    if (!definition) sansDefinition.push(en);
  }

  if (!mots.length) {
    return { ok: false, mots: [], sansDefinition: [],
             erreur: "Aucun mot exploitable : il faut au moins « en » et « fr »." };
  }
  return { ok: true, mots, sansDefinition, erreur: null };
}

/** Un segment par mot. Les renvois vers le catalogue sont résolus ailleurs. */
function segmenterDefinition(texte) {
  return String(texte).trim().split(/\s+/)
    .filter(Boolean)
    .map((txt) => ({ txt, trad: null, ref: null }));
}

/**
 * Ajoute des mots perso à l'état et les place en file de découverte.
 * Ils seront découverts à la prochaine session, jamais dans celle en cours.
 *
 * @param {object} state
 * @param {object[]} mots
 * @returns {object} nouvel état
 */
export function ajouterMotsPerso(state, mots = []) {
  if (!mots.length) return state;
  return {
    ...state,
    perso: [...(state.perso ?? []), ...mots],
    progression: {
      ...state.progression,
      file_decouverte: [
        ...(state.progression?.file_decouverte ?? []),
        ...mots.map((mot) => mot.id),
      ],
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Cycle de vie de la progression                                              */
/* -------------------------------------------------------------------------- */

/**
 * Remet à zéro ce qui est journalier. À appeler au démarrage.
 * @param {object} state
 * @param {string} today
 * @returns {object} nouvel état
 */
export function demarrerJournee(state, today = aujourdhui()) {
  if (state?.progression?.derniere_session === today) return state;
  return {
    ...state,
    progression: { ...state.progression, ajouts_aujourdhui: 0 },
  };
}

/**
 * Clôt une session de découverte : date de dernière session, rien de plus.
 *
 * Le streak N'EST PAS touché ici : il porte sur le défi quotidien, pas sur la
 * découverte (README §2). C'est `challengeBuilder.cloturerDefi` qui l'avance.
 *
 * @param {object} state
 * @param {string} today
 * @returns {object} nouvel état
 */
export function cloturerSession(state, today = aujourdhui()) {
  if (state?.progression?.derniere_session === today) return state;
  return {
    ...state,
    progression: { ...state.progression, derniere_session: today },
  };
}

/**
 * Retire de la file de découverte les mots qui viennent d'être découverts.
 * @param {object} state
 * @param {string[]} ids
 * @returns {object} nouvel état
 */
export function retirerDeLaFile(state, ids) {
  const retires = new Set(ids);
  return {
    ...state,
    progression: {
      ...state.progression,
      file_decouverte: (state.progression?.file_decouverte ?? [])
        .filter((id) => !retires.has(id)),
    },
  };
}
