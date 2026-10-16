import { SessionHeader } from "../components/molecules/session-header.js";
import { Button } from "../components/atoms/button.js";
import { DiscoveryDeck } from "../components/organisms/discovery-deck.js";
import { composerDecouverte, appliquerDecouvertes } from "../services/discovery-builder.js";
import { debloquerPaliers } from "../services/session-builder.js";
import { aujourdhui } from "../services/leitner.js";
import { taire } from "../services/audio.js";

/**
 * Discovery — section §02 (README §2, §13).
 *
 * L'écran orchestre, il ne décide rien : le tri est appliqué par
 * `discoveryBuilder`, le passage de palier par `sessionBuilder`.
 *
 * Les verdicts sont accumulés puis écrits en une fois. Écrire à chaque carte
 * relancerait un rendu complet de l'écran au milieu du deck.
 *
 * @param {{state:object, contenu:object, aller:Function, enregistrer:Function}} contexte
 * @returns {HTMLElement}
 */
export function Discovery({ state, contenu, aller, enregistrer }) {
  const el = document.createElement("main");
  el.className = "ecran discovery";

  const today = aujourdhui();
  const { mots, restants } = composerDecouverte({ state, catalogue: contenu.mots });
  const verdicts = [];

  el.append(SessionHeader({
    title: "Découverte",
    onHome: () => { taire(); terminer(); },
  }));

  if (!mots.length) {
    return vide(el, aller, "Rien à découvrir : tu es à jour.");
  }

  function terminer() {
    taire();
    let suivant = appliquerDecouvertes(state, verdicts, today);
    suivant = debloquerPaliers(suivant, contenu.mots, contenu.manifeste);
    suivant = {
      ...suivant,
      progression: { ...suivant.progression, derniere_session: today },
    };
    enregistrer(suivant);
    aller("/");
  }

  const corps = document.createElement("div");
  corps.className = "session__body";
  corps.append(DiscoveryDeck({
    words: mots,
    onKnown: (mot) => verdicts.push({ id: mot.id, connu: true }),
    onUnknown: (mot) => verdicts.push({ id: mot.id, connu: false }),
    onComplete: terminer,
  }));
  el.append(corps);

  if (restants) {
    const reste = document.createElement("p");
    reste.className = "discovery__rest";
    reste.textContent = `${restants} mot${restants > 1 ? "s" : ""} encore à trier après ceux-ci.`;
    el.append(reste);
  }

  return el;
}

/** État vide : message et action alternative, jamais un cul-de-sac (§13). */
function vide(el, aller, texte) {
  const zone = document.createElement("div");
  zone.className = "ecran__empty";

  const message = document.createElement("p");
  message.className = "ecran__empty-text";
  message.textContent = texte;
  zone.append(message);

  zone.append(Button({ label: "Retour à l'accueil", fullWidth: true,
                       onClick: () => aller("/") }));
  el.append(zone);
  return el;
}
