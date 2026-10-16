import { Button } from "../atoms/button.js";
import { IconButton } from "../atoms/icon-button.js";

/** Dispositions à 3 rangées, 26 touches (README §17.6). */
const DISPOSITIONS = {
  azerty: ["AZERTYUIOP", "QSDFGHJKLM", "WXCVBN"],
  qwerty: ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"],
};

/** Disposition par défaut : l'utilisateur est francophone. */
export const DISPOSITION_DEFAUT = "azerty";

/**
 * Keyboard — clavier virtuel UNIQUE de l'application (README §10.2, §10.4).
 * Un seul exemplaire dans le DOM à la fois.
 *
 * Aucune touche espace, aucune touche entrée : la validation est automatique
 * dès qu'un mot est complet (README §17.6). Le clavier natif du téléphone
 * n'est jamais invoqué en phase 3, les cases ne sont pas des <input>.
 *
 * @param {string}   layout        "azerty" ou "qwerty"
 * @param {string[]} disabledKeys  lettres grisées
 * @param {Function} onKey         reçoit la lettre majuscule
 * @param {Function} onBackspace
 * @returns {HTMLDivElement}
 */
export function Keyboard({ layout = DISPOSITION_DEFAUT, disabledKeys = [],
                           onKey, onBackspace } = {}) {
  const rangees = DISPOSITIONS[layout] ?? DISPOSITIONS[DISPOSITION_DEFAUT];
  const grisees = new Set(disabledKeys.map((k) => String(k).toUpperCase()));

  const el = document.createElement("div");
  el.className = "keyboard";

  rangees.forEach((rangee, index) => {
    const ligne = document.createElement("div");
    ligne.className = "keyboard__row";

    for (const lettre of rangee) {
      ligne.append(Button({
        label: lettre,
        variant: "secondary",
        disabled: grisees.has(lettre),
        onClick: onKey ? () => onKey(lettre) : undefined,
      }));
    }

    // Le retour arrière ferme la dernière rangée. ICONS n'a pas de glyphe
    // dédié : `back` (flèche vers la gauche) en tient lieu.
    if (index === rangees.length - 1) {
      ligne.append(IconButton({
        icon: "back",
        label: "Effacer la lettre",
        variant: "secondary",
        onClick: onBackspace,
      }));
    }

    el.append(ligne);
  });

  return el;
}
