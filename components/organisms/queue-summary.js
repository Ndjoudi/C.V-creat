import { Button } from "../atoms/button.js";
import { WordListItem } from "../molecules/word-list-item.js";

/**
 * QueueSummary — récapitulatif des ajouts organiques (README §10.3, §3.5).
 *
 * Un mot ajouté pendant une partie n'entre jamais dans la session en cours :
 * il attend la suivante. L'écran le dit explicitement.
 *
 * @param {object[]} words
 * @param {Function} onClose
 * @returns {HTMLElement}
 */
export function QueueSummary({ words = [], onClose } = {}) {
  const el = document.createElement("section");
  el.className = "queue-summary";

  const titre = document.createElement("h2");
  titre.className = "queue-summary__title";
  titre.textContent = words.length === 1
    ? "1 mot ajouté aujourd'hui"
    : `${words.length} mots ajoutés aujourd'hui`;
  el.append(titre);

  const liste = document.createElement("ul");
  liste.className = "queue-summary__list";
  for (const mot of words) liste.append(WordListItem({ word: mot }));
  el.append(liste);

  const note = document.createElement("p");
  note.className = "queue-summary__note";
  note.textContent = "Tu les découvriras demain.";
  el.append(note);

  if (onClose) {
    el.append(Button({ label: "Terminer", fullWidth: true, onClick: onClose }));
  }

  return el;
}
