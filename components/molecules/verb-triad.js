import { Button } from "../atoms/button.js";
import { estCorrect } from "../../services/normalize.js";

/**
 * VerbTriad — saisie du prétérit et du participe (README §10.2, §2.2).
 *
 * Les deux formes sont évaluées SÉPARÉMENT : le Leitner suit chacune de son
 * côté, sinon GO serait validé alors que GONE est raté (README §4).
 *
 * @param {object}   verb      { en, preterit, participe, groupe_verbe }
 * @param {boolean}  showBase  affiche la forme de base en appui
 * @param {Function} onSubmit  reçoit { preterit, participe,
 *                                      preteritCorrect, participeCorrect }
 * @returns {HTMLFormElement}
 */
export function VerbTriad({ verb = {}, showBase = true, onSubmit } = {}) {
  const el = document.createElement("form");
  el.className = "verb-triad";
  el.noValidate = true;

  if (showBase) {
    const base = document.createElement("p");
    base.className = "verb-triad__base";
    base.lang = "en";
    base.textContent = verb.en ?? "";
    el.append(base);
  }

  if (verb.fr) {
    const sens = document.createElement("p");
    sens.className = "verb-triad__fr";
    sens.textContent = verb.fr;
    el.append(sens);
  }

  const champs = document.createElement("div");
  champs.className = "verb-triad__fields";

  /** Un champ étiqueté + sa zone de verdict. */
  const creerChamp = (nom, etiquette) => {
    const bloc = document.createElement("label");
    bloc.className = "verb-triad__field";

    const titre = document.createElement("span");
    titre.className = "verb-triad__label";
    titre.textContent = etiquette;
    bloc.append(titre);

    const champ = document.createElement("input");
    champ.type = "text";
    champ.className = "verb-triad__input";
    champ.name = nom;
    champ.lang = "en";
    champ.autocomplete = "off";
    champ.autocapitalize = "none";
    champ.spellcheck = false;
    bloc.append(champ);

    const verdict = document.createElement("span");
    verdict.className = "verb-triad__verdict";
    bloc.append(verdict);

    champs.append(bloc);
    return { champ, verdict };
  };

  const preterit = creerChamp("preterit", "Prétérit");
  const participe = creerChamp("participe", "Participe passé");
  el.append(champs);

  el.append(Button({ label: "Valider", fullWidth: true, onClick: () => el.requestSubmit() }));

  let repondu = false;
  el.addEventListener("submit", (evenement) => {
    evenement.preventDefault();
    if (repondu) return;
    repondu = true;

    const resultat = {
      preterit: preterit.champ.value,
      participe: participe.champ.value,
      preteritCorrect: estCorrect(preterit.champ.value, verb.preterit),
      participeCorrect: estCorrect(participe.champ.value, verb.participe),
    };

    const marquer = ({ champ, verdict }, correct, attendu) => {
      champ.readOnly = true;
      champ.classList.add(correct ? "verb-triad__input--correct" : "verb-triad__input--wrong");
      if (!correct) verdict.textContent = String(attendu ?? "").split("|")[0].trim();
    };
    marquer(preterit, resultat.preteritCorrect, verb.preterit);
    marquer(participe, resultat.participeCorrect, verb.participe);

    if (!resultat.preteritCorrect || !resultat.participeCorrect) navigator.vibrate?.(30);
    if (onSubmit) onSubmit(resultat);
  });

  return el;
}
