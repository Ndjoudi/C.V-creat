import { WordListItem } from "../molecules/word-list-item.js";
import { Divider } from "../atoms/divider.js";

/**
 * WordList — liste de mots groupée (README §12.3).
 *
 * Deux écrans en ont besoin avec la même forme : les mots ajoutés (§01) et le
 * suivi d'apprentissage (§04, « en attente » / « appris »). Le composant ne
 * connaît ni l'un ni l'autre : il reçoit des groupes déjà constitués.
 *
 * Un groupe vide affiche son message plutôt que de disparaître : une section
 * absente laisse l'utilisateur se demander s'il a mal cherché.
 *
 * @param {Array<{titre:string, mots:object[], vide?:string}>} groupes
 * @param {boolean}  showBox   afficher la boîte Leitner de chaque mot
 * @param {Function} actions   reçoit un mot, renvoie ses actions
 * @returns {HTMLElement}
 */
export function WordList({ groupes = [], showBox = false, actions = null } = {}) {
  const el = document.createElement("section");
  el.className = "word-list";

  groupes.forEach((groupe, rang) => {
    if (rang > 0) el.append(Divider({ spacing: 4 }));

    const entete = document.createElement("h3");
    entete.className = "word-list__title";
    entete.textContent = groupe.mots.length
      ? `${groupe.titre} (${groupe.mots.length})`
      : groupe.titre;
    el.append(entete);

    if (!groupe.mots.length) {
      const vide = document.createElement("p");
      vide.className = "word-list__empty";
      vide.textContent = groupe.vide ?? "Rien ici pour l'instant.";
      el.append(vide);
      return;
    }

    const liste = document.createElement("ul");
    liste.className = "word-list__items";
    for (const mot of groupe.mots) {
      liste.append(WordListItem({
        word: mot,
        showBox,
        actions: actions ? actions(mot) : [],
      }));
    }
    el.append(liste);
  });

  return el;
}
