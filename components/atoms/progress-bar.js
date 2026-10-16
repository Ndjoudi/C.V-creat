/**
 * ProgressBar — progression de palier (README §10.1).
 *
 * Le ratio est transmis au CSS par la propriété personnalisée
 * --progress-bar-value : c'est une donnée, pas une valeur visuelle. Toutes les
 * couleurs et dimensions restent dans components.css.
 *
 * @param {number} value
 * @param {number} max
 * @param {string} variant  primary | success | accent
 * @returns {HTMLDivElement}
 */
export function ProgressBar({ value = 0, max = 100, variant = "primary" } = {}) {
  const borne = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;

  const el = document.createElement("div");
  el.className = `progress-bar progress-bar--${variant}`;
  el.setAttribute("role", "progressbar");
  el.setAttribute("aria-valuenow", String(value));
  el.setAttribute("aria-valuemin", "0");
  el.setAttribute("aria-valuemax", String(max));

  const fill = document.createElement("div");
  fill.className = "progress-bar__fill";
  fill.style.setProperty("--progress-bar-value", String(borne));
  el.append(fill);

  return el;
}
