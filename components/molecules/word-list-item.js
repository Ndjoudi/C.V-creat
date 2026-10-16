import { IconButton } from "../atoms/icon-button.js";
import { Chip } from "../atoms/chip.js";

/**
 * WordListItem — ligne de mot dans TOUTE liste de l'application (§10.2, §10.4).
 *
 * `showBox` affiche la boîte Leitner. Elle vit dans l'état, pas dans le mot :
 * c'est à l'écran de fournir un objet enrichi du champ `b` (README §5.4).
 *
 * @param {object} word     entité word, éventuellement enrichie de `b`
 * @param {boolean} showBox
 * @param {Array<{icon:string, label:string, onClick:Function}>} actions
 * @returns {HTMLLIElement}
 */
export function WordListItem({ word = {}, showBox = false, actions = [] } = {}) {
  const el = document.createElement("li");
  el.className = "word-list-item";

  const textes = document.createElement("div");
  textes.className = "word-list-item__texts";

  const en = document.createElement("p");
  en.className = "word-list-item__en";
  en.lang = "en";
  en.textContent = word.en ?? "";
  textes.append(en);

  const fr = document.createElement("p");
  fr.className = "word-list-item__fr";
  fr.textContent = word.fr ?? "";
  textes.append(fr);

  el.append(textes);

  if (showBox && word.b !== undefined && word.b !== null) {
    el.append(Chip({ label: `boîte ${word.b}`, variant: "palier" }));
  }

  if (actions.length) {
    const zone = document.createElement("div");
    zone.className = "word-list-item__actions";
    for (const action of actions) {
      zone.append(IconButton({
        icon: action.icon,
        label: action.label,
        variant: "ghost",
        onClick: action.onClick,
      }));
    }
    el.append(zone);
  }

  return el;
}
