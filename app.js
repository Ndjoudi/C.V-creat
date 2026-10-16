/**
 * app.js — point d'entrée et routeur (README §8).
 *
 * Rôle unique : charger l'état et le contenu, puis brancher les écrans sur le
 * routeur. Aucune règle métier ici.
 */

import { creerRouteur } from "./services/router.js";
import { charger, sauvegarder, chargerHistoiresGenerees } from "./services/store.js";
import { chargerContenu, chargerVerbes, chargerPhrasal,
         chargerHistoires, chargerDictees } from "./services/content-loader.js";
import { demarrerJournee } from "./services/session-builder.js";
import { Toast } from "./components/atoms/toast.js";
import { Spinner } from "./components/atoms/spinner.js";
import { Home } from "./screens/home.js";
import { Discovery } from "./screens/discovery.js";
import { Quiz } from "./screens/quiz.js";
import { Learn } from "./screens/learn.js";
import { Codeword } from "./screens/codeword.js";
import { Crossword } from "./screens/crossword.js";
import { Story } from "./screens/story.js";
import { Writing } from "./screens/writing.js";
import { Video } from "./screens/video.js";
import { Progress } from "./screens/progress.js";
import { Settings } from "./screens/settings.js";
import { ManualAdd } from "./screens/manual-add.js";
import { Phrasal } from "./screens/phrasal.js";
import { identifiant, sauvegarderEnLigne } from "./services/sync.js";

const racine = document.getElementById("app");

/** État applicatif. Une seule variable mutable dans tout le projet. */
let state = null;
let contenu = null;
let routeur = null;

/** Affiche un écran d'attente le temps du chargement du contenu. */
function attendre() {
  const zone = document.createElement("main");
  zone.className = "ecran ecran--loading";
  zone.append(Spinner({ size: "lg" }));
  racine.replaceChildren(zone);
}

/**
 * Enregistre un nouvel état et re-rend l'écran courant.
 * @param {object} suivant
 * @param {{silencieux?:boolean}} options  ne pas re-rendre
 */
/**
 * Recopie en ligne, différée.
 *
 * Une séance enchaîne les enregistrements — un par réponse. Les regrouper
 * évite une rafale de requêtes pour un seul résultat utile. L'appel est
 * silencieux : une panne de réseau ne doit jamais interrompre une révision,
 * la sauvegarde locale reste la source de vérité immédiate.
 */
const DELAI_SYNCHRO_MS = 4000;
let minuteurSynchro = null;

function planifierSynchro() {
  // JAMAIS écraser la sauvegarde en ligne par un état vide. Sur un appareil
  // neuf — ou après une purge du navigateur — l'app démarre sans rien : une
  // recopie automatique détruirait la progression distante avant même qu'on
  // ait pu la restaurer. Tant qu'il n'y a rien à sauvegarder, on se tait.
  const rienASauver = !Object.keys(state?.words ?? {}).length
                   && !(state?.perso ?? []).length;
  if (rienASauver) return;

  clearTimeout(minuteurSynchro);
  minuteurSynchro = setTimeout(() => {
    sauvegarderEnLigne({ state, id: identifiant() });
  }, DELAI_SYNCHRO_MS);
}

function enregistrer(suivant, { silencieux = false } = {}) {
  const palierAvant = state?.progression?.palier_actuel;
  state = suivant;

  planifierSynchro();

  if (!sauvegarder(state)) {
    racine.append(Toast({
      message: "Impossible d'écrire la progression : stockage indisponible.",
      variant: "error",
      duration: 6000,
    }));
  }

  // Le chargement est paresseux (§6) : changer de palier ouvre des fichiers
  // qui n'étaient pas en mémoire. Il faut les lire avant de re-rendre.
  if (state?.progression?.palier_actuel !== palierAvant) {
    rechargerContenu().then(() => routeur?.rafraichir());
    return;
  }

  if (!silencieux) routeur?.rafraichir();
}

