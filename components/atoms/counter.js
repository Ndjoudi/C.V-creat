import { ICONS } from "./icons.js";

/**
 * Counter — streak, compteur de session (README §10.1).
 *
 * @param {number|string} value
 * @param {?string}       icon   clé de ICONS
 * @param {?string}       label
 * @returns {HTMLDivElement}
 */
export function Counter({ value = 0, icon = null, label = null } = {}) {
  const el = document.createElement("div");
  el.className = "counter";

  if (icon && ICONS[icon]) {
    const glyph = document.createElement("span");
    glyph.className = "counter__icon";
    glyph.innerHTML = ICONS[icon];
    el.append(glyph);
  }

  const nombre = document.createElement("span");
  nombre.className = "counter__value";
  nombre.textContent = String(value);
  el.append(nombre);

  if (label) {
    const texte = document.createElement("span");
    texte.className = "counter__label";
    texte.textContent = label;
    el.append(texte);
  }

  return el;
}
