/**
 * content-loader.js — manifeste, chargement paresseux, validation (README §7).
 *
 * Règles tenues ici :
 *  - au boot on charge le manifeste, puis les paliers DÉBLOQUÉS seulement.
 *    Jamais 2800 mots si l'utilisateur est au palier 2 (README §6) ;
 *  - un fichier invalide ne casse jamais l'application : il est écarté et
 *    l'erreur est collectée dans une liste consultable dans Réglages ;
 *  - une partie dont `verifie` n'est pas `true` n'est jamais servie (§5.3).
 */

/** Dossier racine du contenu, relatif à la page. */
export const BASE = "content/";

/** Nombre de mots par partie (README §3.3 et §17.8). */
export const MOTS_PAR_PARTIE = 5;

/** Les deux jeux qu'une partie peut alimenter (README §05, §6.4). */
export const JEUX = ["grille", "croises"];

/** Filières optionnelles : déclarées au manifeste, pas encore produites (§8). */
export const FILIERES_OPTIONNELLES = ["verbes", "phrasal", "histoires", "blocs"];

/** Version de schéma de contenu attendue (README §8). */
export const VERSION_CONTENU = 3;

/* -------------------------------------------------------------------------- */
/* Collecte des erreurs                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Une anomalie de contenu. `bloquant` dit si l'élément a été écarté ou
 * seulement signalé.
 * @typedef {{fichier:string, message:string, bloquant:boolean}} Anomalie
 */

function signaler(erreurs, fichier, message, bloquant = true) {
  erreurs.push({ fichier, message, bloquant });
  return false;
}

/* -------------------------------------------------------------------------- */
/* Lecture                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Lit un JSON. Ne lève jamais : renvoie toujours un verdict.
 * @param {string} chemin
 * @param {Function} recuperer  implémentation de fetch, injectable
 * @returns {Promise<{ok:boolean, donnees:?object, absent:boolean, erreur:?string}>}
 */
export async function lireJSON(chemin, recuperer = globalThis.fetch) {
  let reponse;
  try {
    reponse = await recuperer(chemin, { cache: "no-cache" });
  } catch (e) {
    return { ok: false, donnees: null, absent: false, erreur: `Réseau indisponible (${e.message}).` };
  }

  if (reponse.status === 404) {
    return { ok: false, donnees: null, absent: true, erreur: "Fichier absent." };
  }
  if (!reponse.ok) {
    return { ok: false, donnees: null, absent: false, erreur: `Réponse ${reponse.status}.` };
  }

  try {
    return { ok: true, donnees: await reponse.json(), absent: false, erreur: null };
  } catch {
    return { ok: false, donnees: null, absent: false, erreur: "JSON illisible." };
  }
}

/* -------------------------------------------------------------------------- */
/* Validation — manifeste                                                      */
/* -------------------------------------------------------------------------- */

/**
 * @param {object} manifeste
 * @param {Anomalie[]} erreurs
 * @returns {boolean}
 */
export function validerManifeste(manifeste, erreurs) {
  const fichier = "manifest.json";

  if (!manifeste || typeof manifeste !== "object") {
    return signaler(erreurs, fichier, "Manifeste illisible.");
  }
  if (!Array.isArray(manifeste.paliers)) {
    return signaler(erreurs, fichier, "Champ « paliers » absent ou mal formé.");
  }

  if (Number(manifeste.version) !== VERSION_CONTENU) {
    signaler(erreurs, fichier,
      `Manifeste en version ${manifeste.version}, le schéma attendu est ${VERSION_CONTENU} (§8).`,
      false);
  }

  // Le réservoir de phrases est partagé et séparé des paliers (§6.3).
  if (!manifeste.phrases) {
    signaler(erreurs, fichier, "Champ « phrases » absent : le réservoir de phrases est requis en v3.", false);
  }

  let valide = true;
  manifeste.paliers.forEach((entree, rang) => {
    for (const champ of ["id", "fichier", "titre"]) {
      if (entree?.[champ] === undefined) {
        valide = signaler(erreurs, fichier,
          `Palier n°${rang + 1} : champ « ${champ} » absent.`);
      }
    }
    // `frequence` pour les paliers 1-20, `theme` au-delà (§8).
    if (entree?.type !== undefined && !["frequence", "theme"].includes(entree.type)) {
      signaler(erreurs, fichier,
        `Palier ${entree.id} : « type » vaut « ${entree.type} », attendu « frequence » ou « theme ».`, false);
    }
  });

  return valide;
}

/* -------------------------------------------------------------------------- */
/* Validation — palier                                                         */
/* -------------------------------------------------------------------------- */

/** `eligible_grille` : longueur 3-8, [A-Z] uniquement, sans espace ni tiret (§6.1). */
export function calculerEligibleGrille(en) {
  return /^[A-Za-z]{3,8}$/.test(String(en ?? ""));
}

/** Un indice est exploitable s'il porte un texte et au moins un segment. */
export function indiceNonVide(indice) {
  return Boolean(indice)
    && typeof indice.en === "string" && indice.en.trim().length > 0
    && Array.isArray(indice.segments) && indice.segments.length > 0;
}

