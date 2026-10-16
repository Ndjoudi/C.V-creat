import { Button } from "../atoms/button.js";

/**
 * MCQ — ancrage (phase 2) et discrimination de particule (README §10.2, §3.6).
 *
 * Le composant ne fait qu'afficher le verdict (README §17.7) : bordure verte
 * ou rouge, bonne réponse révélée en cas d'erreur. C'est l'écran qui décide
 * quand passer à la question suivante.
 *
 * `question` accepte une chaîne ou un élément : le quizz (§03) y place la
 * définition tappable du mot plutôt qu'une simple phrase.
 *
 * @param {string|Node} question
 * @param {Array<{id:string, label:string}>} options
 * @param {string} correctId
 * @param {Function} onAnswer  reçoit { optionId, correct }
 * @returns {HTMLElement}
 */
export function MCQ({ question, options = [], correctId, onAnswer } = {}) {
  const el = document.createElement("section");
  el.className = "mcq";

  if (question instanceof Node) {
    question.classList?.add("mcq__question");
    el.append(question);
  } else if (question) {
    const intitule = document.createElement("p");
    intitule.className = "mcq__question";
    intitule.textContent = question;
    el.append(intitule);
  }

  const liste = document.createElement("div");
  liste.className = "mcq__options";
  const boutons = new Map();
  let repondu = false;

  for (const option of options) {
    const bouton = Button({
      label: option.label,
      variant: "secondary",
      fullWidth: true,
      onClick: () => repondre(option.id),
    });
    bouton.classList.add("mcq__option");
    boutons.set(option.id, bouton);
    liste.append(bouton);
  }
  el.append(liste);

  function repondre(optionId) {
    if (repondu) return;
    repondu = true;

    const correct = optionId === correctId;
    boutons.forEach((bouton, id) => {
      bouton.disabled = true;
      if (id === correctId) bouton.classList.add("mcq__option--correct");
      else if (id === optionId) bouton.classList.add("mcq__option--wrong");
    });

    if (!correct) navigator.vibrate?.(30);
    if (onAnswer) onAnswer({ optionId, correct });
  }

  return el;
}
