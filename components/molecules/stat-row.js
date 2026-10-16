import { ICONS } from "../atoms/icons.js";

/**
 * StatRow — une ligne de l'écran de progression (README §10.2).
 *
 * @param {string}          label
 * @param {number|string}   value
 * @param {?string}         icon  clé de ICONS
 * @returns {HTMLDivElement}
 */
export function StatRow({ label, value, icon = null } = {}) {
  const el = document.createElement("div");
  el.className = "stat-row";

  if (icon && ICONS[icon]) {
    const glyphe = document.createElement("span");
    glyphe.className = "stat-row__icon";
    glyphe.innerHTML = ICONS[icon];
    el.append(glyphe);
  }

  const etiquette = document.createElement("span");
  etiquette.className = "stat-row__label";
  etiquette.textContent = label ?? "";
  el.append(etiquette);

  const valeur = document.createElement("span");
  valeur.className = "stat-row__value";
  valeur.textContent = String(value ?? "");
  el.append(valeur);

  return el;
}
