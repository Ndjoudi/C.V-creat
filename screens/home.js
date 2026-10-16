import { IconButton } from "../components/atoms/icon-button.js";
import { Divider } from "../components/atoms/divider.js";
import { SectionCard } from "../components/molecules/section-card.js";
import { PalierList } from "../components/organisms/palier-list.js";
import { entreesPaliers } from "../services/session-builder.js";
import { chargerVideos } from "../services/store.js";
import { avancement } from "../services/video-builder.js";
import { composerDecouverte } from "../services/discovery-builder.js";
import { partiesDisponibles } from "../services/game-builder.js";
import { choisirHistoire } from "../services/story-builder.js";
import { motsAApprendre, motsAQuizzer, prochaineEcheanceApprentissage,
         motsConnus, aujourdhui } from "../services/leitner.js";

/**
 * Home — tableau de bord des dix sections (README §1, §13).
 *
 * L'écran ne décide rien : chaque compteur vient du service qui possède la
 * section. Il n'y a aucun enchaînement automatique — l'utilisateur choisit où
 * il entre, et chaque section le ramène ici.
 *
 * @param {{state:object, contenu:object, aller:Function}} contexte
 * @returns {HTMLElement}
 */
export function Home({ state, contenu, aller }) {
  const el = document.createElement("main");
  el.className = "ecran home";
  el.append(barre(aller));

  const today = aujourdhui();
  const connus = motsConnus(state);

  // Le palier courant est affiché par le MÊME composant que dans Progression,
  // alimenté par la MÊME fonction de calcul (§17, règle 10).
  const courant = entreesPaliers(state, contenu.mots, contenu.manifeste)
    .filter((p) => Number(p.id) === Number(state.progression.palier_actuel));
  if (courant.length) {
    el.append(PalierList({ paliers: courant, current: state.progression.palier_actuel }));
  }

  el.append(Divider({ spacing: 5 }));

  const sections = document.createElement("div");
  sections.className = "home__sections";
  sections.append(
    carteTraduire(state, aller),
    carteDecouverte(state, contenu, aller),
    carteQuizz(state, today, aller),
    carteApprendre(state, today, aller),
    carteJeu(state, contenu, connus, "grille", 5, "La grille", "/codeword", aller),
    carteJeu(state, contenu, connus, "croises", 6, "Mots croisés", "/crossword", aller),
    carteHistoire(state, contenu, today, aller),
    carteEcrire(state, contenu, aller),
    carteVideo(state, aller),
  );
  el.append(sections);

  return el;
}

/** Barre supérieure : accès hors sections (progression, réglages). */
function barre(aller) {
  const el = document.createElement("div");
  el.className = "home__bar";

  const titre = document.createElement("h1");
  titre.className = "home__title";
  titre.textContent = "WordCode";
  el.append(titre);

  const actions = document.createElement("div");
  actions.className = "home__actions";
  actions.append(
    IconButton({ icon: "chart", label: "Progression", variant: "ghost",
                 onClick: () => aller("/progress") }),
    IconButton({ icon: "settings", label: "Réglages", variant: "ghost",
                 onClick: () => aller("/settings") }),
  );
  el.append(actions);
  return el;
}

/* -------------------------------------------------------------------------- */
/* Les dix cartes                                                              */
/* -------------------------------------------------------------------------- */

function carteTraduire(state, aller) {
  const ajoutes = (state.perso ?? []).length;
  return SectionCard({
    numero: 1,
    titre: "Traduire",
    compteur: ajoutes,
    uniteCompteur: ajoutes > 1 ? "mots ajoutés" : "mot ajouté",
    icone: "pencil",
    etat: "ouvert",
    action: "Ajouter un mot",
    onOpen: () => aller("/add"),
  });
}

function carteDecouverte(state, contenu, aller) {
  const { mots, restants, vide } = composerDecouverte({ state, catalogue: contenu.mots });
  return SectionCard({
    numero: 2,
    titre: "Découverte",
    compteur: mots.length + restants,
    uniteCompteur: "à trier",
    icone: "book",
    etat: vide ? "vide" : "ouvert",
    message: "Rien à découvrir : tu es à jour.",
    action: "Trier des mots",
    onOpen: () => aller("/discovery"),
  });
}

function carteQuizz(state, today, aller) {
  const dus = motsAQuizzer(state, today);
  return SectionCard({
    numero: 3,
    titre: "Quizz",
    compteur: dus.length,
    uniteCompteur: "à vérifier",
    icone: "check",
    etat: dus.length ? "ouvert" : "vide",
    message: "Rien à vérifier. Trie des mots en découverte, ou travaille ceux d'Apprendre.",
    action: "Vérifier",
    onOpen: () => aller("/quiz"),
  });
}

