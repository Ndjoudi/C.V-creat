/**
 * Divider — séparation de sections (README §10.1).
 *
 * @param {number} spacing  échelon de l'échelle --sp-* : 1 à 7
 * @returns {HTMLHRElement}
 */
export function Divider({ spacing = 4 } = {}) {
  const echelon = Math.min(Math.max(Math.round(spacing), 1), 7);
  const el = document.createElement("hr");
  el.className = `divider divider--sp-${echelon}`;
  return el;
}
