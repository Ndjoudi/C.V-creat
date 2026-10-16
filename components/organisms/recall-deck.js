import { InputAnswer } from "../molecules/input-answer.js";
import { ClozeInput } from "../molecules/cloze-input.js";
import { Button } from "../atoms/button.js";
import { ProgressDots } from "../atoms/progress-dots.js";
import { Keyboard } from "../molecules/keyboard.js";

/**
 * RecallDeck — phase 4, rappel actif (README §10.3, §3.4).
 *
 * Les items sont préparés par `session-builder.construireRappel` : traduction
 * isolée pour les mots de palier, phrase source à trous pour `perso` et
 * `organique`.
 *
 * La saisie passe par le clavier virtuel, pas par celui du téléphone : ce
 * dernier apporte autocorrection et suggestions, alors que la §3.4 veut un
 * rappel « sans aide ». Le champ est donc en `inputmode="none"` (README §17.6).
 *
 * @param {Array<object>} items
 * @param {Function} onComplete  reçoit [{ id, correct }]
 * @returns {HTMLElement}
 */
export function RecallDeck({ items = [], onComplete } = {}) {
  const el = document.createElement("section");
  el.className = "deck";

  const resultats = [];
  let rang = 0;

  const suivant = () => {
    rang += 1;
    if (rang >= items.length) {
      if (onComplete) onComplete(resultats);
      return;
    }
    rendre();
  };

  /** Champ de l'exercice affiché, piloté par le clavier virtuel. */
  let champ = null;

  const clavier = Keyboard({
    disabledKeys: [],
    onKey: (lettre) => ecrire(lettre.toLowerCase()),
    onBackspace: () => ecrire(null),
  });
  clavier.classList.add("deck__keyboard");

  /** Écrit ou efface une lettre dans le champ courant. */
  const ecrire = (lettre) => {
    if (!champ || champ.readOnly) return;
    champ.value = lettre === null ? champ.value.slice(0, -1) : champ.value + lettre;
    champ.focus({ preventScroll: true });
  };

  const rendre = () => {
    el.replaceChildren();
    if (!items.length) {
      if (onComplete) onComplete(resultats);
      return;
    }

    const item = items[rang];
    el.append(ProgressDots({ total: items.length, current: rang + 1 }));

    const zone = document.createElement("div");
    zone.className = "deck__body";

    const repondu = ({ correct }) => {
      resultats.push({ id: item.mot.id, correct });
      const suite = document.createElement("div");
      suite.className = "deck__continue";
      suite.append(Button({
        label: rang + 1 >= items.length ? "Terminer" : "Continuer",
        fullWidth: true,
        onClick: suivant,
      }));
      zone.append(suite);
    };

    zone.append(item.type === "cloze"
      ? ClozeInput({
          sentence: item.sentence,
          blankIndex: item.blankIndex,
          expected: item.expected,
          translation: item.translation,
          onSubmit: repondu,
        })
      : InputAnswer({
          prompt: item.prompt,
          expected: item.expected,
          hint: null,
          onSubmit: repondu,
        }));

    // Le clavier natif ne doit jamais s'ouvrir ici : c'est le clavier virtuel
    // qui écrit. Le champ reste focalisable pour garder le curseur visible.
    champ = zone.querySelector("input");
    if (champ) {
      champ.inputMode = "none";
      champ.readOnly = false;
    }

    el.append(zone);
    el.append(clavier);
  };

  rendre();
  return el;
}
