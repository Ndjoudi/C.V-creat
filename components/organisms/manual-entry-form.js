import { Button } from "../atoms/button.js";
import { Chip } from "../atoms/chip.js";
import { Spinner } from "../atoms/spinner.js";
import { Toast } from "../atoms/toast.js";
import { Divider } from "../atoms/divider.js";
import { WordListItem } from "../molecules/word-list-item.js";
import { IconButton } from "../atoms/icon-button.js";
import { disponible as microDisponible, ecouter } from "../../services/speech.js";

/**
 * ManualEntryForm — saisie, traduction, sélection des mots (README §10.3, §2.5).
 *
 * On traduit la PHRASE, pas le mot : c'est le contexte qui donne le bon sens,
 * la construction grammaticale et un ancrage épisodique (§2.5). L'utilisateur
 * choisit ensuite ce qu'il garde — un tap par mot, confirmation avant
 * enregistrement (§14, garde-fou n°3).
 *
 * Le champ de saisie libre est un <textarea> natif : aucun composant de
 * l'inventaire ne couvre la capture de texte libre, et la §10.4 confie
 * précisément cette saisie à ce composant-ci.
 *
 * @param {Function} onTranslate  reçoit le texte, renvoie une promesse de
 *                                { ok, phrase_en, phrase_fr, mots[], erreur }
 * @param {Function} onSave       reçoit les mots retenus
 * @returns {HTMLElement}
 */
export function ManualEntryForm({ onTranslate, onSave } = {}) {
  const el = document.createElement("section");
  el.className = "manual-entry";

  /* --- Saisie ------------------------------------------------------------- */

  const champ = document.createElement("textarea");
  champ.className = "manual-entry__field";
  champ.rows = 3;
  champ.lang = "en";
  champ.placeholder = "She was reluctant to give up her seat.";
  champ.setAttribute("aria-label", "Phrase anglaise à traduire");
  el.append(champ);

  const aide = document.createElement("p");
  aide.className = "manual-entry__hint";
  aide.textContent = "Colle la phrase entière, pas le mot seul : c'est le contexte qui donne le bon sens.";
  el.append(aide);

  /*
   * Micro (§15.8) : dire la phrase plutôt que la taper.
   *
   * C'est ici que la voix sert le plus : on capture un mot entendu dans la
   * vraie vie, souvent sans savoir l'écrire. Devoir l'orthographier pour
   * pouvoir le traduire est exactement l'obstacle qu'on veut lever.
   *
   * La voix AJOUTE au champ : on peut dicter une phrase, puis une autre.
   */
  if (microDisponible()) {
    const zoneMicro = document.createElement("div");
    zoneMicro.className = "manual-entry__micro";

    let ecoute = null;
    zoneMicro.append(IconButton({
      icon: "mic",
      label: "Dicter la phrase à la voix",
      variant: "secondary",
      onClick: async () => {
        if (ecoute) { ecoute.arreter(); return; }
        zoneMicro.classList.add("manual-entry__micro--actif");
        ecoute = ecouter();
        const resultat = await ecoute.promesse;
        ecoute = null;
        zoneMicro.classList.remove("manual-entry__micro--actif");

        if (!resultat.ok) {
          aide.textContent = resultat.erreur;
          return;
        }
        const separateur = champ.value.trim() ? " " : "";
        champ.value = `${champ.value.trimEnd()}${separateur}${resultat.texte}`;
        champ.focus();
      },
    }));
    el.append(zoneMicro);
  }

  const bouton = Button({
    label: "Traduire",
    icon: "pencil",
    fullWidth: true,
    onClick: () => lancer(),
  });
  el.append(bouton);

  const zone = document.createElement("div");
  zone.className = "manual-entry__result";
  el.append(zone);

  /* --- Traduction --------------------------------------------------------- */

  let enCours = false;
  const retenus = new Set();

  async function lancer() {
    if (enCours || !onTranslate) return;
    enCours = true;
    bouton.disabled = true;
    retenus.clear();

    zone.replaceChildren(Spinner({ size: "md" }));

    const verdict = await onTranslate(champ.value);

    enCours = false;
    bouton.disabled = false;

    if (!verdict?.ok) {
      zone.replaceChildren(Toast({
        message: verdict?.erreur ?? "Traduction impossible.",
        variant: "error",
        duration: 0,
      }));
      return;
    }

    afficher(verdict);
  }

  /* --- Résultat ----------------------------------------------------------- */

  function afficher(verdict) {
    zone.replaceChildren();

    const phrase = document.createElement("p");
    phrase.className = "manual-entry__phrase";
    phrase.textContent = verdict.phrase_fr ?? "";
    zone.append(phrase);

    zone.append(Divider({ spacing: 3 }));

    const titre = document.createElement("p");
    titre.className = "manual-entry__title";
    titre.textContent = "Que veux-tu garder ?";
    zone.append(titre);

    const liste = document.createElement("ul");
    liste.className = "manual-entry__words";
    zone.append(liste);

    const valider = Button({
      label: "Ajouter à la file de découverte",
      icon: "check",
      fullWidth: true,
      disabled: true,
      onClick: () => {
        if (!onSave || !retenus.size) return;
        onSave(verdict.mots.filter((m) => retenus.has(m.en)));
      },
    });

    const rendreListe = () => {
      liste.replaceChildren();

      for (const mot of verdict.mots) {
        const choisi = retenus.has(mot.en);

        const ligne = WordListItem({
          word: mot,
          actions: [{
            icon: choisi ? "check" : "plus",
            label: choisi ? `Retirer ${mot.en}` : `Garder ${mot.en}`,
            onClick: () => {
              if (choisi) retenus.delete(mot.en);
              else retenus.add(mot.en);
              rendreListe();
              valider.disabled = retenus.size === 0;
            },
          }],
        });
        ligne.classList.add("manual-entry__word");
        if (choisi) ligne.classList.add("manual-entry__word--kept");

        const notes = document.createElement("div");
        notes.className = "manual-entry__notes";

        if (mot.type) notes.append(Chip({ label: mot.type, variant: "theme" }));
        // La rétro-traduction n'a pas confirmé le sens : on le dit (§14).
        if (mot.ambigu) notes.append(Chip({ label: "sens à confirmer", variant: "source" }));
        if (mot.doublon) {
          notes.append(Chip({
            label: mot.memeSens ? "déjà dans ta liste" : "autre sens connu",
            variant: "palier",
          }));
        }
        if (notes.children.length) ligne.append(notes);

        // Avertissements calculés par l'écran : polysémie (§5.2) et palier (§14).
        for (const texte of [mot.avertissement_doublon, mot.avertissement_palier]) {
          if (!texte) continue;
          const note = document.createElement("p");
          note.className = "manual-entry__warning";
          note.textContent = texte;
          ligne.append(note);
        }

        liste.append(ligne);
      }
    };

    rendreListe();
    zone.append(valider);
  }

  return el;
}
