/**
 * Spinner — attente réseau, uniquement pour la saisie manuelle (README §10.1).
 *
 * @param {string} size  sm | md | lg
 * @returns {HTMLDivElement}
 */
export function Spinner({ size = "md" } = {}) {
  const el = document.createElement("div");
  el.className = `spinner spinner--${size}`;
  el.setAttribute("role", "status");
  el.setAttribute("aria-label", "Chargement");
  return el;
}
