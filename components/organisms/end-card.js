import { Button } from "../atoms/button.js";
import { WordListItem } from "../molecules/word-list-item.js";
import { Divider } from "../atoms/divider.js";

/**
 * EndCard — contexte de la partie et liste des mots appris (README §10.3).
 *
 * `partie` est optionnelle : tant que la phase 3 n'existe pas, il n'y a pas de
 * phrase cachée à commenter et la carte n'affiche que les mots travaillés.
 *
 * @param {?object}  partie
 * @param {object[]} words
 * @param {string}   actionLabel  libellé du bouton de sortie
 * @param {Function} onContinue
 * @returns {HTMLElement}
 */
export function EndCard({ partie = null, words = [], actionLabel = "Terminer",
                          onContinue } = {}) {
  const el = document.createElement("section");
  el.className = "end-card";

  if (partie?.phrase_en) {
    const phrase = document.createElement("p");
    phrase.className = "end-card__phrase";
    phrase.lang = "en";
    phrase.textContent = partie.phrase_en;
    el.append(phrase);

    if (partie.phrase_fr) {
      const fr = document.createElement("p");
      fr.className = "end-card__phrase-fr";
      fr.textContent = partie.phrase_fr;
      el.append(fr);
    }

    if (partie.contexte_fr) {
      const contexte = document.createElement("p");
      contexte.className = "end-card__context";
      contexte.textContent = partie.contexte_fr;
      el.append(contexte);
    }

    el.append(Divider({ spacing: 4 }));
  }

  const titre = document.createElement("h2");
  titre.className = "end-card__title";
  titre.textContent = words.length === 1
    ? "1 mot travaillé"
    : `${words.length} mots travaillés`;
  el.append(titre);

  const liste = document.createElement("ul");
  liste.className = "end-card__list";
  for (const mot of words) liste.append(WordListItem({ word: mot }));
  el.append(liste);

  if (onContinue) {
    el.append(Button({ label: actionLabel, fullWidth: true, onClick: onContinue }));
  }

  return el;
}