/** `eligible_croises` : comme `eligible_grille`, et possède un indice (§6.1). */
export function calculerEligibleCroises(mot) {
  return calculerEligibleGrille(mot?.en) && indiceNonVide(mot?.indice);
}

/**
 * Valide un fichier de palier et renvoie ses mots valides.
 * @param {object} donnees
 * @param {string} fichier
 * @param {Anomalie[]} erreurs
 * @returns {object[]} mots retenus
 */
export function validerPalier(donnees, fichier, erreurs) {
  if (!donnees || typeof donnees !== "object") {
    signaler(erreurs, fichier, "Fichier illisible.");
    return [];
  }
  if (!Array.isArray(donnees.mots)) {
    signaler(erreurs, fichier, "Champ « mots » absent ou mal formé.");
    return [];
  }

  const retenus = [];
  const vus = new Set();

  donnees.mots.forEach((mot, rang) => {
    const manquant = ["id", "en", "fr"].find((champ) => !mot?.[champ]);
    if (manquant) {
      signaler(erreurs, fichier, `Mot n°${rang + 1} : champ « ${manquant} » absent.`);
      return;
    }
    if (vus.has(mot.id)) {
      signaler(erreurs, fichier, `Identifiant en double : ${mot.id}.`);
      return;
    }
    vus.add(mot.id);

    // L'indice vit désormais SUR LE MOT (§6.1). C'est lui qui alimente les
    // lignes du codeword et la liste des mots croisés.
    if (mot.indice !== undefined && !indiceNonVide(mot.indice)) {
      signaler(erreurs, fichier,
        `${mot.id} (${mot.en}) : « indice » présent mais vide — il faut « en » et « segments ».`, false);
    }
    if (indiceNonVide(mot.indice)) {
      for (const segment of mot.indice.segments) {
        if (typeof segment?.txt !== "string" || !segment.txt.length) {
          signaler(erreurs, fichier,
            `${mot.id} (${mot.en}) : un segment d'indice n'a pas de « txt ».`, false);
          break;
        }
      }
    }

    const grilleAttendue = calculerEligibleGrille(mot.en);
    if (mot.eligible_grille !== undefined && mot.eligible_grille !== grilleAttendue) {
      signaler(erreurs, fichier,
        `${mot.id} (${mot.en}) : « eligible_grille » vaut ${mot.eligible_grille}, ` +
        `la formule de la §6.1 donne ${grilleAttendue}.`, false);
    }

    const croisesAttendu = calculerEligibleCroises(mot);
    if (mot.eligible_croises !== undefined && mot.eligible_croises !== croisesAttendu) {
      signaler(erreurs, fichier,
        `${mot.id} (${mot.en}) : « eligible_croises » vaut ${mot.eligible_croises}, ` +
        `la formule de la §6.1 donne ${croisesAttendu}.`, false);
    }
    if (mot.eligible_croises === undefined && mot.eligible_phrase_cachee !== undefined) {
      signaler(erreurs, fichier,
        `${mot.id} (${mot.en}) : schéma v2 — « eligible_phrase_cachee » remplacé par « eligible_croises » (§6.1).`,
        false);
    }

    retenus.push(mot);
  });

  return retenus;
}

/* -------------------------------------------------------------------------- */
/* Validation — partie                                                         */
/* -------------------------------------------------------------------------- */

/** Lettres distinctes d'une chaîne, en majuscules. */
function lettresDe(texte) {
  return new Set(String(texte ?? "").toUpperCase().replace(/[^A-Z]/g, ""));
}

/**
 * Valide une partie. Renvoie true si elle peut être servie.
 *
 * Contrôles bloquants (README §7) : champs obligatoires, `verifie === true`,
 * mots présents au catalogue, alphabet cohérent avec `phrase_en` ET les mots,
 * un indice par mot. Le reste est signalé sans écarter la partie.
 *
 * @param {object} partie
 * @param {Map<string,object>} catalogue  mots du palier et des paliers antérieurs
 * @param {string} fichier
 * @param {Anomalie[]} erreurs
 * @returns {boolean}
 */
