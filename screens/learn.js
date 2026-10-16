import { SessionHeader } from "../components/molecules/session-header.js";
import { ProgressDots } from "../components/atoms/progress-dots.js";
import { Button } from "../components/atoms/button.js";
import { MCQ } from "../components/molecules/mcq.js";
import { InputAnswer } from "../components/molecules/input-answer.js";
import { ClozeInput } from "../components/molecules/cloze-input.js";
import { WordList } from "../components/organisms/word-list.js";
import { composerApprentissage, appliquerApprentissage } from "../services/learn-builder.js";
import { debloquerPaliers } from "../services/session-builder.js";
import { aujourdhui, prochaineEcheanceApprentissage,
         STATUTS_CONNUS } from "../services/leitner.js";

/** Délai d'affichage du verdict avant de passer à la suite, en millisecondes. */
const DUREE_VERDICT = 900;

/**
 * Learn — section §03 (README §2, §13).
 *
 * Chaque mot passe par DEUX exercices, toujours dans le même ordre : QUIZ puis
 * écriture. Les deux doivent être réussis pour que le mot monte d'une boîte —
 * reconnaître n'est pas savoir écrire.
 *
 * @param {{state:object, contenu:object, aller:Function, enregistrer:Function}} contexte
 * @returns {HTMLElement}
 */
export function Learn({ state, contenu, aller, enregistrer }) {
  const el = document.createElement("main");
  el.className = "ecran learn";

  const today = aujourdhui();
  const { exercices } = composerApprentissage({ state, catalogue: contenu.mots, today });

  if (!exercices.length) {
    const prochaine = prochaineEcheanceApprentissage(state, today);
    vide(el, aller, prochaine
      ? `Rien à apprendre aujourd'hui. Prochain mot le ${prochaine}.`
      : "Rien à apprendre aujourd'hui. Passe par la découverte ou le quizz.");
    el.append(listeApprentissage(state, contenu));
    return el;
  }

  /** Rang du mot courant, et étape dans ce mot. */
  let rang = 0;
  let etape = "quiz";
  const resultats = new Map();

  const corps = document.createElement("div");
  corps.className = "session__body";

  const terminer = () => {
    let suivant = state;
    for (const [id, verdict] of resultats) {
      suivant = appliquerApprentissage(suivant, id, verdict, today);
    }
    suivant = debloquerPaliers(suivant, contenu.mots, contenu.manifeste);
    suivant = {
      ...suivant,
      progression: { ...suivant.progression, derniere_session: today },
    };
    enregistrer(suivant);
    aller("/");
  };

  const noter = (id, champ, correct) => {
    const courant = resultats.get(id) ?? { quizCorrect: false, ecritureCorrecte: false };
    resultats.set(id, { ...courant, [champ]: correct });
  };

  const suivant = () => {
    if (etape === "quiz") { etape = "ecriture"; rendre(); return; }
    etape = "quiz";
    rang += 1;
    if (rang >= exercices.length) { terminer(); return; }
    rendre();
  };

  const rendre = () => {
    const { mot, quiz, ecriture } = exercices[rang];
    el.replaceChildren();
    el.append(SessionHeader({
      title: etape === "quiz" ? "Reconnaître" : "Écrire",
      onHome: () => aller("/"),
      progress: ProgressDots({ total: exercices.length, current: rang + 1 }),
    }));
    corps.replaceChildren();
    el.append(corps);

    if (etape === "quiz") {
      corps.append(MCQ({
        ...quiz,
        onAnswer: ({ correct }) => {
          noter(mot.id, "quizCorrect", correct);
          setTimeout(suivant, DUREE_VERDICT);
        },
      }));
      return;
    }

    // L'écriture reprend la forme choisie par `construireRappel` : phrase à
    // trous pour un mot capturé en contexte, traduction isolée sinon.
    const apres = ({ correct }) => {
      noter(mot.id, "ecritureCorrecte", correct);
      setTimeout(suivant, DUREE_VERDICT);
    };

    corps.append(ecriture.type === "cloze"
      ? ClozeInput({
          sentence: ecriture.sentence,
          blankIndex: ecriture.blankIndex,
          expected: ecriture.expected,
          translation: ecriture.translation,
          onSubmit: apres,
        })
      : InputAnswer({
          prompt: ecriture.prompt,
          expected: ecriture.expected,
          onSubmit: apres,
        }));
  };

  rendre();
  return el;
}

/**
 * Suivi d'apprentissage (§04) : où en est chaque mot du circuit.
 *
 * Trois états, dans l'ordre du parcours. « En attente » n'est pas une file
 * morte : c'est le délai de deux jours qui court, et le dire évite de croire
 * qu'un mot a été oublié.
 *
 * @param {object} state
 * @param {object} contenu
 * @returns {HTMLElement}
 */
function listeApprentissage(state, contenu) {
  const perso = new Map((state.perso ?? []).map((m) => [m.id, m]));
  const resoudre = ([id, fiche]) => {
    const mot = contenu.mots.get(id) ?? perso.get(id);
    return mot ? { ...mot, b: fiche.b, r: fiche.r } : null;
  };
  const parStatut = (predicat) => Object.entries(state.words ?? {})
    .filter(([, fiche]) => predicat(fiche))
    .map(resoudre)
    .filter(Boolean)
    .sort((a, b) => String(a.r).localeCompare(String(b.r)));

  return WordList({
    showBox: true,
    groupes: [
      {
        titre: "En attente",
        vide: "Aucun mot n'attend son délai de deux jours.",
        mots: parStatut((f) => f.st === "attente"),
      },
      {
        titre: "En cours",
        vide: "Aucun mot en cours d'apprentissage.",
        mots: parStatut((f) => f.st === "actif"),
      },
      {
        titre: "Appris",
        vide: "Aucun mot validé pour l'instant.",
        mots: parStatut((f) => STATUTS_CONNUS.includes(f.st)),
      },
    ],
  });
}

/** État vide : message et action alternative, jamais un cul-de-sac (§13). */
function vide(el, aller, texte) {
  const zone = document.createElement("div");
  zone.className = "ecran__empty";

  const message = document.createElement("p");
  message.className = "ecran__empty-text";
  message.textContent = texte;
  zone.append(message);

  zone.append(Button({ label: "Retour à l'accueil", fullWidth: true,
                       onClick: () => aller("/") }));
  el.append(zone);
  return el;
}
