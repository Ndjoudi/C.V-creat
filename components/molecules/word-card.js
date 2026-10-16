import { Button } from "../atoms/button.js";
import { IconButton } from "../atoms/icon-button.js";
import { Chip } from "../atoms/chip.js";
import { Divider } from "../atoms/divider.js";

/**
 * WordCard — carte de découverte, phase 1 (README §10.2, §3.1).
 * Trois canaux : écrit, audio, contexte de phrase.
 *
 * `otherSense` affiche « autre sens déjà connu : … » pour consolider au lieu
 * de créer de la confusion (README §5.2).
 *
 * @param {object}   word        entité word du contenu
 * @param {boolean}  showAudio
 * @param {?string}  otherSense  traduction d'un autre sens déjà connu
 * @param {Function} onAudio     lecture de `word.en` — la synthèse vocale est
 *                               un service, le composant ne fait que la demander
 * @param {Function} onNext
 * @returns {HTMLElement}
 */
export function WordCard({ word = {}, showAudio = true, otherSense = null,
                           onAudio, onNext } = {}) {
  const el = document.createElement("article");
  el.className = "word-card";

  const entete = document.createElement("div");
  entete.className = "word-card__head";

  const titre = document.createElement("div");
  titre.className = "word-card__titles";

  const en = document.createElement("h2");
  en.className = "word-card__en";
  en.textContent = word.en ?? "";
  titre.append(en);

  if (word.phonetique) {
    const phon = document.createElement("p");
    phon.className = "word-card__phon";
    phon.textContent = word.phonetique;
    titre.append(phon);
  }

  entete.append(titre);
  if (showAudio) {
    entete.append(IconButton({
      icon: "audio",
      label: `Écouter ${word.en ?? ""}`,
      variant: "secondary",
      onClick: onAudio,
    }));
  }
  el.append(entete);

  const fr = document.createElement("p");
  fr.className = "word-card__fr";
  fr.textContent = word.fr ?? "";
  el.append(fr);

  if (Array.isArray(word.themes) && word.themes.length) {
    const themes = document.createElement("div");
    themes.className = "word-card__themes";
    for (const theme of word.themes) themes.append(Chip({ label: theme, variant: "theme" }));
    el.append(themes);
  }

  if (otherSense) {
    const autre = document.createElement("p");
    autre.className = "word-card__other";
    autre.textContent = `autre sens déjà connu : ${otherSense}`;
    el.append(autre);
  }

  if (word.exemple_en || word.exemple_fr) {
    el.append(Divider({ spacing: 4 }));
    const exemple = document.createElement("div");
    exemple.className = "word-card__example";

    if (word.exemple_en) {
      const p = document.createElement("p");
      p.className = "word-card__example-en";
      p.lang = "en";
      p.textContent = word.exemple_en;
      exemple.append(p);
    }
    if (word.exemple_fr) {
      const p = document.createElement("p");
      p.className = "word-card__example-fr";
      p.textContent = word.exemple_fr;
      exemple.append(p);
    }
    el.append(exemple);
  }

  if (onNext) {
    el.append(Button({ label: "Suivant", fullWidth: true, onClick: onNext }));
  }

  return el;
}
