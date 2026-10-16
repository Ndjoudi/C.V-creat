import { Button } from "../atoms/button.js";
import { estCorrect } from "../../services/normalize.js";

/**
 * WordOrder — remise en ordre, filière phrasal verbs (README §10.2, §3.6).
 *
 * On tape un jeton pour le poser, on tape un jeton posé pour le reprendre.
 * Jamais de saisie clavier : « tape l'expression entière » est trop punitif
 * pour cette filière (README §3.6).
 *
 * @param {string[]} tokens    jetons proposés, déjà mélangés par l'appelant
 * @param {string}   expected  phrase attendue, variantes séparées par « | »
 * @param {Function} onSubmit  reçoit { value, correct }
 * @returns {HTMLElement}
 */
export function WordOrder({ tokens = [], expected, onSubmit } = {}) {
  const el = document.createElement("section");
  el.className = "word-order";

  const reponse = document.createElement("div");
  reponse.className = "word-order__answer";
  el.append(reponse);

  const reserve = document.createElement("div");
  reserve.className = "word-order__pool";
  el.append(reserve);

  const verdict = document.createElement("p");
  verdict.className = "word-order__verdict";
  el.append(verdict);

  const valider = Button({ label: "Valider", fullWidth: true, disabled: true,
                           onClick: () => soumettre() });
  el.append(valider);

  const poses = [];
  let repondu = false;

  const rendre = () => {
    reponse.replaceChildren();
    reserve.replaceChildren();

    poses.forEach((jeton, rang) => {
      const bouton = Button({
        label: jeton.mot, variant: "primary", disabled: repondu,
        onClick: () => { poses.splice(rang, 1); rendre(); },
      });
      bouton.classList.add("word-order__token");
      reponse.append(bouton);
    });

    tokens.forEach((mot, index) => {
      if (poses.some((j) => j.index === index)) return;
      const bouton = Button({
        label: mot, variant: "secondary", disabled: repondu,
        onClick: () => { poses.push({ mot, index }); rendre(); },
      });
      bouton.classList.add("word-order__token");
      reserve.append(bouton);
    });

    valider.disabled = repondu || poses.length === 0;
  };

  function soumettre() {
    if (repondu || poses.length === 0) return;
    repondu = true;

    const value = poses.map((j) => j.mot).join(" ");
    const correct = estCorrect(value, expected);

    reponse.classList.add(correct ? "word-order__answer--correct" : "word-order__answer--wrong");
    if (!correct) {
      verdict.textContent = String(expected ?? "").split("|")[0].trim();
      navigator.vibrate?.(30);
    }
    rendre();

    if (onSubmit) onSubmit({ value, correct });
  }

  rendre();
  return el;
}