export function validerPartie(partie, catalogue, fichier, erreurs) {
  const id = partie?.id ?? "partie sans id";

  // §6.4 — `croises` peut être absent tant que le générateur n'a pas tourné.
  for (const champ of ["id", "phrase_en", "mots", "jeu", "alphabet"]) {
    if (partie?.[champ] === undefined) {
      return signaler(erreurs, fichier, `${id} : champ « ${champ} » absent.`);
    }
  }

  // Une partie non vérifiée n'est jamais servie (README §6.4).
  if (partie.verifie !== true) {
    return signaler(erreurs, fichier, `${id} : « verifie » n'est pas true, partie écartée.`);
  }

  if (!Array.isArray(partie.mots) || partie.mots.length !== MOTS_PAR_PARTIE) {
    return signaler(erreurs, fichier,
      `${id} : ${Array.isArray(partie.mots) ? partie.mots.length : 0} mots au lieu de ${MOTS_PAR_PARTIE}.`);
  }

  const inconnus = partie.mots.filter((ref) => !catalogue.has(ref));
  if (inconnus.length) {
    return signaler(erreurs, fichier,
      `${id} : mots absents du palier ou des paliers antérieurs — ${inconnus.join(", ")}.`);
  }

  // §05 — une partie n'alimente qu'un seul des deux jeux : c'est ce qui
  // garantit que la grille et les mots croisés ne partagent jamais un mot.
  if (!JEUX.includes(partie.jeu)) {
    return signaler(erreurs, fichier,
      `${id} : « jeu » vaut « ${partie.jeu} », attendu ${JEUX.join(" ou ")}.`);
  }

  // Une partie destinée aux mots croisés SANS placement 2D est injouable.
  // Pour le codeword, `croises` reste facultatif (§6.4).
  if (partie.jeu === "croises" && !partie.croises) {
    return signaler(erreurs, fichier,
      `${id} : partie de mots croisés sans bloc « croises ».`);
  }

  // Alphabet : une lettre par numéro, et il couvre la phrase comme les mots.
  const valeurs = Object.values(partie.alphabet ?? {});
  if (!valeurs.length) {
    return signaler(erreurs, fichier, `${id} : alphabet vide.`);
  }
  if (new Set(valeurs).size !== valeurs.length) {
    return signaler(erreurs, fichier, `${id} : deux numéros pointent la même lettre.`);
  }
  if (valeurs.length > 26) {
    return signaler(erreurs, fichier, `${id} : alphabet de ${valeurs.length} entrées, 26 au maximum (§9).`);
  }

  const connues = new Set(valeurs.map((l) => String(l).toUpperCase()));

  for (const lettre of lettresDe(partie.phrase_en)) {
    if (!connues.has(lettre)) {
      return signaler(erreurs, fichier,
        `${id} : la lettre « ${lettre} » de la phrase cachée n'est pas dans l'alphabet.`);
    }
  }

  for (const ref of partie.mots) {
    const mot = catalogue.get(ref);
    for (const lettre of lettresDe(mot.en)) {
      if (!connues.has(lettre)) {
        return signaler(erreurs, fichier,
          `${id} : la lettre « ${lettre} » de ${mot.en.toUpperCase()} n'est pas dans l'alphabet.`);
      }
    }
  }

  // L'indice vit sur le mot (§6.1). Sans lui, la ligne d'indice est vide et la
  // partie est injouable.
  for (const ref of partie.mots) {
    const mot = catalogue.get(ref);
    if (!indiceNonVide(mot.indice)) {
      return signaler(erreurs, fichier,
        `${id} : le mot ${ref} (${mot.en}) n'a pas d'indice — l'indice vit sur le mot en v3 (§6.1).`);
    }
  }

  if (partie.indices !== undefined) {
    signaler(erreurs, fichier,
      `${id} : schéma v2 — « indices » sur la partie est ignoré, l'indice vit sur le mot (§6.1).`, false);
  }

  // §6.4 — `croises` est facultatif pour le codeword. Le générateur écrit
  // `null` quand les cinq mots ne se croisent pas : absent et null valent
  // pareil, seul un bloc réellement présent est validé.
  if (partie.croises != null && !validerCroises(partie, catalogue, fichier, erreurs)) {
    return false;
  }

  /* --- signalements non bloquants ---------------------------------------- */

  for (const champ of ["palier", "ordre", "phrase_id"]) {
    if (partie[champ] === undefined) {
      signaler(erreurs, fichier, `${id} : champ « ${champ} » absent (§6.4).`, false);
    }
  }

  // §9 (v4) — la grille démarre vide : la phrase cachée n'est lisible que si
  // chacune de ses lettres apparaît dans au moins un des cinq mots.
  const lettresMots = new Set(partie.mots.flatMap((ref) => [...lettresDe(catalogue.get(ref).en)]));
  const illisibles = [...lettresDe(partie.phrase_en)].filter((l) => !lettresMots.has(l));
  if (illisibles.length) {
    signaler(erreurs, fichier,
      `${id} : la phrase cachée restera illisible — ${illisibles.join(",")} n'apparaît dans aucun mot (§9).`,
      false);
  }

  // Résidus du schéma v3 : la grille n'offre plus aucune lettre d'avance.
  for (const champ of ["mot_amorce", "lettres_offertes"]) {
    if (partie[champ] !== undefined) {
      signaler(erreurs, fichier,
        `${id} : champ « ${champ} » hérité du schéma v3, ignoré (§6.4).`, false);
    }
  }

  for (const ref of partie.mots) {
    for (const segment of catalogue.get(ref).indice.segments) {
      if (segment.ref && !catalogue.has(segment.ref)) {
        signaler(erreurs, fichier,
          `${id} : dans l'indice de ${ref}, le segment « ${segment.txt} » renvoie à ${segment.ref}, absent du catalogue.`,
          false);
      }
    }
  }

  return true;
}

