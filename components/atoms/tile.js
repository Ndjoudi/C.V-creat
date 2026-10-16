/**
 * Tile — TOUTE case lettre de l'application : grille, indices et phrase
 * cachée partagent ce composant, seul `state` change (README §10.4).
 *
 * Les cases `offered` sont verrouillées : ni éditables, ni sélectionnables
 * (README §17.1).
 *
 * @param {string}   letter  lettre affichée, vide si la case n'est pas remplie
 * @param {?number}  number  numéro du codeword, masqué si null
 * @param {string}   state   empty | filled | active | offered | error | revealed | block
 * @param {Function} onClick
 * @returns {HTMLButtonElement}
 */
export function Tile({ letter = "", number = null, state = "empty", onClick } = {}) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `tile tile--${state}`;
  // `offered` est verrouillée (§15.1) ; `block` est hors mot, elle n'existe
  // que pour occuper la case dans la grille de mots croisés (§15.2).
  el.disabled = state === "offered" || state === "block";

  if (number !== null && number !== undefined) {
    const num = document.createElement("span");
    num.className = "tile__number";
    num.textContent = String(number);
    el.append(num);
  }

  const glyph = document.createElement("span");
  glyph.className = "tile__letter";
  glyph.textContent = letter ?? "";
  el.append(glyph);

  el.setAttribute("aria-label", letter ? letter : `case ${number ?? ""}`.trim());

  if (onClick) el.addEventListener("click", onClick);
  return el;
}
