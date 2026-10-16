/**
 * ClueRow — une ligne d'indice complète (README §10.2).
 *
 * Reçoit des composants déjà construits, elle ne les fabrique pas :
 * `clue` est un `ClueText`, `tiles` un `TileGroup`.
 *
 * @param {HTMLElement} clue
 * @param {HTMLElement} tiles
 * @param {boolean}     solved  indice grisé, mot résolu (README §17.2)
 * @returns {HTMLDivElement}
 */
export function ClueRow({ clue, tiles, solved = false } = {}) {
  const el = document.createElement("div");
  el.className = `clue-row${solved ? " clue-row--solved" : ""}`;
  if (clue) el.append(clue);
  if (tiles) el.append(tiles);
  return el;
}