/**
 * Valide le bloc `croises` d'une partie (§6.4, §9).
 *
 * On ne calcule aucun placement : on vérifie que celui du contenu tient debout
 * — mots connus, direction valide, dans les bornes, et lettres cohérentes aux
 * croisements. Chaque mot doit croiser au moins un autre.
 *
 * @returns {boolean} false si la partie doit être écartée
 */
export function validerCroises(partie, catalogue, fichier, erreurs) {
  const id = partie.id;
  const croises = partie.croises;

  if (!Array.isArray(croises.placements) || !croises.placements.length) {
    return signaler(erreurs, fichier, `${id} : « croises.placements » absent ou vide.`);
  }

  const largeur = Number(croises.largeur);
  const hauteur = Number(croises.hauteur);
  if (!Number.isInteger(largeur) || !Number.isInteger(hauteur) || largeur < 1 || hauteur < 1) {
    return signaler(erreurs, fichier, `${id} : « croises.largeur/hauteur » manquantes ou invalides.`);
  }

  // Cases occupées : "x,y" → lettre attendue.
  const cases = new Map();
  const croisements = new Map(partie.mots.map((ref) => [ref, 0]));

  for (const placement of croises.placements) {
    const { mot: ref, x, y, dir } = placement ?? {};

    if (!partie.mots.includes(ref)) {
      return signaler(erreurs, fichier,
        `${id} : « croises » place ${ref}, qui n'est pas un mot de la partie.`);
    }
    if (dir !== "H" && dir !== "V") {
      return signaler(erreurs, fichier, `${id} : direction « ${dir} » pour ${ref}, attendu H ou V.`);
    }
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) {
      return signaler(erreurs, fichier, `${id} : coordonnées invalides pour ${ref}.`);
    }

    const lettres = String(catalogue.get(ref).en).toUpperCase();
    const finX = dir === "H" ? x + lettres.length - 1 : x;
    const finY = dir === "V" ? y + lettres.length - 1 : y;
    if (finX >= largeur || finY >= hauteur) {
      return signaler(erreurs, fichier,
        `${id} : ${ref} (${lettres}) déborde de la grille ${largeur}×${hauteur}.`);
    }

    for (let i = 0; i < lettres.length; i += 1) {
      const cx = dir === "H" ? x + i : x;
      const cy = dir === "V" ? y + i : y;
      const cle = `${cx},${cy}`;
      const deja = cases.get(cle);

      if (deja === undefined) {
        cases.set(cle, { lettre: lettres[i], mot: ref });
        continue;
      }
      if (deja.lettre !== lettres[i]) {
        return signaler(erreurs, fichier,
          `${id} : croisement incohérent en (${cx},${cy}) — « ${deja.lettre} » pour ${deja.mot}, ` +
          `« ${lettres[i]} » pour ${ref}.`);
      }
      croisements.set(ref, croisements.get(ref) + 1);
      croisements.set(deja.mot, croisements.get(deja.mot) + 1);
    }
  }

  // §9 : chaque mot croise au moins un autre.
  const isoles = [...croisements].filter(([, n]) => n === 0).map(([ref]) => ref);
  if (isoles.length && croises.placements.length > 1) {
    signaler(erreurs, fichier,
      `${id} : ${isoles.join(", ")} ne croise aucun autre mot (§9).`, false);
  }

  const places = new Set(croises.placements.map((p) => p.mot));
  const absents = partie.mots.filter((ref) => !places.has(ref));
  if (absents.length) {
    signaler(erreurs, fichier,
      `${id} : ${absents.join(", ")} absent(s) de la grille de mots croisés.`, false);
  }

  return true;
}

/* -------------------------------------------------------------------------- */
/* Validation — réservoir de phrases (README §6.3)                             */
/* -------------------------------------------------------------------------- */

/**
 * Valide le réservoir de phrases cachées, partagé par tous les paliers.
 * Accepte `{ phrases: [...] }` ou un tableau nu.
 *
 * @param {object|Array} donnees
 * @param {string} fichier
 * @param {Anomalie[]} erreurs
 * @returns {Map<string,object>} phrases retenues, indexées par id
 */
export function validerPhrases(donnees, fichier, erreurs) {
  const liste = Array.isArray(donnees) ? donnees : donnees?.phrases;
  const retenues = new Map();

  if (!Array.isArray(liste)) {
    signaler(erreurs, fichier, "Champ « phrases » absent ou mal formé.");
    return retenues;
  }

  liste.forEach((phrase, rang) => {
    const manquant = ["id", "en", "fr"].find((champ) => !phrase?.[champ]);
    if (manquant) {
      signaler(erreurs, fichier, `Phrase n°${rang + 1} : champ « ${manquant} » absent.`);
      return;
    }
    if (retenues.has(phrase.id)) {
      signaler(erreurs, fichier, `Identifiant en double : ${phrase.id}.`);
      return;
    }

    // `lettres` est pré-calculé pour accélérer l'appariement (§6.3) : on
    // vérifie qu'il correspond, sans écarter la phrase pour autant.
    const attendues = [...new Set(String(phrase.en).toUpperCase().replace(/[^A-Z]/g, ""))].sort();
    const declarees = [...new Set((phrase.lettres ?? []).map((l) => String(l).toUpperCase()))].sort();
    if (phrase.lettres !== undefined && declarees.join("") !== attendues.join("")) {
      signaler(erreurs, fichier,
        `${phrase.id} : « lettres » ne correspond pas au texte de la phrase.`, false);
    }

    retenues.set(phrase.id, phrase);
  });

  return retenues;
}

