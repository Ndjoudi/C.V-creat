import { Button } from "../atoms/button.js";
import { Counter } from "../atoms/counter.js";

/**
 * SectionCard — une des six cartes de l'écran principal (README §13, §12.2).
 *
 * Une carte dit trois choses et rien de plus : ce qu'est la section, combien
 * elle contient, et si on peut y entrer. Une section verrouillée ne cache pas
 * son bouton, elle explique **pourquoi** et **quand** elle s'ouvrira : un
 * bouton qui disparaît laisse l'utilisateur sans explication.
 *
 * @param {number}   numero    01 à 06, affiché tel quel
 * @param {string}   titre
 * @param {?number}  compteur  null si la section n'a rien à compter
 * @param {string}   uniteCompteur
 * @param {string}   icone     nom d'icône pour le compteur
 * @param {string}   etat      ouvert | vide | verrouille
 * @param {string}   message   affiché quand l'état n'est pas « ouvert »
 * @param {string}   action    libellé du bouton
 * @param {Function} onOpen
 * @returns {HTMLElement}
 */
export function SectionCard({ numero, titre, compteur = null, uniteCompteur = "",
                              icone = "book", etat = "ouvert", message = "",
                              action = "Ouvrir", onOpen } = {}) {
  const el = document.createElement("article");
  el.className = `section-card section-card--${etat}`;

  const entete = document.createElement("div");
  entete.className = "section-card__head";

  const rang = document.createElement("span");
  rang.className = "section-card__num";
  rang.textContent = String(numero).padStart(2, "0");
  entete.append(rang);

  const nom = document.createElement("h2");
  nom.className = "section-card__title";
  nom.textContent = titre;
  entete.append(nom);

  if (etat === "ouvert" && compteur !== null) {
    entete.append(Counter({ value: compteur, icon: icone, label: uniteCompteur }));
  }
  el.append(entete);

  if (etat === "ouvert") {
    el.append(Button({ label: action, fullWidth: true, onClick: onOpen }));
    return el;
  }

  const texte = document.createElement("p");
  texte.className = "section-card__message";
  texte.textContent = message;
  el.append(texte);

  return el;
}
