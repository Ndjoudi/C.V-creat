import { SessionHeader } from "../components/molecules/session-header.js";
import { ProgressDots } from "../components/atoms/progress-dots.js";
import { Button } from "../components/atoms/button.js";
import { Toast } from "../components/atoms/toast.js";
import { ClueText } from "../components/molecules/clue-text.js";
import { TranslationPopover } from "../components/molecules/translation-popover.js";
import { MCQ } from "../components/molecules/mcq.js";
import { composerQuizz, appliquerQuizz,
         promouvoirSansDefinition } from "../services/quiz-builder.js";
import { marquerSegmentsConnus } from "../services/game-builder.js";
import { motDepuisSegment, prochainIdPerso, ajouterMotsPerso,
         debloquerPaliers } from "../services/session-builder.js";
import { aujourdhui } from "../services/leitner.js";

/** Délai d'affichage du verdict avant de passer à la question suivante. */
const DUREE_VERDICT = 1100;

/**
 * Quiz — section §03 (README §2, §13).
 *
 * L'énoncé est la définition périphrasée du mot, pas sa traduction : c'est ce
 * que la grille demandera plus tard, et c'est de la compréhension d'anglais
 * plutôt qu'un appariement d'étiquettes.
 *
 * Chaque mot de la définition est tappable. Un mot inconnu rencontré ici part
 * dans la file de découverte — l'énoncé devient lui-même une source.
 *
 * @param {{state:object, contenu:object, aller:Function, enregistrer:Function}} contexte
 * @returns {HTMLElement}
 */
export function Quiz({ state, contenu, aller, enregistrer }) {
  const el = document.createElement("main");
  el.className = "ecran quiz-screen";

  const today = aujourdhui();
  const { questions, sansDefinition } = composerQuizz({ state, catalogue: contenu.mots, today });

  if (!questions.length && !sansDefinition.length) {
    el.append(SessionHeader({ title: "Quizz", onHome: () => aller("/") }));
    return vide(el, aller,
      "Rien à vérifier pour l'instant. Passe par la découverte ou par Apprendre.");
  }

  let rang = 0;
  const verdicts = new Map();
  const ajoutes = [];

  const corps = document.createElement("div");
  corps.className = "session__body";

  /** Popover de traduction : un seul à la fois dans le DOM. */
  let popover = null;
  const fermer = () => { popover?.remove(); popover = null; };

  const terminer = () => {
    fermer();
    let suivant = state;
    for (const [id, correct] of verdicts) {
      suivant = appliquerQuizz(suivant, id, correct, today);
    }
    // Un mot sans définition ne peut pas être vérifié : on ne le bloque pas
    // indéfiniment devant une porte qu'on ne sait pas lui ouvrir.
    suivant = promouvoirSansDefinition(suivant, sansDefinition, today);

    if (ajoutes.length) {
      suivant = ajouterMotsPerso(suivant, ajoutes);
      suivant = {
        ...suivant,
        progression: {
          ...suivant.progression,
          ajouts_aujourdhui: Number(suivant.progression.ajouts_aujourdhui ?? 0) + ajoutes.length,
        },
      };
    }
    suivant = debloquerPaliers(suivant, contenu.mots, contenu.manifeste);
    suivant = { ...suivant, progression: { ...suivant.progression, derniere_session: today } };

    enregistrer(suivant);
    aller("/");
  };

  const avancer = () => {
    rang += 1;
    if (rang >= questions.length) { terminer(); return; }
    rendre();
  };

  /** Un mot de la définition part en file de découverte (§3.3). */
  const ajouterSegment = (segment) => {
    const mot = motDepuisSegment({
      segment,
      id: prochainIdPerso([...(state.perso ?? []), ...ajoutes]),
      date: today,
    });
    if (!mot) return;
    ajoutes.push(mot);
    el.append(Toast({
      message: `« ${mot.en} » part dans ta file de découverte.`,
      variant: "success",
      duration: 2500,
    }));
  };

  const taper = (segment, index, ancre) => {
    fermer();
    if (!segment?.trad) return;

    popover = TranslationPopover({
      word: segment.txt,
      translation: segment.trad,
      alreadyKnown: Boolean(segment.connu),
      canAdd: !segment.connu && !ajoutes.some((m) => m.en === String(segment.txt).toLowerCase()),
      onAdd: () => { ajouterSegment(segment); fermer(); },
      onClose: fermer,
    });
    ancre.insertAdjacentElement("afterend", popover);
  };

  const rendre = () => {
    fermer();
    const question = questions[rang];
    el.replaceChildren();
    el.append(SessionHeader({
      title: "Quizz",
      onHome: () => aller("/"),
      progress: ProgressDots({ total: questions.length, current: rang + 1 }),
    }));
    corps.replaceChildren();
    el.append(corps);

    // Le drapeau « connu » vient du même service que pour les grilles : le
    // popover ne propose d'ajouter que ce que l'utilisateur ignore vraiment.
    const [enrichi] = marquerSegmentsConnus([question.mot], state, ajoutes);

    corps.append(MCQ({
      question: ClueText({ segments: enrichi.indice.segments, onWordTap: taper }),
      options: question.options,
      correctId: question.correctId,
      onAnswer: ({ correct }) => {
        verdicts.set(question.mot.id, correct);
        setTimeout(avancer, DUREE_VERDICT);
      },
    }));
  };

  if (!questions.length) { terminer(); return el; }
  rendre();
  return el;
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