/** Relit le contenu pour l'état courant, filières comprises. */
async function rechargerContenu() {
  contenu = await chargerContenu({ state });
  if (contenu.filieres?.verbes) {
    const filiere = await chargerVerbes({ manifeste: contenu.manifeste });
    contenu.verbes = filiere.verbes;
    contenu.erreurs.push(...filiere.erreurs);

    // Ces verbes sont des mots comme les autres : ils rejoignent le catalogue
    // pour être découverts, quizzés puis joués (§3.2). Ils gardent leur propre
    // espace d'identifiants parce que ceux du catalogue sont POSITIONNELS —
    // les insérer dans un palier décalerait tous les mots suivants, et la
    // progression, indexée par identifiant, désignerait d'autres mots.
    // Comme pour les mots, seuls les paliers déjà ouverts entrent.
    const jusqua = state?.progression?.palier_actuel ?? 1;
    for (const verbe of filiere.verbes) {
      if ((verbe.palier ?? 1) <= jusqua) contenu.mots.set(verbe.id, verbe);
    }
  } else {
    contenu.verbes = [];
  }

  if (contenu.filieres?.phrasal) {
    const filiere = await chargerPhrasal({ manifeste: contenu.manifeste });
    contenu.phrasal = filiere.phrasal;
    contenu.erreurs.push(...filiere.erreurs);
  } else {
    contenu.phrasal = [];
  }

  if (contenu.filieres?.histoires) {
    const filiere = await chargerHistoires({ manifeste: contenu.manifeste });
    contenu.histoires = filiere.histoires;
    contenu.erreurs.push(...filiere.erreurs);
  } else {
    contenu.histoires = [];
  }

  // Les histoires produites par l'API (§16) vivent en localStorage, pas dans
  // /content. Elles complètent le stock livré sans jamais le remplacer.
  contenu.histoires = [...contenu.histoires, ...chargerHistoiresGenerees()];

  // §08 — les dictées du palier courant seulement : les audios pèsent.
  const dictees = await chargerDictees({ palier: state?.progression?.palier_actuel ?? 1 });
  contenu.dictees = dictees.phrases;
  contenu.erreurs.push(...dictees.erreurs);
}

/** Contexte passé à chaque écran. */
const contexte = () => ({
  state,
  contenu,
  aller: (chemin) => routeur.aller(chemin),
  enregistrer,
});

async function demarrer() {
  attendre();

  // Safari purge le stockage d'un site peu visité. Une app ajoutée à l'écran
  // d'accueil peut demander à en être exemptée ; un refus n'empêche rien.
  navigator.storage?.persist?.().catch(() => {});

  state = demarrerJournee(charger());
  await rechargerContenu();

  routeur = creerRouteur({
    defaut: "/",
    routes: {
      "/": () => Home(contexte()),
      // Les six sections de l'écran principal (README §13).
      "/add": () => ManualAdd(contexte()),
      "/discovery": () => Discovery(contexte()),
      "/quiz": () => Quiz(contexte()),
      "/learn": () => Learn(contexte()),
      "/codeword": () => Codeword(contexte()),
      "/crossword": () => Crossword(contexte()),
      "/story": () => Story(contexte()),
      "/writing": () => Writing(contexte()),
      "/video": () => Video(contexte()),
      // Hors sections.
      "/progress": () => Progress(contexte()),
      "/settings": () => Settings(contexte()),
      "/phrasal": () => Phrasal(contexte()),
    },
    monter: (ecran) => {
      racine.replaceChildren(ecran);
      globalThis.scrollTo(0, 0);
    },
  });

  routeur.demarrer();

  // Un contenu bloqué n'empêche pas l'application de démarrer : on le signale
  // et on renvoie vers Réglages, où la liste complète est consultable (§7).
  const bloquantes = (contenu.erreurs ?? []).filter((e) => e.bloquant);
  if (bloquantes.length) {
    racine.append(Toast({
      message: `${bloquantes.length} anomalie(s) de contenu — voir Réglages.`,
      variant: "error",
      duration: 6000,
    }));
  }
}

demarrer();