/* -------------------------------------------------------------------------- */
/* Validation — verbes irréguliers (README §3.2, §6.1)                         */
/* -------------------------------------------------------------------------- */

/**
 * Valide un fichier de verbes irréguliers.
 *
 * Le fichier n'ayant pas de schéma dédié dans le README, on accepte les deux
 * formes évidentes : `{ verbes: [...] }` ou un tableau nu. Chaque entrée suit
 * le schéma `word` de la §6.1, avec `preterit`, `participe` et `groupe_verbe`.
 *
 * @param {object|Array} donnees
 * @param {string} fichier
 * @param {Anomalie[]} erreurs
 * @returns {object[]} verbes retenus
 */
export function validerVerbes(donnees, fichier, erreurs) {
  const liste = Array.isArray(donnees) ? donnees : donnees?.verbes;

  if (!Array.isArray(liste)) {
    signaler(erreurs, fichier, "Champ « verbes » absent ou mal formé.");
    return [];
  }

  const retenus = [];
  const vus = new Set();

  liste.forEach((verbe, rang) => {
    const manquant = ["id", "en", "fr", "preterit", "participe"]
      .find((champ) => !verbe?.[champ]);
    if (manquant) {
      signaler(erreurs, fichier, `Verbe n°${rang + 1} : champ « ${manquant} » absent.`);
      return;
    }
    if (vus.has(verbe.id)) {
      signaler(erreurs, fichier, `Identifiant en double : ${verbe.id}.`);
      return;
    }
    vus.add(verbe.id);

    const groupe = Number(verbe.groupe_verbe);
    if (!Number.isInteger(groupe) || groupe < 1 || groupe > 4) {
      // L'apprentissage se fait par groupe de pattern (§3.2) : sans groupe
      // valide, le verbe ne serait jamais servi. On l'écarte en le disant.
      signaler(erreurs, fichier,
        `${verbe.id} (${verbe.en}) : « groupe_verbe » doit valoir 1 à 4, reçu ${verbe.groupe_verbe}.`);
      return;
    }

    retenus.push(verbe);
  });

  return retenus;
}

/**
 * Charge la filière verbes, à la demande — jamais au démarrage.
 *
 * @param {object} options
 * @param {object} options.manifeste
 * @param {string} options.base
 * @param {Function} options.recuperer
 * @returns {Promise<{verbes:object[], erreurs:Anomalie[], absente:boolean}>}
 */
export async function chargerVerbes({ manifeste, base = BASE,
                                      recuperer = globalThis.fetch } = {}) {
  const erreurs = [];
  const fichier = manifeste?.verbes;

  if (!fichier) return { verbes: [], erreurs, absente: true };

  const lu = await lireJSON(`${base}${fichier}`, recuperer);
  if (!lu.ok) {
    // Filière déclarée mais pas encore livrée : ce n'est pas une erreur (§8).
    if (lu.absent) return { verbes: [], erreurs, absente: true };
    signaler(erreurs, fichier, lu.erreur);
    return { verbes: [], erreurs, absente: false };
  }

  return { verbes: validerVerbes(lu.donnees, fichier, erreurs), erreurs, absente: false };
}

/* -------------------------------------------------------------------------- */
/* Validation — histoires (README §6.5)                                        */
/* -------------------------------------------------------------------------- */

/** Longueurs admises pour une histoire du jour (README §6.5). */
export const HISTOIRE_MOTS_MIN = 250;
export const HISTOIRE_MOTS_MAX = 350;

/**
 * Valide le fichier d'index des histoires.
 *
 * Une histoire dont le lexique est vide est écartée : sans lexique, la
 * couverture n'est pas calculable et le texte serait servi à l'aveugle (§6.5).
 * Les écarts de longueur sont signalés sans écarter — un texte un peu court
 * reste lisible.
 *
 * @param {object} donnees
 * @param {string} fichier
 * @param {Anomalie[]} erreurs
 * @returns {object[]}
 */
