import { Button } from "../atoms/button.js";
import { IconButton } from "../atoms/icon-button.js";
import { estCorrect } from "../../services/normalize.js";
import { disponible as microDisponible, ecouter } from "../../services/speech.js";

/**
 * InputAnswer — rappel actif FR → EN, phase 4 (README §10.2, §3.4).
 * Champ natif : en phase 4 c'est le clavier du téléphone qui sert (§17.6).
 *
 * En dictée (§08), `prompt` est vide et `onAudio` est fourni : l'énoncé est le
 * son, pas un texte. Le bouton d'écoute prend alors la place de l'intitulé.
 *
 * @param {?string}  prompt    ce qu'on demande de traduire
 * @param {string}   expected  réponse attendue, variantes séparées par « | »
 * @param {?string}  hint
 * @param {?Function} onAudio  rejoue l'énoncé sonore ; absent hors dictée
 * @param {boolean}  micro     propose de dicter la réponse à la voix
 * @param {Function} onSubmit  reçoit { value, correct }
 * @returns {HTMLFormElement}
 */
export function InputAnswer({ prompt, expected, hint = null, onAudio = null,
                              micro = true, onSubmit } = {}) {
  const el = document.createElement("form");
  el.className = "input-answer";
  el.noValidate = true;

  if (onAudio) {
    const ecoute = document.createElement("div");
    ecoute.className = "input-answer__audio";
    ecoute.append(IconButton({
      icon: "audio",
      label: "Réécouter la phrase",
      variant: "secondary",
      onClick: onAudio,
    }));
    el.append(ecoute);
  }

  if (prompt) {
    const intitule = document.createElement("p");
    intitule.className = "input-answer__prompt";
    intitule.textContent = prompt;
    el.append(intitule);
  }

  if (hint) {
    const aide = document.createElement("p");
    aide.className = "input-answer__hint";
    aide.textContent = hint;
    el.append(aide);
  }

  const champ = document.createElement("input");
  champ.type = "text";
  champ.className = "input-answer__field";
  champ.lang = "en";
  champ.autocomplete = "off";
  champ.autocapitalize = "none";
  champ.spellcheck = false;
  champ.setAttribute("aria-label", prompt ?? "Écris ce que tu entends");
  el.append(champ);

  /*
   * Micro : la voix REMPLIT le champ, elle ne valide pas.
   *
   * Un francophone qui parle anglais sera parfois mal transcrit. Valider
   * directement la transcription sanctionnerait sa prononciation en prétendant
   * juger son orthographe. On écrit donc dans le champ, et il corrige avant de
   * valider s'il le faut.
   */
  if (micro && microDisponible()) {
    const zone = document.createElement("div");
    zone.className = "input-answer__micro";

    let ecoute = null;
    const bouton = IconButton({
      icon: "mic",
      label: "Dicter la réponse à la voix",
      variant: "secondary",
      onClick: async () => {
        if (ecoute) { ecoute.arreter(); return; }
        zone.classList.add("input-answer__micro--actif");
        ecoute = ecouter();
        const resultat = await ecoute.promesse;
        ecoute = null;
        zone.classList.remove("input-answer__micro--actif");

        if (resultat.ok) { champ.value = resultat.texte; champ.focus(); return; }
        verdict.textContent = resultat.erreur;
      },
    });
    zone.append(bouton);
    el.append(zone);
  }

  const verdict = document.createElement("p");
  verdict.className = "input-answer__verdict";
  el.append(verdict);

  el.append(Button({ label: "Valider", fullWidth: true, onClick: () => el.requestSubmit() }));

  let repondu = false;
  el.addEventListener("submit", (evenement) => {
    evenement.preventDefault();
    if (repondu) return;
    repondu = true;

    const value = champ.value;
    const correct = estCorrect(value, expected);

    champ.readOnly = true;
    champ.classList.add(correct ? "input-answer__field--correct" : "input-answer__field--wrong");
    if (!correct) {
      verdict.textContent = String(expected ?? "").split("|")[0].trim();
      navigator.vibrate?.(30);
    }

    if (onSubmit) onSubmit({ value, correct });
  });

  return el;
}
