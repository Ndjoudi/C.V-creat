/**
 * Chip — thème, palier ou badge de filière (README §10.1).
 *
 * @param {string} label
 * @param {string} variant  theme | palier | source | success
 * @returns {HTMLSpanElement}
 */
export function Chip({ label, variant = "theme" } = {}) {
  const el = document.createElement("span");
  el.className = `chip chip--${variant}`;
  el.textContent = label ?? "";
  return el;
}
