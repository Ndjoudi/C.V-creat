/**
 * leitner.js — moteur de répétition espacée (README §4).
 *
 * Aucun accès au stockage, aucun accès au DOM : que du calcul sur des fiches.
 * Un seul format de date dans tout le projet : ISO `YYYY-MM-DD` (README §15.8).
 */

/**
 * Délai en jours pour chaque boîte, index = boîte − 1 (README §5).
 *
 * La boîte 1 vaut DEUX jours, pas un : c'est le même délai que celui qui
 * sépare « je ne connais pas » (§02) de la première apparition dans Apprendre
 * (§03). Il n'y a qu'une règle de délai dans l'application, pas deux.
 */
export const DELAIS = [2, 3, 7, 21, 40];

export const BOITE_MIN = 1;
export const BOITE_MAX = DELAIS.length;

/** Boîte atteinte par un mot validé au quizz : il entre alors dans §05/§06/§07. */
export const BOITE_CONNU = 3;

/** Boîte d'un mot qui attend son passage au quizz. */
export const BOITE_QUIZZ = 2;

/** Délai, en jours, entre « je ne connais pas » et l'entrée dans Apprendre. */
export const DELAI_ATTENTE = DELAIS[0];

/** Les deux formes d'un verbe irrégulier, suivies séparément (README §4). */
export const FORMES_VERBE = ["preterit", "participe"];

/* -------------------------------------------------------------------------- */
/* Dates                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Date du jour au format ISO, en heure locale.
 * @param {Date} date
 * @returns {string} "YYYY-MM-DD"
 */
export function aujourdhui(date = new Date()) {
  const annee = date.getFullYear();
  const mois = String(date.getMonth() + 1).padStart(2, "0");
  const jour = String(date.getDate()).padStart(2, "0");
  return `${annee}-${mois}-${jour}`;
}

/**
 * Décale une date ISO d'un nombre de jours. Le calcul se fait à midi pour
 * qu'un changement d'heure ne fasse jamais basculer d'un jour.
 * @param {string} iso
 * @param {number} jours
 * @returns {string}
 */
export function ajouterJours(iso, jours) {
  const [annee, mois, jour] = String(iso).split("-").map(Number);
  const date = new Date(annee, mois - 1, jour, 12);
  date.setDate(date.getDate() + jours);
  return aujourdhui(date);
}

/* -------------------------------------------------------------------------- */
/* Fiches                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Fiche neuve, telle que décrite en §5.4.
 * @param {string} date  date d'entrée dans le système
 * @returns {{b:number, r:string, s:number, e:number, d:?string, st:string}}
 */
export function ficheInitiale(date = aujourdhui()) {
  return { b: BOITE_MIN, r: date, s: 0, e: 0, d: null, st: "nouveau" };
}

/**
 * Statut de repli déduit de la boîte.
 *
 * Depuis l'ajout du quizz (§03), le statut n'est PLUS une simple fonction de la
 * boîte : un mot peut être en boîte 2 parce qu'il attend le quizz, ou parce
 * qu'il est en cours d'apprentissage. Chaque service pose donc le statut
 * explicitement, et cette fonction ne sert plus qu'à la migration d'un état
 * ancien, où l'information n'existait pas.
 *
 * @param {number} boite
 * @returns {"actif"|"connu"|"acquis"}
 */
export function statutPourBoite(boite) {
  const b = bornerBoite(boite);
  if (b >= BOITE_MAX) return "acquis";
  if (b >= BOITE_CONNU) return "connu";
  return "actif";
}

/**
 * Fiche d'un mot que l'utilisateur déclare connaître en découverte (§02).
 *
 * Il n'est PAS connu pour autant : il part au quizz (§03), qui est la seule
 * porte vers la grille, les mots croisés et l'histoire. Se déclarer sûr de soi
 * ne remplace pas la vérification.
 *
 * @param {string} date
 * @returns {object}
 */
export function ficheAQuizzer(date = aujourdhui()) {
  return { b: BOITE_QUIZZ, r: date, s: 0, e: 0, d: date, st: "quizz" };
}

/**
 * Fiche d'un mot que l'utilisateur déclare connaître en découverte (§02).
 * Il entre directement en boîte 3 : il est immédiatement éligible aux jeux et
 * aux histoires, et sera revu dans 7 jours par ces sections.
 *
 * @param {string} date
 * @returns {object}
 */
export function ficheConnue(date = aujourdhui()) {
  return {
    b: BOITE_CONNU,
    r: prochaineRevision(BOITE_CONNU, date),
    s: 1,
    e: 0,
    d: date,
    st: "connu",
  };
}

/**
 * Fiche d'un mot que l'utilisateur déclare NE PAS connaître en découverte
 * (§02). Il n'apparaît dans Apprendre que dans DELAI_ATTENTE jours : revoir un
 * mot deux jours après l'avoir rencontré est ce qui le fait entrer en mémoire,
 * le revoir aussitôt ne fait que le reconnaître.
 *
 * @param {string} date
 * @returns {object}
 */
