import { Tile } from "../atoms/tile.js";

/**
 * TileGroup — un mot = une suite de `Tile` (README §10.2).
 * Sert aussi bien à la phrase cachée qu'aux mots des indices.
 *
 * `activeIndex` force l'état "active" sur une case, sauf si elle est `offered` :
 * les cases offertes ne sont pas sélectionnables (README §17.1).
 *
 * @param {Array<{letter?:string, number?:number, state?:string}>} tiles
 * @param {?number}  activeIndex
 * @param {Function} onTileClick  reçoit l'index de la case
 * @returns {HTMLDivElement}
 */
export function TileGroup({ tiles = [], activeIndex = null, onTileClick } = {}) {
  const el = document.createElement("div");
  el.className = "tile-group";

  tiles.forEach((props, index) => {
    const etat = props.state ?? "empty";
    const actif = index === activeIndex && etat !== "offered";

    el.append(Tile({
      letter: props.letter ?? "",
      number: props.number ?? null,
      state: actif ? "active" : etat,
      onClick: onTileClick ? () => onTileClick(index) : undefined,
    }));
  });

  return el;
}
