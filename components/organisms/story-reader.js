import { Button } from "../atoms/button.js";
import { Divider } from "../atoms/divider.js";

/**
 * StoryReader — texte de l'histoire du jour (README §06, §12.3).
 *
 * Chaque mot est tappable : c'est le même geste que dans un indice de grille
 * (§15.4), et c'est ce qui rend la lecture possible même quand un mot manque.
 * Le composant ne traduit rien lui-même — il signale le tap, l'écran décide.
 *
 * La traduction française intégrale est disponible mais repliée : l'afficher
 * d'emblée supprimerait tout effort de lecture.
 *
 * @param {object}   histoire
 * @param {Function} onWordTap  reçoit le mot nettoyé, en minuscules
 * @param {Function} onFinish
 * @returns {HTMLElement}
 */
export function StoryReader({ histoire = {}, onWordTap, onFinish } = {}) {
  const el = document.createElement("article");
  el.className = "story";

  if (histoire.titre_en) {
    const titre = document.createElement("h2");
    titre.className = "story__title";
    titre.lang = "en";
    titre.textContent = histoire.titre_en;
    el.append(titre);
  }

  const texte = document.createElement("div");
  texte.className = "story__text";
  texte.lang = "en";

  for (const bloc of String(histoire.texte_en ?? "").split(/\n\s*\n/)) {
    if (!bloc.trim()) continue;
    const p = document.createElement("p");
    p.className = "story__para";

    for (const jeton of bloc.split(/(\s+)/)) {
      if (!jeton) continue;
      const nu = jeton.toLowerCase().replace(/[^a-z']/g, "");
      if (!nu) { p.append(document.createTextNode(jeton)); continue; }

      const mot = document.createElement("button");
      mot.type = "button";
      mot.className = "story__word";
      mot.textContent = jeton;
      mot.addEventListener("click", () => onWordTap?.(nu, mot));
      p.append(mot);
    }
    texte.append(p);
  }
  el.append(texte);

  if (histoire.texte_fr) {
    el.append(Divider({ spacing: 4 }));

    const traduction = document.createElement("div");
    traduction.className = "story__fr";
    traduction.hidden = true;
    for (const bloc of String(histoire.texte_fr).split(/\n\s*\n/)) {
      if (!bloc.trim()) continue;
      const p = document.createElement("p");
      p.className = "story__para";
      p.textContent = bloc.trim();
      traduction.append(p);
    }

    el.append(Button({
      label: "Voir la traduction",
      variant: "ghost",
      fullWidth: true,
      onClick: () => { traduction.hidden = !traduction.hidden; },
    }));
    el.append(traduction);
  }

  el.append(Button({
    label: "J'ai terminé",
    fullWidth: true,
    onClick: () => onFinish?.(),
  }));

  return el;
}
