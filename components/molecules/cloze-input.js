import { Button } from "../atoms/button.js";
import { estCorrect } from "../../services/normalize.js";

/**
 * ClozeInput — phrase à trous (README §10.2).
 * Utilisée pour les collocations et pour les mots `perso` / `organique`, dont
 * la phrase source sert d'exercice plutôt que la traduction isolée (§3.4).
 *
 * @param {string}   sentence     phrase complète, mots séparés par des espaces
 * @param {number}   blankIndex   index du mot masqué
 * @param {string}   expected     réponse attendue, variantes séparées par « | »
 * @param {?string}  translation  traduction de la phrase, affichée en appui
 * @param {Function} onSubmit     reçoit { value, correct }
 * @returns {HTMLFormElement}
 */
export function ClozeInput({ sentence = "", blankIndex = 0, expected,
                             translation = null, onSubmit } = {}) {
  const mots = String(sentence).trim().split(/\s+/).filter(Boolean);

  const el = document.createElement("form");
  el.className = "cloze-input";
  el.noValidate = true;

  const phrase = document.createElement("p");
  phrase.className = "cloze-input__sentence";
  phrase.lang = "en";

  const champ = document.createElement("input");
  champ.type = "text";
  champ.className = "cloze-input__field";
  champ.lang = "en";
  champ.autocomplete = "off";
  champ.autocapitalize = "none";
  champ.spellcheck = false;
  champ.setAttribute("aria-label", "Mot manquant");

  mots.forEach((mot, index) => {
    if (index > 0) phrase.append(document.createTextNode(" "));
    if (index === blankIndex) {
      phrase.append(champ);
      return;
    }
    const bloc = document.createElement("span");
    bloc.className = "cloze-input__word";
    bloc.textContent = mot;
    phrase.append(bloc);
  });
  el.append(phrase);

  if (translation) {
    const trad = document.createElement("p");
    trad.className = "cloze-input__translation";
    trad.textContent = translation;
    el.append(trad);
  }

  const verdict = document.createElement("p");
  verdict.className = "cloze-input__verdict";
  el.append(verdict);

  el.append(Button({ label: "Valider", fullWidth: true, onClick: () => el.requestSubmit() }));

  const attendu = expected ?? mots[blankIndex] ?? "";
  let repondu = false;

  el.addEventListener("submit", (evenement) => {
    evenement.preventDefault();
    if (repondu) return;
    repondu = true;

    const value = champ.value;
    const correct = estCorrect(value, attendu);

    champ.readOnly = true;
    champ.classList.add(correct ? "cloze-input__field--correct" : "cloze-input__field--wrong");
    if (!correct) {
      verdict.textContent = String(attendu).split("|")[0].trim();
      navigator.vibrate?.(30);
    }

    if (onSubmit) onSubmit({ value, correct });
  });

  return el;
}
