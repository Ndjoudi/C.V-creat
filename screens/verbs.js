import { SessionHeader } from "../components/molecules/session-header.js";
import { VerbTriad } from "../components/molecules/verb-triad.js";
import { Button } from "../components/atoms/button.js";
import { IconButton } from "../components/atoms/icon-button.js";
import { Chip } from "../components/atoms/chip.js";
import { ProgressBar } from "../components/atoms/progress-bar.js";
import { ProgressDots } from "../components/atoms/progress-dots.js";
import { Divider } from "../components/atoms/divider.js";
import { GROUPES_VERBE, composerSessionVerbes, appliquerVerbe,
         avancementGroupe, avancerGroupe } from "../services/session-builder.js";
import { aujourdhui } from "../services/leitner.js";
import { parler, taire } from "../services/audio.js";

/**
 * Verbs — filière verbes irréguliers (README §11, §2.2, §3.6).
 *
 * L'apprentissage suit les groupes de patterns G1 → G4, jamais l'ordre
 * alphabétique. Un verbe jamais vu est d'abord PRÉSENTÉ — faire deviner WENT
 * sans jamais le relier à GO n'apprend rien (§2.2) — puis testé par
 * `VerbTriad`, dont les deux formes alimentent deux fiches Leitner distinctes.
 *
 * @param {{state:object, contenu:object, aller:Function, enregistrer:Function}} contexte
 * @returns {HTMLElement}
 */
export function Verbs({ state, contenu, aller, enregistrer }) {
  const el = document.createElement("main");
  el.className = "ecran verbs";

  const today = aujourdhui();
  const verbes = contenu.verbes ?? [];

  // Les verdicts s'accumulent en mémoire ; l'état n'est écrit qu'à la sortie,
  // qu'elle vienne du bouton d'accueil ou de la fin de la file.
  const verdicts = [];
  const sortir = () => {
    taire();
    if (verdicts.length) {
      let suivantEtat = state;
      for (const { id, verdict } of verdicts) {
        suivantEtat = appliquerVerbe(suivantEtat, id, { ...verdict, date: today });
      }
      enregistrer(suivantEtat, { silencieux: true });
    }
    aller("/");
  };

  el.append(SessionHeader({ title: "Verbes irréguliers", onHome: sortir }));

  const corps = document.createElement("div");
  corps.className = "ecran__body";
  el.append(corps);

  // Filière déclarée mais pas encore livrée : on le dit, on ne bloque pas (§7).
  if (!verbes.length) {
    corps.append(etatVide(
      contenu.filieres?.verbes === false
        ? "La filière verbes irréguliers n'est pas encore disponible."
        : "Aucun verbe n'a pu être chargé.",
      aller));
    return el;
  }

  const session = composerSessionVerbes({ state, verbes, today });
  const groupe = GROUPES_VERBE[session.groupe] ?? GROUPES_VERBE[1];
  const avancement = avancementGroupe(state, session.duGroupe);
  const dernier = session.groupe >= Object.keys(GROUPES_VERBE).length;

  /* --- Bandeau de groupe -------------------------------------------------- */

  const bandeau = document.createElement("div");
  bandeau.className = "verbs__group";

  const entete = document.createElement("div");
  entete.className = "verbs__group-head";
  entete.append(Chip({ label: groupe.code, variant: "palier" }));

  const nom = document.createElement("span");
  nom.className = "verbs__group-name";
  nom.textContent = groupe.pattern ? `${groupe.titre} (${groupe.pattern})` : groupe.titre;
  entete.append(nom);
  bandeau.append(entete);

  bandeau.append(ProgressBar({
    value: avancement.acquises, max: avancement.formes || 1,
    variant: avancement.termine ? "success" : "primary",
  }));

  const detail = document.createElement("p");
  detail.className = "verbs__group-detail";
  detail.textContent =
    `${avancement.acquises} forme${avancement.acquises > 1 ? "s" : ""} sur ${avancement.formes} en boîte 3+`;
  bandeau.append(detail);
  corps.append(bandeau);

  // Groupe acquis — ou groupe vide de contenu : on propose le suivant plutôt
  // que de laisser l'utilisateur sans issue.
  if (avancement.depasse && !dernier) {
    corps.append(Button({
      label: `Passer au groupe ${GROUPES_VERBE[session.groupe + 1].code}`,
      variant: "secondary",
      fullWidth: true,
      onClick: () => enregistrer(avancerGroupe(state)),
    }));
  }

  corps.append(Divider({ spacing: 4 }));

  if (session.vide) {
    let message;
    if (avancement.formes === 0) {
      message = `Aucun verbe livré pour le groupe ${groupe.code}.`;
    } else if (dernier) {
      message = "Rien à revoir dans ce groupe aujourd'hui. Tu as parcouru les quatre groupes.";
    } else {
      message = "Rien à revoir dans ce groupe aujourd'hui.";
    }
    corps.append(etatVide(message, aller));
    return el;
  }

  /* --- File de travail ---------------------------------------------------- */

  const file = session.file;
  const aPresenter = new Set(session.nouveaux.map((v) => v.id));
  let rang = 0;

  const zone = document.createElement("div");
  zone.className = "deck";
  corps.append(zone);

  const suivant = () => {
    rang += 1;
    if (rang >= file.length) return sortir();
    rendre();
  };

  const rendre = () => {
    zone.replaceChildren();
    const verbe = file[rang];
    zone.append(ProgressDots({ total: file.length, current: rang + 1 }));

    if (aPresenter.has(verbe.id)) {
      zone.append(presentation(verbe, () => {
        aPresenter.delete(verbe.id);
        rendre();
      }));
      return;
    }

    const exercice = document.createElement("div");
    exercice.className = "deck__body";
    exercice.append(VerbTriad({
      verb: verbe,
      showBase: true,
      onSubmit: (verdict) => {
        verdicts.push({ id: verbe.id, verdict });
        const suite = document.createElement("div");
        suite.className = "deck__continue";
        suite.append(Button({
          label: rang + 1 >= file.length ? "Terminer" : "Continuer",
          fullWidth: true,
          onClick: suivant,
        }));
        exercice.append(suite);
      },
    }));
    zone.append(exercice);
  };

  rendre();
  return el;
}

