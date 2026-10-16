import { Button } from "../atoms/button.js";
import { IconButton } from "../atoms/icon-button.js";
import { Chip } from "../atoms/chip.js";

/**
 * TranslationPopover — s'ouvre au tap sur un mot d'indice (README §10.2, §3.5).
 *
 * Consulter est gratuit et illimité : rien n'est enregistré. Seul le bouton
 * d'ajout fait entrer le mot en file de découverte, et il disparaît quand le
 * plafond de 3 ajouts par partie est atteint (`canAdd: false`).
 *
 * @param {string}   word
 * @param {string}   translation
 * @param {boolean}  alreadyKnown  le mot est déjà au catalogue
 * @param {boolean}  canAdd        plafond d'ajouts non atteint
 * @param {Function} onAdd
 * @param {Function} onClose
 * @returns {HTMLDivElement}
 */
export function TranslationPopover({ word, translation, alreadyKnown = false,
                                     canAdd = true, onAdd, onClose } = {}) {
  const el = document.createElement("div");
  el.className = "translation-popover";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", `Traduction de ${word ?? ""}`);

  const entete = document.createElement("div");
  entete.className = "translation-popover__head";

  const mots = document.createElement("div");
  mots.className = "translation-popover__words";

  const en = document.createElement("p");
  en.className = "translation-popover__en";
  en.textContent = word ?? "";
  mots.append(en);

  const fr = document.createElement("p");
  fr.className = "translation-popover__fr";
  fr.textContent = translation ?? "";
  mots.append(fr);

  entete.append(mots);
  entete.append(IconButton({ icon: "close", label: "Fermer", variant: "ghost", onClick: onClose }));
  el.append(entete);

  if (alreadyKnown) {
    const badge = document.createElement("div");
    badge.className = "translation-popover__known";
    badge.append(Chip({ label: "déjà dans ta liste", variant: "theme" }));
    el.append(badge);
  } else if (canAdd) {
    el.append(Button({
      label: "Ajouter à la file",
      icon: "plus",
      variant: "secondary",
      fullWidth: true,
      onClick: onAdd,
    }));
  } else {
    const plafond = document.createElement("p");
    plafond.className = "translation-popover__limit";
    plafond.textContent = "3 mots déjà ajoutés aujourd'hui. Tu pourras en ajouter à la prochaine partie.";
    el.append(plafond);
  }

  return el;
}
