import { SessionHeader } from "../components/molecules/session-header.js";
import { ClozeInput } from "../components/molecules/cloze-input.js";
import { WordOrder } from "../components/molecules/word-order.js";
import { MCQ } from "../components/molecules/mcq.js";
import { Button } from "../components/atoms/button.js";
import { IconButton } from "../components/atoms/icon-button.js";
import { Chip } from "../components/atoms/chip.js";
import { ProgressDots } from "../components/atoms/progress-dots.js";
import { composerSessionPhrasal, construireExercicePhrasal,
         modePhrasal } from "../services/session-builder.js";
import { appliquerResultat, aujourdhui } from "../services/leitner.js";
import { parler, taire } from "../services/audio.js";

/**
 * Phrasal — filière phrasal verbs (README §13, §3.3).
 *
 * Trois modes, jamais le rappel actif « tape l'expression entière » : trop
 * punitif sur quatre mots (§3.3). Les phrasal ont `eligible_grille: false` et
 * n'entrent donc dans aucune grille ; ils passent par le MÊME moteur Leitner
 * que le reste (§5).
 *
 * @param {{state:object, contenu:object, aller:Function, enregistrer:Function}} contexte
 * @returns {HTMLElement}
 */
export function Phrasal({ state, contenu, aller, enregistrer }) {
  const el = document.createElement("main");
  el.className = "ecran phrasal";

  const today = aujourdhui();
  const catalogue = contenu.phrasal ?? [];

  const verdicts = [];
  const sortir = () => {
    taire();
    if (verdicts.length) {
      const suivant = { ...state, words: { ...state.words } };
      for (const { id, correct } of verdicts) {
        suivant.words[id] = appliquerResultat(suivant.words[id], { succes: correct, date: today });
      }
      enregistrer(suivant, { silencieux: true });
    }
    aller("/");
  };

  el.append(SessionHeader({ title: "Phrasal verbs", onHome: sortir }));

  const corps = document.createElement("div");
  corps.className = "ecran__body";
  el.append(corps);

  if (!catalogue.length) {
    corps.append(etatVide(
      contenu.filieres?.phrasal === false
        ? "La filière phrasal verbs n'est pas encore disponible."
        : "Aucun phrasal verb n'a pu être chargé.",
      aller));
    return el;
  }

  const session = composerSessionPhrasal({ state, phrasal: catalogue, today });
  if (session.vide) {
    corps.append(etatVide("Rien à revoir dans cette filière aujourd'hui.", aller));
    return el;
  }

  const file = session.file;
  let rang = 0;

  const zone = document.createElement("div");
  zone.className = "deck";
  corps.append(zone);

  const suivant = () => {
    rang += 1;
    if (rang >= file.length) return sortir();
    rendre();
  };

  const repondu = (mot) => ({ correct }) => {
    verdicts.push({ id: mot.id, correct });
    const suite = document.createElement("div");
    suite.className = "deck__continue";
    suite.append(Button({
      label: rang + 1 >= file.length ? "Terminer" : "Continuer",
      fullWidth: true,
      onClick: suivant,
    }));
    zone.querySelector(".deck__body")?.append(suite);
  };

  function rendre() {
    zone.replaceChildren();
    const mot = file[rang];
    const mode = modePhrasal(rang);
    const exercice = construireExercicePhrasal(mot, catalogue, mode);

    zone.append(ProgressDots({ total: file.length, current: rang + 1 }));
    zone.append(entete(mot, mode));

    const corpsExercice = document.createElement("div");
    corpsExercice.className = "deck__body";

    if (exercice.type === "cloze") {
      corpsExercice.append(ClozeInput({
        sentence: exercice.sentence,
        blankIndex: exercice.blankIndex,
        expected: exercice.expected,
        translation: exercice.translation,
        onSubmit: repondu(mot),
      }));
    } else if (exercice.type === "ordre") {
      const invite = document.createElement("p");
      invite.className = "phrasal__prompt";
      invite.textContent = exercice.prompt;
      corpsExercice.append(invite);
      corpsExercice.append(WordOrder({
        tokens: exercice.tokens,
        expected: exercice.expected,
        onSubmit: repondu(mot),
      }));
    } else {
      const phrase = document.createElement("p");
      phrase.className = "phrasal__phrase";
      phrase.lang = "en";
      phrase.textContent = exercice.phrase;
      corpsExercice.append(phrase);
      corpsExercice.append(MCQ({
        question: exercice.question,
        options: exercice.options,
        correctId: exercice.correctId,
        onAnswer: ({ correct }) => repondu(mot)({ correct }),
      }));
    }

    zone.append(corpsExercice);
  }

  /** Bandeau du mot : sens littéral et sens réel, c'est ce qui débloque (§6.1). */
  function entete(mot, mode) {
    const bloc = document.createElement("div");
    bloc.className = "phrasal__head";

    const etiquettes = { cle: "Mot-clé", ordre: "Remise en ordre", particule: "Particule" };
    bloc.append(Chip({ label: etiquettes[mode] ?? mode, variant: "palier" }));

    if (mot.litteral) {
      const litteral = document.createElement("span");
      litteral.className = "phrasal__litteral";
      litteral.textContent = `mot à mot : ${mot.litteral}`;
      bloc.append(litteral);
    }

    bloc.append(IconButton({
      icon: "audio", label: `Écouter ${mot.en}`, variant: "ghost",
      onClick: () => parler(mot.exemple_en ?? mot.en),
    }));
    return bloc;
  }

  rendre();
  return el;
}

/** État vide : message et action alternative, jamais un cul-de-sac (§13). */
function etatVide(message, aller) {
  const vide = document.createElement("div");
  vide.className = "ecran__empty";

  const texte = document.createElement("p");
  texte.className = "ecran__empty-text";
  texte.textContent = message;
  vide.append(texte);

  vide.append(Button({ label: "Retour à l'accueil", fullWidth: true,
                       onClick: () => aller("/") }));
  return vide;
}