/** Présentation d'un verbe jamais vu : les trois formes, puis l'exercice. */
function presentation(verbe, onSuite) {
  const carte = document.createElement("article");
  carte.className = "verb-intro";

  const tete = document.createElement("div");
  tete.className = "verb-intro__head";

  const titre = document.createElement("h2");
  titre.className = "verb-intro__base";
  titre.lang = "en";
  titre.textContent = verbe.en;
  tete.append(titre);

  const dire = () => parler(`${verbe.en}, ${verbe.preterit}, ${verbe.participe}`);
  tete.append(IconButton({
    icon: "audio", label: `Écouter ${verbe.en}`, variant: "secondary", onClick: dire,
  }));
  carte.append(tete);

  const sens = document.createElement("p");
  sens.className = "verb-intro__fr";
  sens.textContent = verbe.fr;
  carte.append(sens);

  const formes = document.createElement("div");
  formes.className = "verb-intro__forms";
  for (const [etiquette, valeur] of [
    ["Base", verbe.en], ["Prétérit", verbe.preterit], ["Participe", verbe.participe],
  ]) {
    const bloc = document.createElement("div");
    bloc.className = "verb-intro__form";

    const nomForme = document.createElement("span");
    nomForme.className = "verb-intro__form-label";
    nomForme.textContent = etiquette;
    bloc.append(nomForme);

    const texte = document.createElement("span");
    texte.className = "verb-intro__form-value";
    texte.lang = "en";
    texte.textContent = valeur;
    bloc.append(texte);
    formes.append(bloc);
  }
  carte.append(formes);
  carte.append(Button({ label: "À moi", fullWidth: true, onClick: onSuite }));

  dire();
  return carte;
}

/** État vide : message et action alternative, jamais un cul-de-sac (§11). */
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
