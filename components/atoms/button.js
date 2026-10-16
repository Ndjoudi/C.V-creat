import { ICONS } from "./icons.js";

/**
 * Button — TOUT bouton textuel de l'application (README §10.1).
 * Aucun <button> brut ailleurs dans le projet.
 *
 * @param {string}   label      texte du bouton
 * @param {string}   variant    primary | secondary | ghost | danger
 * @param {?string}  icon       clé de ICONS, jamais du SVG brut
 * @param {boolean}  disabled
 * @param {boolean}  fullWidth
 * @param {Function} onClick
 * @returns {HTMLButtonElement}
 */
export function Button({ label, variant = "primary", icon = null,
                         disabled = false, fullWidth = false, onClick } = {}) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `btn btn--${variant}${fullWidth ? " btn--full" : ""}`;
  el.disabled = Boolean(disabled);

  if (icon && ICONS[icon]) {
    const glyph = document.createElement("span");
    glyph.className = "btn__icon";
    glyph.innerHTML = ICONS[icon];
    el.append(glyph);
  }

  const text = document.createElement("span");
  text.className = "btn__label";
  text.textContent = label ?? "";
  el.append(text);

  if (onClick) el.addEventListener("click", onClick);
  return el;
}