function carteApprendre(state, today, aller) {
  const dus = motsAApprendre(state, today);
  const prochaine = prochaineEcheanceApprentissage(state, today);
  return SectionCard({
    numero: 4,
    titre: "Apprendre",
    compteur: dus.length,
    uniteCompteur: "à travailler",
    icone: "book",
    etat: dus.length ? "ouvert" : "vide",
    message: prochaine
      ? `Rien à apprendre aujourd'hui. Prochain mot le ${prochaine}.`
      : "Rien à apprendre aujourd'hui. Passe par la découverte ou le quizz.",
    action: "Commencer",
    onOpen: () => aller("/learn"),
  });
}

function carteJeu(state, contenu, connus, jeu, numero, titre, route, aller) {
  const disponibles = partiesDisponibles(state, contenu.parties, jeu);

  if (connus.length < 5) {
    return SectionCard({
      numero, titre, etat: "verrouille",
      message: `Il faut au moins 5 mots validés au quizz pour jouer. Tu en as ${connus.length}.`,
    });
  }

  return SectionCard({
    numero,
    titre,
    compteur: disponibles,
    uniteCompteur: disponibles > 1 ? "grilles" : "grille",
    icone: "grid",
    etat: disponibles ? "ouvert" : "verrouille",
    message: "Aucune grille ne tient encore avec les mots que tu connais.",
    action: "Jouer",
    onOpen: () => aller(route),
  });
}

function carteEcrire(state, contenu, aller) {
  // Deux sources derrière la carte : la dictée vient désormais des conférences
  // (§10), la traduction garde le corpus livré. L'une ou l'autre suffit.
  const dePhrasesVideo = chargerVideos()
    .reduce((n, v) => n + (v.phrases?.length ?? 0), 0);
  const phrases = (contenu.dictees ?? []).length + dePhrasesVideo;
  const faites = new Set(state.progression?.dictees_faites ?? []);
  const restantes = (contenu.dictees ?? []).filter((p) => !faites.has(p.id)).length;

  return SectionCard({
    numero: 8,
    titre: "Écrire",
    compteur: restantes || phrases,
    uniteCompteur: "phrases",
    icone: "pencil",
    etat: phrases ? "ouvert" : "verrouille",
    message: "Aucune phrase enregistrée n'est livrée pour ton palier.",
    action: "Dictée, traduction, rédaction",
    onOpen: () => aller("/writing"),
  });
}

/**
 * §09 — verbes irréguliers.
 *
 * Filière à part : la morphologie n'est pas du vocabulaire. Un codeword ferait
 * deviner WENT sans jamais le relier à GO (§3.2). Elle n'apparaît que si son
 * contenu est livré — une carte morte ne dit rien à personne (§8).
 */

/**
 * §10 — conférences TED, phrase par phrase.
 *
 * Les conférences vivent en localStorage, pas dans /content : ce sont des
 * données tierces récupérées pour un usage personnel (§16).
 */
function carteVideo(state, aller) {
  const videos = chargerVideos();
  const restantes = videos.reduce((somme, v) => {
    const suivi = avancement(v, state);
    return somme + (suivi.total - suivi.faites.length);
  }, 0);

  return SectionCard({
    numero: 9,
    titre: "Vidéo",
    compteur: videos.length ? restantes : null,
    uniteCompteur: "phrases à faire",
    icone: "audio",
    etat: "ouvert",
    action: videos.length ? "Continuer" : "Ajouter une conférence",
    onOpen: () => aller("/video"),
  });
}

function carteHistoire(state, contenu, today, aller) {
  const choix = choisirHistoire({ state, histoires: contenu.histoires ?? [], today });

  if (choix.dejaLue) {
    return SectionCard({
      numero: 7, titre: "Histoire du jour", etat: "vide",
      message: "Histoire du jour lue. Reviens demain.",
    });
  }

  if (choix.verrouille) {
    return SectionCard({
      numero: 7, titre: "Histoire du jour", etat: "verrouille",
      message: choix.raison,
    });
  }

  const pourcent = Math.round(choix.couverture * 100);
  return SectionCard({
    numero: 7,
    titre: "Histoire du jour",
    compteur: pourcent,
    uniteCompteur: "% de mots connus",
    icone: "book",
    etat: "ouvert",
    action: choix.suffisante ? "Lire" : "Lire quand même",
    onOpen: () => aller("/story"),
  });
}
