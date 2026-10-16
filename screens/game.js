import { SessionHeader } from "../components/molecules/session-header.js";
import { Button } from "../components/atoms/button.js";
import { CodewordBoard } from "../components/organisms/codeword-board.js";
import { CrosswordBoard } from "../components/organisms/crossword-board.js";
import { EndCard } from "../components/organisms/end-card.js";
import { QueueSummary } from "../components/organisms/queue-summary.js";
import { choisirPartie, appliquerPartie,
         marquerSegmentsConnus } from "../services/game-builder.js";
import { motDepuisSegment, prochainIdPerso, ajouterMotsPerso,
         AJOUTS_MAX_PAR_PARTIE } from "../services/session-builder.js";
import { aujourdhui } from "../services/leitner.js";

/**
 * game.js — orchestrateur commun aux sections §04 et §05 (README §13).
 *
 * Les deux jeux partagent la totalité de leur déroulé : tirer une partie
 * jouable, afficher un plateau vide, révéler la phrase cachée au bilan, puis
 * faire monter les mots d'une boîte. Seul le plateau change. Un seul
 * orchestrateur, deux écrans minces — plutôt que deux fois le même code.
 *
 * @param {object} contexte  { state, contenu, aller, enregistrer }
 * @param {object} options
 * @param {string} options.jeu     "grille" ou "croises"
 * @param {string} options.titre
 * @returns {HTMLElement}
 */
export function Game({ state, contenu, aller, enregistrer }, { jeu, titre }) {
  const el = document.createElement("main");
  el.className = "ecran session session--grille";

  const today = aujourdhui();
  const tirage = choisirPartie({ state, parties: contenu.parties, jeu });

  if (tirage.verrouille) {
    el.append(SessionHeader({ title: titre, onHome: () => aller("/") }));
    return vide(el, aller, tirage.raison);
  }

  // Le cycle a pu être rebouclé pour trouver cette partie : on part de l'état
  // que le service a renvoyé, pas de celui reçu en entrée.
  const base = tirage.state;
  const partie = tirage.partie;
  const mots = partie.mots.map((id) => contenu.mots.get(id)).filter(Boolean);

  /** Mots dont la traduction a été consultée : ils ne monteront pas de boîte. */
  const aides = new Set();
  /** Mots ajoutés à la file de découverte pendant la partie (§3.3). */
  const ajoutes = [];

  let etape = "jeu";
  let alphabetPose = {};
  let grillePosee = {};

  const corps = document.createElement("div");
  corps.className = "session__body";

  const terminer = () => {
    let suivant = appliquerPartie({ state: base, partie, jeu, aides: [...aides], today });
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
    suivant = {
      ...suivant,
      progression: { ...suivant.progression, derniere_session: today },
    };
    enregistrer(suivant);
    aller("/");
  };

  const avancer = () => {
    if (etape === "jeu") { etape = "bilan"; rendre(); return; }
    if (etape === "bilan" && ajoutes.length) { etape = "file"; rendre(); return; }
    terminer();
  };

  /** Un segment d'indice part en file de découverte (§3.3). */
  const ajouterSegment = (segment) => {
    if (ajoutes.length >= AJOUTS_MAX_PAR_PARTIE) return;
    const mot = motDepuisSegment({
      segment,
      id: prochainIdPerso([...(base.perso ?? []), ...ajoutes]),
      origine_partie: partie.id,
      date: today,
    });
    if (mot) ajoutes.push(mot);
  };

  const rendre = () => {
    el.replaceChildren();
    el.append(SessionHeader({ title: titre, onHome: () => aller("/") }));
    corps.replaceChildren();
    el.append(corps);

    if (etape === "jeu") {
      const enrichis = marquerSegmentsConnus(mots, base, ajoutes);
      corps.append(jeu === "grille"
        ? CodewordBoard({
            partie,
            words: enrichis,
            alphabetState: alphabetPose,
            onLetterInput: ({ alphabetState }) => { alphabetPose = alphabetState; },
            onComplete: avancer,
            onAddWord: ajouterSegment,
            // Une lettre révélée prive le mot de sa montée de boîte (§5).
            onHint: ({ motId }) => { if (motId) aides.add(motId); },
          })
        : CrosswordBoard({
            partie,
            words: enrichis,
            gridState: grillePosee,
            onLetterInput: ({ gridState }) => { grillePosee = gridState; },
            onComplete: avancer,
          }));
      return;
    }

    if (etape === "bilan") {
      corps.append(EndCard({
        partie,
        words: mots,
        actionLabel: ajoutes.length ? "Voir mes ajouts" : "Terminer",
        onContinue: avancer,
      }));
      return;
    }

    corps.append(QueueSummary({ words: ajoutes, onClose: terminer }));
  };

  rendre();
  return el;
}

/** État vide : dire pourquoi, et proposer la sortie (§13). */
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
