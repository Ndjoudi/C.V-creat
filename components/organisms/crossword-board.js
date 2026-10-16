import { Tile } from "../atoms/tile.js";
import { ClueList } from "../molecules/clue-list.js";
import { Keyboard } from "../molecules/keyboard.js";

/** Durées de la §15.3, en millisecondes. */
const DUREE_ERREUR = 600;
const DUREE_FIN = 800;

/**
 * CrosswordBoard — grille 2D et liste d'indices (README §12.3, §15.2, §15.3).
 *
 * Rien n'est calculé ici : la grille, les placements et la numérotation sont
 * lus depuis `partie.croises` (§17.9 — aucune génération dans le navigateur).
 * Les indices viennent de `word.indice` (§6.1).
 *
 * @param {object}   partie
 * @param {object[]} words          les mots de la partie, avec leur indice
 * @param {Object<string,string>} gridState  "x,y" → lettre déjà posée
 * @param {?object}  activeClue     mot armé au montage
 * @param {Function} onLetterInput  ({ x, y, lettre, gridState })
 * @param {Function} onClueSelect   reçoit l'item d'indice choisi
 * @param {Function} onComplete     la grille est entièrement résolue
 * @returns {HTMLElement}
 */
export function CrosswordBoard({ partie, words = [], gridState = {}, activeClue = null,
                                 onLetterInput, onClueSelect, onComplete } = {}) {
  const el = document.createElement("section");
  el.className = "crossword";

  const croises = partie?.croises;
  const parId = new Map(words.map((mot) => [mot.id, mot]));

  /* ---------------------------------------------------------------- Données */

  const largeur = Number(croises?.largeur ?? 0);
  const hauteur = Number(croises?.hauteur ?? 0);

  /** Un mot placé : ses cases, sa direction, son numéro, son indice. */
  const places = (croises?.placements ?? [])
    .map((placement) => {
      const mot = parId.get(placement.mot);
      if (!mot) return null;
      const lettres = String(mot.en).toUpperCase();
      const cases = [...lettres].map((lettre, i) => ({
        x: placement.dir === "H" ? placement.x + i : placement.x,
        y: placement.dir === "V" ? placement.y + i : placement.y,
        lettre,
      }));
      return { mot, dir: placement.dir, num: placement.num, cases, resolu: false };
    })
    .filter(Boolean);

  /** "x,y" → les mots qui passent par cette case. Une case peut en avoir deux. */
  const parCase = new Map();
  for (const place of places) {
    for (const c of place.cases) {
      const cle = `${c.x},${c.y}`;
      if (!parCase.has(cle)) parCase.set(cle, []);
      parCase.get(cle).push(place);
    }
  }

  /* ------------------------------------------------------------------ État UI */

  const pose = { ...gridState };
  let actif = places.find((p) => p.mot.id === activeClue?.id) ?? places[0] ?? null;
  let indexActif = actif ? Math.max(actif.cases.findIndex((c) => !pose[`${c.x},${c.y}`]), 0) : 0;
  let enErreur = new Set();
  let termine = false;

  /** Une case verrouillée appartient à un mot déjà validé. */
  const verrouillees = () => {
    const set = new Set();
    for (const place of places) {
      if (!place.resolu) continue;
      for (const c of place.cases) set.add(`${c.x},${c.y}`);
    }
    return set;
  };

  /* -------------------------------------------------------------------- Rendu */

  const zoneGrille = document.createElement("div");
  zoneGrille.className = "crossword__grid";
  el.append(zoneGrille);

  const zoneIndices = document.createElement("div");
  zoneIndices.className = "crossword__clues";
  el.append(zoneIndices);

  const zoneClavier = document.createElement("div");
  zoneClavier.className = "crossword__keyboard";
  zoneClavier.append(Keyboard({ disabledKeys: [], onKey: saisir, onBackspace: effacer }));
  el.append(zoneClavier);

  /** État visuel d'une case (§15.2, §15.3). */
  const etatCase = (cle) => {
    if (!parCase.has(cle)) return "block";                       // hors mot
    if (enErreur.has(cle)) return "error";
    if (parCase.get(cle).some((p) => p.resolu)) return "revealed";
    if (actif && actif.cases.some((c, i) => `${c.x},${c.y}` === cle && i === indexActif)) {
      return "active";
    }
    return pose[cle] ? "filled" : "empty";
  };

  /** Numéro affiché : seulement sur la première case d'un mot. */
  const numeroDe = (cle) => {
    const mots = parCase.get(cle) ?? [];
    const debut = mots.find((p) => `${p.cases[0].x},${p.cases[0].y}` === cle);
    return debut ? debut.num : null;
  };

  function rendre() {
    zoneGrille.replaceChildren();
    // Les dimensions de la grille sont des DONNÉES, pas des valeurs visuelles :
    // elles passent par des propriétés personnalisées, et c'est le CSS qui en
    // déduit la taille des cases.
    zoneGrille.style.setProperty("--crossword-colonnes", String(largeur));
    zoneGrille.style.setProperty("--crossword-lignes", String(hauteur));

    for (let y = 0; y < hauteur; y += 1) {
      for (let x = 0; x < largeur; x += 1) {
        const cle = `${x},${y}`;
        zoneGrille.append(Tile({
          letter: pose[cle] ?? "",
          number: numeroDe(cle),
          state: etatCase(cle),
          onClick: parCase.has(cle) ? () => choisirCase(x, y) : undefined,
        }));
      }
    }

    zoneIndices.replaceChildren(ClueList({
      items: places.map((place) => ({
        id: place.mot.id,
        num: place.num,
        dir: place.dir,
        texte: place.mot.indice?.en ?? place.mot.fr ?? "",
        solved: place.resolu,
        active: place === actif,
      })),
      onSelect: (item) => {
        const place = places.find((p) => p.mot.id === item.id);
        if (!place || place.resolu) return;
        actif = place;
        indexActif = Math.max(place.cases.findIndex((c) => !pose[`${c.x},${c.y}`]), 0);
        onClueSelect?.(item);
        rendre();
      },
    }));
  }

  /* ------------------------------------------------------------------- Saisie */

  /**
   * Tap direct sur une case. Si elle appartient à deux mots, on garde le mot
   * actif tant qu'il passe par là, sinon on bascule sur l'autre — c'est ce qui
   * permet d'écrire dans les deux sens (§15.2).
   */
  function choisirCase(x, y) {
    if (termine) return;
    const cle = `${x},${y}`;
    const mots = (parCase.get(cle) ?? []).filter((p) => !p.resolu);
    if (!mots.length) return;

    const place = mots.includes(actif) ? actif : mots[0];
    actif = place;
    indexActif = place.cases.findIndex((c) => `${c.x},${c.y}` === cle);
    rendre();
  }

  function saisir(lettre) {
    if (termine || !actif) return;
    const c = actif.cases[indexActif];
    if (!c) return;
    const cle = `${c.x},${c.y}`;
    if (verrouillees().has(cle)) return;

    // Une case au croisement appartient aux deux mots : la lettre s'affiche
    // dans les deux sens, puisqu'elle est posée sur la CASE (§15.2).
    pose[cle] = lettre;
    onLetterInput?.({ x: c.x, y: c.y, lettre, gridState: { ...pose } });

    avancerCurseur();
    rendre();
    verifierMots();
  }

  function effacer() {
    if (termine || !actif) return;
    const c = actif.cases[indexActif];
    if (!c) return;
    const cle = `${c.x},${c.y}`;
    if (verrouillees().has(cle)) return;

    delete pose[cle];
    onLetterInput?.({ x: c.x, y: c.y, lettre: null, gridState: { ...pose } });
    rendre();
  }

  /** Le focus suit la direction du mot actif (§15.2). */
  function avancerCurseur() {
    const suite = actif.cases.findIndex((c, i) => i > indexActif && !pose[`${c.x},${c.y}`]);
    if (suite !== -1) {
      indexActif = suite;
      return;
    }
    const prochain = places.find((p) => !p.resolu && p.cases.some((c) => !pose[`${c.x},${c.y}`]));
    if (prochain) {
      actif = prochain;
      indexActif = Math.max(prochain.cases.findIndex((c) => !pose[`${c.x},${c.y}`]), 0);
    }
  }

  /* --------------------------------------------------------------- Validation */

  /** §15.3 — on ne vérifie qu'un mot entièrement rempli. */
  function verifierMots() {
    for (const place of places) {
      if (place.resolu) continue;
      if (place.cases.some((c) => !pose[`${c.x},${c.y}`])) continue;
      trancher(place);
    }
  }

  function trancher(place) {
    const propose = place.cases.map((c) => pose[`${c.x},${c.y}`]).join("");
    const attendu = place.cases.map((c) => c.lettre).join("");

    if (propose === attendu) {
      place.resolu = true;
      if (actif === place) avancerCurseur();
      rendre();
      verifierFin();
      return;
    }

    // §15.3 — rouge 600 ms, puis retour à `filled`. Les cases restent
    // modifiables : on n'efface rien, contrairement au codeword.
    enErreur = new Set(place.cases.map((c) => `${c.x},${c.y}`));
    navigator.vibrate?.(30);
    rendre();
    el.querySelectorAll(".tile--error").forEach((t) => t.classList.add("tile--shake"));

    setTimeout(() => {
      enErreur = new Set();
      rendre();
    }, DUREE_ERREUR);
  }

  function verifierFin() {
    if (termine || !places.length) return;
    if (!places.every((p) => p.resolu)) return;
    termine = true;
    setTimeout(() => onComplete?.(), DUREE_FIN);
  }

  rendre();
  return el;
}