export function ficheEnAttente(date = aujourdhui()) {
  return {
    b: BOITE_MIN,
    r: ajouterJours(date, DELAI_ATTENTE),
    s: 0,
    e: 0,
    d: date,
    st: "attente",
  };
}

/** Fiche d'une forme de verbe : pas de statut, il vit au niveau du verbe. */
export function ficheVerbeInitiale(date = aujourdhui()) {
  return { b: BOITE_MIN, r: date, s: 0, e: 0 };
}

/**
 * Borne une boîte dans [1, 5].
 * @param {number} boite
 * @returns {number}
 */
export function bornerBoite(boite) {
  return Math.min(Math.max(Math.round(boite), BOITE_MIN), BOITE_MAX);
}

/**
 * Délai en jours associé à une boîte.
 * @param {number} boite
 * @returns {number}
 */
export function delaiPourBoite(boite) {
  return DELAIS[bornerBoite(boite) - 1];
}

/**
 * Date de la prochaine révision pour une boîte donnée.
 * @param {number} boite
 * @param {string} depuis
 * @returns {string}
 */
export function prochaineRevision(boite, depuis = aujourdhui()) {
  return ajouterJours(depuis, delaiPourBoite(boite));
}

/**
 * Applique le résultat d'une révision à une fiche. Fonction pure : la fiche
 * reçue n'est pas modifiée, une nouvelle est renvoyée.
 *
 *   succès → boite++, prochaine_revision = today + DELAIS[boite]
 *   échec  → boite = 1, prochaine_revision = today + 1
 *
 * `traductionConsultee` : si l'utilisateur a eu besoin de la traduction FR pour
 * résoudre le mot, il ne monte PAS d'une boîte (README §4, signal de maîtrise).
 * La réussite est comptée, le délai est recalculé sur la boîte inchangée.
 *
 * `statut` : depuis le quizz (§03), la place d'un mot dans le parcours ne se
 * déduit plus de sa boîte. L'appelant, qui sait d'où vient le résultat, le
 * pose ; sans lui on retombe sur la déduction historique.
 *
 * @param {object}  fiche
 * @param {{succes:boolean, traductionConsultee?:boolean, date?:string, statut?:string}} resultat
 * @returns {object} nouvelle fiche
 */
export function appliquerResultat(fiche, { succes, traductionConsultee = false,
                                           date = aujourdhui(), statut = null } = {}) {
  const courante = { ...ficheInitiale(date), ...fiche };

  if (!succes) {
    return {
      ...courante,
      b: BOITE_MIN,
      r: ajouterJours(date, DELAIS[0]),
      e: (courante.e ?? 0) + 1,
      d: date,
      st: statut ?? statutPourBoite(BOITE_MIN),
    };
  }

  const boite = traductionConsultee
    ? bornerBoite(courante.b)
    : bornerBoite((courante.b ?? BOITE_MIN) + 1);

  return {
    ...courante,
    b: boite,
    r: prochaineRevision(boite, date),
    s: (courante.s ?? 0) + 1,
    d: date,
    st: statut ?? statutPourBoite(boite),
  };
}

/**
 * Applique un résultat à UNE forme de verbe. Même mécanique que pour un mot,
 * mais la fiche d'une forme n'a ni statut ni date de dernière réponse : le
 * statut vit au niveau du verbe (README §5.4).
 *
 * @param {object} fiche
 * @param {{succes:boolean, date?:string}} resultat
 * @returns {{b:number, r:string, s:number, e:number}}
 */
export function appliquerResultatVerbe(fiche, { succes, date = aujourdhui() } = {}) {
  const complet = appliquerResultat(fiche ?? ficheVerbeInitiale(date), { succes, date });
  return { b: complet.b, r: complet.r, s: complet.s, e: complet.e };
}

/* -------------------------------------------------------------------------- */
/* File de révision                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Une fiche est-elle due ? Les dates ISO se comparent comme des chaînes.
 * @param {object} fiche
 * @param {string} today
 * @returns {boolean}
 */
export function estDue(fiche, today = aujourdhui()) {
  return Boolean(fiche) && String(fiche.r ?? "") <= today;
}

/**
 * File de révision — la requête unique du README §4, commune aux six filières.
 *
 *   words.filter(w => w.statut === "actif" && w.prochaine_revision <= today)
 *        .sort((a, b) => a.prochaine_revision - b.prochaine_revision)
 *
 * Les verbes n'ont pas de statut : chaque forme est due sur sa seule date, et
 * un même verbe peut donc apparaître deux fois dans la file (README §4).
 *
 * @param {object} state  état complet (§5.4)
 * @param {string} today
 * @returns {Array<{type:string, id:string, forme:?string, fiche:object}>}
 */
