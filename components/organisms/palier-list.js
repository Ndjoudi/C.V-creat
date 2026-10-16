import { Button } from "../atoms/button.js";
import { Chip } from "../atoms/chip.js";
import { ProgressBar } from "../atoms/progress-bar.js";

/**
 * PalierList — choix de palier (README §10.3).
 *
 * Affiche TOUS les paliers déclarés au manifeste, y compris ceux qui ne sont
 * pas encore chargés : l'utilisateur voit où il va. La §2.1 décrit le
 * déblocage automatique à 80 % en boîte 3+ ; elle n'interdit pas de choisir
 * soi-même, donc aucune entrée n'est bloquée — l'état est affiché, pas imposé.
 *
 * Chaque entrée est enrichie par l'écran : `avancement` ({ mots, acquis, part,
 * atteint, charge }) et `valide`. Le composant ne calcule rien.
 *
 * @param {Array<object>} paliers
 * @param {number}        current
 * @param {Function}      onSelect  reçoit l'id du palier choisi
 * @returns {HTMLElement}
 */
export function PalierList({ paliers = [], current, onSelect } = {}) {
  const el = document.createElement("ul");
  el.className = "palier-list";

  for (const palier of paliers) {
    const id = Number(palier.id);
    const courant = id === Number(current);
    const av = palier.avancement
      ?? { mots: 0, vus: 0, acquis: 0, seuil: 0, part: 0, partVus: 0,
           atteint: false, charge: false };

    const ligne = document.createElement("li");
    ligne.className = `palier-list__item${courant ? " palier-list__item--current" : ""}`;

    const tete = document.createElement("div");
    tete.className = "palier-list__head";

    const numero = document.createElement("span");
    numero.className = "palier-list__number";
    numero.textContent = String(id);
    tete.append(numero);

    const titre = document.createElement("span");
    titre.className = "palier-list__title";
    titre.textContent = palier.titre ?? `Palier ${id}`;
    tete.append(titre);

    if (courant) tete.append(Chip({ label: "en cours", variant: "palier" }));
    else if (palier.valide) tete.append(Chip({ label: "validé", variant: "source" }));
    else if (!av.charge) tete.append(Chip({ label: "non chargé", variant: "theme" }));

    ligne.append(tete);

    // Un palier non chargé n'a pas d'avancement calculable : on n'invente pas
    // une barre à zéro qui laisserait croire à un travail perdu.
    if (av.charge) {
      // La barre suit les mots RENCONTRÉS : c'est le chiffre qui avance à
      // chaque session. Le seuil de déblocage est donné juste en dessous.
      ligne.append(ProgressBar({
        value: av.vus, max: av.mots || 1,
        variant: av.atteint ? "success" : "primary",
      }));

      const detail = document.createElement("p");
      detail.className = "palier-list__detail";
      detail.textContent = `${av.vus} / ${av.mots} mots rencontrés`;
      ligne.append(detail);

      const seuil = document.createElement("p");
      seuil.className = "palier-list__threshold";
      seuil.textContent = av.atteint
        ? `Palier acquis — ${av.acquis} mots en boîte 3+`
        : `${av.acquis} en boîte 3+ · déblocage à ${av.seuil}`;
      ligne.append(seuil);
    } else {
      const detail = document.createElement("p");
      detail.className = "palier-list__detail";
      detail.textContent = `${palier.nb_mots ?? "?"} mots, pas encore ouvert`;
      ligne.append(detail);
    }

    if (!courant && onSelect) {
      ligne.append(Button({
        label: "Travailler ce palier",
        variant: "secondary",
        fullWidth: true,
        onClick: () => onSelect(id),
      }));
    }

    el.append(ligne);
  }

  return el;
}
