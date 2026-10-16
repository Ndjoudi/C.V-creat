/**
 * ClueText — indice en anglais dont chaque segment est tappable (README §10.2).
 *
 * La zone tappable est le SEGMENT, pas le mot : « don't give up » est un seul
 * segment (README §3.5). Le découpage vient du contenu, il n'est jamais
 * détecté à l'exécution.
 *
 * Un segment dont `trad` vaut null est un mot-outil : affiché, non tappable.
 *
 * NOTE — le segment tappable est un <button> natif. L'inventaire §10 ne
 * contient aucun atom de « mot tappable en ligne » : `Button` est une pastille
 * de 44px de haut, inutilisable au fil d'une phrase. C'est la seule entorse du
 * projet à la règle §10.4, et elle est confinée à ce composant.
 *
 * @param {Array<{txt:string, trad:?string, ref:?string}>} segments
 * @param {Function} onWordTap  reçoit (segment, index, élément)
 * @returns {HTMLParagraphElement}
 */
export function ClueText({ segments = [], onWordTap } = {}) {
  const el = document.createElement("p");
  el.className = "clue-text";

  segments.forEach((segment, index) => {
    if (index > 0) el.append(document.createTextNode(" "));

    if (!segment.trad) {
      const mot = document.createElement("span");
      mot.className = "clue-text__tool";
      mot.textContent = segment.txt;
      el.append(mot);
      return;
    }

    const mot = document.createElement("button");
    mot.type = "button";
    mot.className = "clue-text__word";
    mot.textContent = segment.txt;
    if (onWordTap) {
      mot.addEventListener("click", () => onWordTap(segment, index, mot));
    }
    el.append(mot);
  });

  return el;
}