export function validerHistoires(donnees, fichier, erreurs) {
  const liste = donnees?.histoires;
  if (!Array.isArray(liste)) {
    signaler(erreurs, fichier, "« histoires » absent ou n'est pas un tableau.");
    return [];
  }

  const vues = new Set();
  return liste.filter((histoire) => {
    const id = histoire?.id ?? "histoire sans id";

    for (const champ of ["id", "texte_en", "lexique"]) {
      if (histoire?.[champ] === undefined) {
        return !signaler(erreurs, fichier, `${id} : champ « ${champ} » absent.`);
      }
    }
    if (vues.has(histoire.id)) {
      return !signaler(erreurs, fichier, `${id} : identifiant en double.`);
    }
    vues.add(histoire.id);

    if (!Array.isArray(histoire.lexique) || !histoire.lexique.length) {
      return !signaler(erreurs, fichier,
        `${id} : lexique vide, la couverture serait incalculable (§6.5).`);
    }

    const nb = Number(histoire.nb_mots ?? String(histoire.texte_en).split(/\s+/).length);
    if (nb < HISTOIRE_MOTS_MIN || nb > HISTOIRE_MOTS_MAX) {
      signaler(erreurs, fichier,
        `${id} : ${nb} mots, attendu entre ${HISTOIRE_MOTS_MIN} et ${HISTOIRE_MOTS_MAX} (§6.5).`,
        false);
    }
    return true;
  });
}

/**
 * Charge les histoires déclarées au manifeste. Une filière déclarée mais non
 * livrée n'est pas une erreur : la section §06 se verrouille simplement (§8).
 *
 * @param {object} options
 * @returns {{histoires:object[], erreurs:Anomalie[], absente:boolean}}
 */
export async function chargerHistoires({ manifeste, base = BASE,
                                         recuperer = globalThis.fetch } = {}) {
  const erreurs = [];
  const fichier = manifeste?.histoires;

  if (!fichier) return { histoires: [], erreurs, absente: true };

  const lu = await lireJSON(`${base}${fichier}`, recuperer);
  if (!lu.ok) {
    if (lu.absent) return { histoires: [], erreurs, absente: true };
    signaler(erreurs, fichier, lu.erreur);
    return { histoires: [], erreurs, absente: false };
  }

  return { histoires: validerHistoires(lu.donnees, fichier, erreurs), erreurs, absente: false };
}

/* -------------------------------------------------------------------------- */
/* Chargement — dictées (README §08)                                           */
/* -------------------------------------------------------------------------- */

/**
 * Charge les phrases de dictée du palier courant.
 *
 * Le chargement est paresseux comme celui des paliers : les fichiers audio
 * pèsent, on ne descend que ce qui sert. Un palier sans fichier de dictées
 * n'est pas une erreur — la section se verrouille simplement (§8).
 *
 * @param {object} options
 * @param {number} options.palier
 * @returns {{phrases:object[], erreurs:Anomalie[], absente:boolean}}
 */
export async function chargerDictees({ palier = 1, base = BASE,
                                       recuperer = globalThis.fetch } = {}) {
  const erreurs = [];

  // On CUMULE le palier courant et tous les précédents. Le générateur garantit
  // qu'un fichier de palier N n'emploie que du vocabulaire de N ou d'avant
  // (§6.7) : ce qui précède reste donc dictable. Sans ce cumul, atteindre un
  // palier dont le fichier n'est pas encore livré vidait la section — et c'est
  // exactement ce qui verrouillait « Écrire ».
  const rangs = Array.from({ length: Math.max(1, Number(palier) || 1) },
                           (_, i) => i + 1);
  const lots = await Promise.all(
    rangs.map((rang) => lireDicteesDUnPalier(rang, base, recuperer, erreurs)));

  const phrases = [];
  const vus = new Set();
  for (const lot of lots) {
    for (const phrase of lot) {
      if (vus.has(phrase.id)) continue;
      vus.add(phrase.id);
      phrases.push(phrase);
    }
  }

  // « Absente » ne veut plus dire « fichier manquant » mais « rien à dicter » :
  // c'est la seule chose que l'écran d'accueil a besoin de savoir.
  return { phrases, erreurs, absente: phrases.length === 0 };
}

/**
 * Les phrases d'UN palier. Rend `[]` si le fichier n'est pas livré — la
 * filière est optionnelle et arrive palier par palier, ce n'est pas une
 * anomalie à signaler.
 */
async function lireDicteesDUnPalier(palier, base, recuperer, erreurs) {
  const fichier = `dictees/dictee-${String(palier).padStart(2, "0")}.json`;

  const lu = await lireJSON(`${base}${fichier}`, recuperer);
  if (!lu.ok) {
    if (!lu.absent) signaler(erreurs, fichier, lu.erreur);
    return [];
  }

  const liste = lu.donnees?.phrases;
  if (!Array.isArray(liste)) {
    signaler(erreurs, fichier, "« phrases » absent ou n'est pas un tableau.");
    return [];
  }

  return liste.filter((phrase) => {
    const id = phrase?.id ?? "phrase sans id";
    for (const champ of ["id", "en", "fr", "audio"]) {
      if (phrase?.[champ] === undefined) {
        return !signaler(erreurs, fichier, `${id} : champ « ${champ} » absent.`);
      }
    }
    if (!Array.isArray(phrase.fr) || !phrase.fr.length) {
      return !signaler(erreurs, fichier, `${id} : aucune traduction française.`);
    }
    // Le crédit du lecteur est une obligation de licence, pas un confort (§16).
    if (!phrase.lecteur) {
      signaler(erreurs, fichier, `${id} : lecteur non crédité — la licence l'exige.`, false);
    }
    return true;
  });
}