export function fileDeRevision(state = {}, today = aujourdhui()) {
  const file = [];

  for (const [id, fiche] of Object.entries(state.words ?? {})) {
    if (fiche?.st === "actif" && estDue(fiche, today)) {
      file.push({ type: "word", id, forme: null, fiche });
    }
  }

  for (const [id, formes] of Object.entries(state.verbes ?? {})) {
    for (const forme of FORMES_VERBE) {
      const fiche = formes?.[forme];
      if (estDue(fiche, today)) {
        file.push({ type: "verbe", id, forme, fiche });
      }
    }
  }

  return file.sort((a, b) => String(a.fiche.r).localeCompare(String(b.fiche.r)));
}

/**
 * File de révision restreinte au vocabulaire.
 *
 * Les verbes ont leur propre écran et ne se mélangent pas aux sessions de
 * vocabulaire : quatre appelants avaient besoin de ce filtre, il vit ici.
 *
 * @param {object} state
 * @param {string} today
 * @returns {Array<{type:string, id:string, forme:?string, fiche:object}>}
 */
export function motsDus(state = {}, today = aujourdhui()) {
  return fileDeRevision(state, today).filter((entree) => entree.type === "word");
}

/** Statuts d'un mot en cours d'apprentissage : §04 les sert, les autres les ignorent. */
export const STATUTS_APPRENTISSAGE = ["attente", "actif"];

/** Statuts d'un mot réellement acquis : eux seuls entrent dans §05, §06 et §07. */
export const STATUTS_CONNUS = ["connu", "acquis"];

/**
 * Mots en attente de vérification au quizz (§03).
 *
 * Y arrivent : les mots déclarés connus en découverte, et les mots sortis
 * d'Apprendre. Le quizz est la SEULE porte vers les trois sections de
 * révision — un mot ne peut pas la contourner.
 *
 * @param {object} state
 * @param {string} today
 * @returns {Array<{id:string, fiche:object}>}
 */
export function motsAQuizzer(state = {}, today = aujourdhui()) {
  return Object.entries(state.words ?? {})
    .filter(([, fiche]) => fiche?.st === "quizz" && estDue(fiche, today))
    .map(([id, fiche]) => ({ id, fiche }))
    .sort((a, b) => String(a.fiche.r).localeCompare(String(b.fiche.r)));
}

/**
 * Mots à travailler dans Apprendre (§03) : boîtes 1 et 2, échéance atteinte.
 *
 * Le statut « attente » compte ici : c'est un mot marqué « je ne connais pas »
 * dont le délai de deux jours est écoulé. Il n'a pas besoin d'être promu par
 * une tâche de fond, sa date suffit à le rendre dû.
 *
 * @param {object} state
 * @param {string} today
 * @returns {Array<{id:string, fiche:object}>}
 */
export function motsAApprendre(state = {}, today = aujourdhui()) {
  return Object.entries(state.words ?? {})
    .filter(([, fiche]) => STATUTS_APPRENTISSAGE.includes(fiche?.st) && estDue(fiche, today))
    .map(([id, fiche]) => ({ id, fiche }))
    .sort((a, b) => String(a.fiche.r).localeCompare(String(b.fiche.r)));
}

/**
 * Mots connus (§5.1) : boîte 3 ou plus. C'est le vivier commun de la grille,
 * des mots croisés et de l'histoire du jour. Un mot suspendu en est exclu.
 *
 * @param {object} state
 * @returns {string[]} ids
 */
export function motsConnus(state = {}) {
  return Object.entries(state.words ?? {})
    .filter(([, fiche]) => STATUTS_CONNUS.includes(fiche?.st))
    .map(([id]) => id);
}

/**
 * Date à laquelle le prochain mot deviendra disponible dans Apprendre.
 * Sert au message d'état vide de §03 : « rien aujourd'hui, reviens le … ».
 *
 * @param {object} state
 * @param {string} today
 * @returns {?string} date ISO, ou null si aucun mot n'est en attente
 */
export function prochaineEcheanceApprentissage(state = {}, today = aujourdhui()) {
  const dates = Object.values(state.words ?? {})
    .filter((fiche) => STATUTS_APPRENTISSAGE.includes(fiche?.st) && String(fiche?.r ?? "") > today)
    .map((fiche) => String(fiche.r))
    .sort();
  return dates[0] ?? null;
}

/**
 * Un verbe est acquis quand ses DEUX formes sont en boîte 5 (README §4).
 * @param {object} formes  { preterit, participe }
 * @returns {boolean}
 */
export function verbeAcquis(formes = {}) {
  return FORMES_VERBE.every((forme) => formes?.[forme]?.b === BOITE_MAX);
}

/**
 * Répartition par boîte, pour l'écran de progression.
 * @param {object} fiches  dictionnaire id → fiche
 * @returns {number[]} 5 entrées, index = boîte − 1
 */
export function repartitionParBoite(fiches = {}) {
  const compte = new Array(BOITE_MAX).fill(0);
  for (const fiche of Object.values(fiches)) {
    const boite = bornerBoite(fiche?.b ?? BOITE_MIN);
    compte[boite - 1] += 1;
  }
  return compte;
}
