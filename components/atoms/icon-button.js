import { ICONS } from "./icons.js";

/**
 * IconButton — bouton sans texte : accueil, menu, audio, ajout (README §10.1).
 *
 * @param {string}          icon     clé de ICONS
 * @param {string}          label    libellé accessible, obligatoire
 * @param {string}          variant  primary | secondary | ghost | danger
 * @param {?(number|string)} badge   pastille de comptage, masquée si nulle
 * @param {Function}        onClick
 * @returns {HTMLButtonElement}
 */
export function IconButton({ icon, label, variant = "ghost",
                             badge = null, onClick } = {}) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `icon-btn icon-btn--${variant}`;
  el.setAttribute("aria-label", label ?? "");
  if (icon && ICONS[icon]) el.innerHTML = ICONS[icon];

  if (badge !== null && badge !== undefined && badge !== "") {
    const pastille = document.createElement("span");
    pastille.className = "icon-btn__badge";
    pastille.textContent = String(badge);
    el.append(pastille);
  }

  if (onClick) el.addEventListener("click", onClick);
  return el;
}