/* -------------------------------------------------------------------------- */
/* Validation — phrasal verbs (README §3.3, §6.1)                              */
/* -------------------------------------------------------------------------- */

/**
 * Valide un fichier de phrasal verbs.
 *
 * Accepte `{ phrasal: [...] }` ou un tableau nu. Chaque entrée suit le schéma
 * `word` de la §6.1, avec `verbe_base`, `particule` et `litteral`.
 *
 * @param {object|Array} donnees
 * @param {string} fichier
 * @param {Anomalie[]} erreurs
 * @returns {object[]} phrasal verbs retenus
 */
export function validerPhrasal(donnees, fichier, erreurs) {
  const liste = Array.isArray(donnees) ? donnees : donnees?.phrasal;

  if (!Array.isArray(liste)) {
    signaler(erreurs, fichier, "Champ « phrasal » absent ou mal formé.");
    return [];
  }

  const retenus = [];
  const vus = new Set();

  liste.forEach((entree, rang) => {
    const manquant = ["id", "en", "fr", "verbe_base", "particule"]
      .find((champ) => !entree?.[champ]);
    if (manquant) {
      signaler(erreurs, fichier, `Phrasal n°${rang + 1} : champ « ${manquant} » absent.`);
      return;
    }
    if (vus.has(entree.id)) {
      signaler(erreurs, fichier, `Identifiant en double : ${entree.id}.`);
      return;
    }
    vus.add(entree.id);

    // §3.3 : un phrasal n'entre dans aucune grille.
    if (entree.eligible_grille === true) {
      signaler(erreurs, fichier,
        `${entree.id} (${entree.en}) : « eligible_grille » doit valoir false (§3.3).`, false);
    }
    // Les modes de la §3.3 ont besoin d'une phrase support.
    if (!entree.exemple_en) {
      signaler(erreurs, fichier,
        `${entree.id} (${entree.en}) : « exemple_en » absent — les trois modes en ont besoin.`, false);
    }

    retenus.push(entree);
  });

  return retenus;
}

/**
 * Charge la filière phrasal, à la demande — jamais au démarrage.
 *
 * @param {object} options
 * @param {object} options.manifeste
 * @param {string} options.base
 * @param {Function} options.recuperer
 * @returns {Promise<{phrasal:object[], erreurs:Anomalie[], absente:boolean}>}
 */
export async function chargerPhrasal({ manifeste, base = BASE,
                                       recuperer = globalThis.fetch } = {}) {
  const erreurs = [];
  const fichier = manifeste?.phrasal;

  if (!fichier) return { phrasal: [], erreurs, absente: true };

  const lu = await lireJSON(`${base}${fichier}`, recuperer);
  if (!lu.ok) {
    if (lu.absent) return { phrasal: [], erreurs, absente: true };
    signaler(erreurs, fichier, lu.erreur);
    return { phrasal: [], erreurs, absente: false };
  }

  return { phrasal: validerPhrasal(lu.donnees, fichier, erreurs), erreurs, absente: false };
}

/* -------------------------------------------------------------------------- */
/* Migration v2 → v3 au chargement                                             */
/* -------------------------------------------------------------------------- */

/**
 * Remonte sur les mots les indices restés dans `partie.indices` (schéma v2).
 *
 * En v3 l'indice vit sur le mot (§6.1). Le contenu livré le porte encore sur
 * la partie : plutôt que d'écarter 110 parties jouables, on migre en mémoire.
 * Les fichiers ne sont pas touchés — c'est bien une migration de lecture.
 *
 * Un mot qui a déjà son indice n'est jamais écrasé : le v3 fait foi.
 *
 * @param {object[]} parties
 * @param {Map<string,object>} mots
 * @param {string} fichier
 * @param {Anomalie[]} erreurs
 * @returns {number} nombre d'indices repris
 */
export function migrerIndicesV2(parties, mots, fichier, erreurs) {
  let repris = 0;

  for (const partie of parties) {
    for (const [id, indice] of Object.entries(partie?.indices ?? {})) {
      const mot = mots.get(id);
      if (!mot || indiceNonVide(mot.indice) || !indiceNonVide(indice)) continue;

      // On ne garde que ce que la §6.1 définit : `en` et `segments`.
      mot.indice = { en: indice.en, segments: indice.segments };
      repris += 1;
    }
  }

  if (repris) {
    signaler(erreurs, fichier,
      `Schéma v2 : ${repris} indices repris depuis les parties et posés sur les mots (§6.1). ` +
      "Les fichiers ne sont pas modifiés — à régénérer pour s'en passer.", false);
  }

  return repris;
}

/* -------------------------------------------------------------------------- */
/* Chargement                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Une filière optionnelle est-elle réellement livrée ?
 *
 * On sonde le fichier sans le charger : la §7 veut qu'une filière déclarée au
 * manifeste mais absente soit simplement masquée, pas signalée en erreur. Son
 * contenu, lui, ne sera lu que par l'écran qui en a besoin.
 *
 * @param {string} chemin
 * @param {Function} recuperer
 * @returns {Promise<boolean>}
 */
