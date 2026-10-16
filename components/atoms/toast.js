/**
 * Toast — confirmations et erreurs (README §10.1).
 *
 * Le composant se retire tout seul du DOM au bout de `duration`.
 * `duration: 0` le rend permanent : c'est à l'appelant de le retirer.
 *
 * @param {string} message
 * @param {string} variant   info | success | error
 * @param {number} duration  millisecondes
 * @returns {HTMLDivElement}
 */
export function Toast({ message, variant = "info", duration = 3000 } = {}) {
  const el = document.createElement("div");
  el.className = `toast toast--${variant}`;
  el.setAttribute("role", variant === "error" ? "alert" : "status");
  el.textContent = message ?? "";

  if (duration > 0) {
    setTimeout(() => el.remove(), duration);
  }

  return el;
}
