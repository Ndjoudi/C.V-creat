import { Button } from "../atoms/button.js";

/** Intitulés des deux directions (README §15.2). */
const TITRES = { H: "Horizontalement", V: "Verticalement" };

/**
 * ClueList — liste numérotée des mots croisés (README §12.2).
 *
 * Séparée en deux groupes, horizontal et vertical, comme dans une grille de
 * mots croisés classique. Sélectionner une entrée arme le mot correspondant.
 *
 * @param {Array<{num:number, dir:string, texte:string, id:string, solved:boolean, active:boolean}>} items
 * @param {Function} onSelect  reçoit l'item choisi
 * @returns {HTMLElement}
 */
export function ClueList({ items = [], onSelect } = {}) {
  const el = document.createElement("div");
  el.className = "clue-list";

  for (const dir of ["H", "V"]) {
    const groupe = items.filter((item) => item.dir === dir);
    if (!groupe.length) continue;

    const bloc = document.createElement("section");
    bloc.className = "clue-list__group";

    const titre = document.createElement("h3");
    titre.className = "clue-list__title";
    titre.textContent = TITRES[dir];
    bloc.append(titre);

    const liste = document.createElement("ul");
    liste.className = "clue-list__items";

    for (const item of groupe.sort((a, b) => a.num - b.num)) {
      const ligne = document.createElement("li");
      ligne.className = "clue-list__item";
      if (item.solved) ligne.classList.add("clue-list__item--solved");
      if (item.active) ligne.classList.add("clue-list__item--active");

      const bouton = Button({
        label: `${item.num}. ${item.texte}`,
        variant: "ghost",
        fullWidth: true,
        onClick: onSelect ? () => onSelect(item) : undefined,
      });
      bouton.classList.add("clue-list__button");
      ligne.append(bouton);
      liste.append(ligne);
    }

    bloc.append(liste);
    el.append(bloc);
  }

  return el;
}