export async function filiereDisponible(chemin, recuperer = globalThis.fetch) {
  try {
    const reponse = await recuperer(chemin, { method: "HEAD", cache: "no-cache" });
    return reponse.ok;
  } catch {
    return false;
  }
}

/**
 * Paliers à charger : ceux dont l'id est atteint ou déjà validé.
 * @param {object} manifeste
 * @param {object} state
 * @returns {object[]} entrées du manifeste
 */
export function paliersDebloques(manifeste, state) {
  const courant = Number(state?.progression?.palier_actuel ?? 1);
  const valides = new Set(state?.progression?.paliers_valides ?? []);
  return (manifeste?.paliers ?? [])
    .filter((entree) => Number(entree.id) <= courant || valides.has(entree.id))
    .sort((a, b) => Number(a.id) - Number(b.id));
}

/**
 * Charge le contenu utile à l'état courant.
 *
 * @param {object}   options
 * @param {object}   options.state
 * @param {string}   options.base
 * @param {Function} options.recuperer  implémentation de fetch, injectable
 * @returns {Promise<{
 *   manifeste:?object, paliers:object[], mots:Map<string,object>,
 *   parties:object[], phrases:Map<string,object>,
 *   filieres:Object<string,boolean>, erreurs:Anomalie[]
 * }>}
 */
export async function chargerContenu({ state, base = BASE,
                                       recuperer = globalThis.fetch } = {}) {
  const erreurs = [];
  const mots = new Map();
  const parties = [];
  const paliers = [];

  const lu = await lireJSON(`${base}manifest.json`, recuperer);
  if (!lu.ok) {
    signaler(erreurs, "manifest.json", lu.erreur);
    return { manifeste: null, paliers, mots, parties, phrases: new Map(), filieres: {}, erreurs };
  }

  const manifeste = lu.donnees;
  if (!validerManifeste(manifeste, erreurs)) {
    return { manifeste, paliers, mots, parties, phrases: new Map(), filieres: {}, erreurs };
  }

  // Une filière déclarée mais absente n'est pas une erreur : elle n'est pas
  // encore produite, elle sera simplement masquée (README §8). On sonde le
  // fichier — être déclaré au manifeste ne prouve pas qu'il ait été livré.
  const filieres = {};
  for (const nom of FILIERES_OPTIONNELLES) {
    filieres[nom] = manifeste[nom]
      ? await filiereDisponible(`${base}${manifeste[nom]}`, recuperer)
      : false;
  }

  // Réservoir de phrases (§6.3) : requis en v3, mais son absence ne doit pas
  // empêcher les paliers de se charger.
  let phrases = new Map();
  if (manifeste.phrases) {
    const luPhrases = await lireJSON(`${base}${manifeste.phrases}`, recuperer);
    if (luPhrases.ok) {
      phrases = validerPhrases(luPhrases.donnees, manifeste.phrases, erreurs);
    } else {
      // Non bloquant : à l'exécution, la partie embarque déjà sa phrase
      // (§6.4). Le réservoir ne sert qu'au générateur hors ligne (§9).
      signaler(erreurs, manifeste.phrases,
        luPhrases.absent
          ? "Réservoir de phrases déclaré au manifeste mais introuvable — seul le générateur en a besoin."
          : luPhrases.erreur,
        false);
    }
  }

  for (const entree of paliersDebloques(manifeste, state)) {
    const fichierPalier = entree.fichier;
    const luPalier = await lireJSON(`${base}${fichierPalier}`, recuperer);

    if (!luPalier.ok) {
      signaler(erreurs, fichierPalier,
        luPalier.absent ? "Palier déclaré au manifeste mais introuvable." : luPalier.erreur);
      continue;
    }

    for (const mot of validerPalier(luPalier.donnees, fichierPalier, erreurs)) {
      mots.set(mot.id, mot);
    }
    paliers.push({ ...entree, titre: luPalier.donnees.titre ?? entree.titre });

    if (!entree.parties) continue;

    const luParties = await lireJSON(`${base}${entree.parties}`, recuperer);
    if (!luParties.ok) {
      signaler(erreurs, entree.parties,
        luParties.absent ? "Parties déclarées au manifeste mais introuvables." : luParties.erreur);
      continue;
    }

    const liste = luParties.donnees?.parties;
    if (!Array.isArray(liste)) {
      signaler(erreurs, entree.parties, "Champ « parties » absent ou mal formé.");
      continue;
    }

    // Le contenu v2 porte ses indices sur la partie : on les remonte sur les
    // mots avant de valider, sinon toutes les parties seraient écartées.
    migrerIndicesV2(liste, mots, entree.parties, erreurs);

    for (const partie of liste) {
      if (validerPartie(partie, mots, entree.parties, erreurs)) parties.push(partie);
    }
  }

  return { manifeste, paliers, mots, parties, phrases, filieres, erreurs };
}
