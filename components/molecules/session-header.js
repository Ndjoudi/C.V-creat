import { IconButton } from "../atoms/icon-button.js";

/**
 * SessionHeader — en-tête de TOUTE session (README §10.2).
 *
 * `progress` est un élément déjà construit — typiquement un `ProgressDots`
 * ou une `ProgressBar` — sur le modèle de `ClueRow`.
 *
 * @param {string}       title
 * @param {Function}     onHome
 * @param {Function}     onMenu
 * @param {?HTMLElement} progress
 * @returns {HTMLElement}
 */
export function SessionHeader({ title, onHome, onMenu, progress = null } = {}) {
  const el = document.createElement("header");
  el.className = "session-header";

  const barre = document.createElement("div");
  barre.className = "session-header__bar";

  barre.append(onHome
    ? IconButton({ icon: "home", label: "Accueil", variant: "ghost", onClick: onHome })
    : document.createElement("span"));

  const titre = document.createElement("h1");
  titre.className = "session-header__title";
  titre.textContent = title ?? "";
  barre.append(titre);

  barre.append(onMenu
    ? IconButton({ icon: "settings", label: "Menu", variant: "ghost", onClick: onMenu })
    : document.createElement("span"));

  el.append(barre);

  if (progress) {
    const zone = document.createElement("div");
    zone.className = "session-header__progress";
    zone.append(progress);
    el.append(zone);
  }

  return el;
}
