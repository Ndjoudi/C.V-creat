import { MCQ } from "../molecules/mcq.js";
import { Button } from "../atoms/button.js";
import { ProgressDots } from "../atoms/progress-dots.js";

/**
 * AnchorDeck — phase 2, séquence de `MCQ` (README §10.3, §3.2).
 *
 * Chaque entrée de `words` est un mot ENRICHI par `session-builder` de ses
 * champs `options` et `correctId` : le choix des distracteurs est de la
 * logique métier, elle reste dans le service.
 *
 * Objectif : consolider, pas tester. On passe automatiquement après une bonne
 * réponse, on attend un geste après une mauvaise (README §17.7).
 *
 * @param {Array<object>} words
 * @param {Function} onComplete  reçoit la liste des résultats
 * @returns {HTMLElement}
 */
export function AnchorDeck({ words = [], onComplete } = {}) {
  const el = document.createElement("section");
  el.className = "deck";

  const resultats = [];
  let rang = 0;

  const suivant = () => {
    rang += 1;
    if (rang >= words.length) {
      if (onComplete) onComplete(resultats);
      return;
    }
    rendre();
  };

  const rendre = () => {
    el.replaceChildren();
    if (!words.length) {
      if (onComplete) onComplete(resultats);
      return;
    }

    const item = words[rang];
    el.append(ProgressDots({ total: words.length, current: rang + 1 }));

    const zone = document.createElement("div");
    zone.className = "deck__body";
    zone.append(MCQ({
      question: item.question ?? item.fr,
      options: item.options ?? [],
      correctId: item.correctId ?? item.id,
      onAnswer: ({ correct }) => {
        resultats.push({ id: item.id, correct });
        if (correct) {
          setTimeout(suivant, 700);
        } else {
          zone.append(reprise());
        }
      },
    }));
    el.append(zone);
  };

  /** Après une erreur, la bonne réponse reste à l'écran jusqu'au tap. */
  const reprise = () => {
    const zone = document.createElement("div");
    zone.className = "deck__continue";
    zone.append(Button({ label: "Continuer", fullWidth: true, onClick: suivant }));
    return zone;
  };

  rendre();
  return el;
}
