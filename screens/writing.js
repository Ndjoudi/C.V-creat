import { SessionHeader } from "../components/molecules/session-header.js";
import { Button } from "../components/atoms/button.js";
import { Toast } from "../components/atoms/toast.js";
import { Spinner } from "../components/atoms/spinner.js";
import { Divider } from "../components/atoms/divider.js";
import { InputAnswer } from "../components/molecules/input-answer.js";
import { SectionCard } from "../components/molecules/section-card.js";
import { CompositionForm } from "../components/organisms/composition-form.js";
import { phrasesDepuisVideos, composerEcriture, verifierEcriture, appliquerEcriture,
         composerRedaction, verifierRedaction } from "../services/writing-builder.js";
import { corrigerRedaction } from "../services/api.js";
import { aujourdhui } from "../services/leitner.js";
import { VideoPlayer } from "../components/organisms/video-player.js";
import { chargerVideos } from "../services/store.js";

/** Délai d'affichage du verdict avant l'exercice suivant. */
const DUREE_VERDICT = 1600;

/**
 * Writing — section §08 « Écrire » (README §2, §13).
 *
 * Trois modes derrière une seule carte : dictée, traduction, rédaction. Ils
 * partagent l'écran mais rien d'autre — le premier travaille l'oreille, le
 * deuxième la production guidée, le troisième la production libre.
 *
 * @param {{state:object, contenu:object, aller:Function, enregistrer:Function}} contexte
 * @returns {HTMLElement}
 */
export function Writing({ state, contenu, aller, enregistrer }) {
  const el = document.createElement("main");
  el.className = "ecran writing";

  const today = aujourdhui();
  // Deux corpus distincts. La traduction guidée a besoin du français, que les
  // conférences n'ont pas ; la dictée a besoin d'un son, que Tatoeba n'a jamais
  // livré (un seul fichier dans content/audio). Chacune prend donc sa source.
  const phrasesTraduction = contenu.dictees ?? [];
  const phrasesDictee = phrasesDepuisVideos(chargerVideos());
  let mode = null;

  /** Le lecteur reste le MÊME élément d'une phrase à l'autre : le remonter
   *  rechargerait le flux de la conférence. On ne le reconstruit qu'en
   *  changeant de conférence. */
  const zoneLecteur = document.createElement("div");
  zoneLecteur.className = "writing__lecteur";
  let slugCourant = null;
  let commandes = null;

  const assurerLecteur = (phrase) => {
    if (slugCourant === phrase.slug && commandes) return;
    slugCourant = phrase.slug;
    commandes = null;
    zoneLecteur.replaceChildren(VideoPlayer({
      source: phrase.source,
      hls: phrase.hls,
      titre: phrase.titre,
      onPret: (c) => { commandes = c; },
      onErreur: (m) => corps.append(Toast({ message: m, variant: "error", duration: 4000 })),
    }));
  };

  const corps = document.createElement("div");
  corps.className = "session__body";

  const quitter = () => { commandes?.detruire?.(); aller("/"); };

  /* ------------------------------------------------------------- Choix du mode */

  const choisirMode = () => {
    el.replaceChildren();
    el.append(SessionHeader({ title: "Écrire", onHome: quitter }));
    corps.replaceChildren();
    el.append(corps);

    const cartes = document.createElement("div");
    cartes.className = "home__sections";
    cartes.append(
      SectionCard({
        numero: 1, titre: "Dictée", icone: "audio",
        compteur: phrasesDictee.length, uniteCompteur: "phrases",
        etat: phrasesDictee.length ? "ouvert" : "verrouille",
        message: "Aucune phrase enregistrée n'est encore livrée pour ton palier.",
        action: "Écouter et écrire",
        onOpen: () => { mode = "dictee"; exercice(); },
      }),
      SectionCard({
        numero: 2, titre: "Traduction", icone: "pencil",
        compteur: phrasesTraduction.length, uniteCompteur: "phrases",
        etat: phrasesTraduction.length ? "ouvert" : "verrouille",
        message: "Aucune phrase n'est encore livrée pour ton palier.",
        action: "Traduire en anglais",
        onOpen: () => { mode = "traduction"; exercice(); },
      }),
      SectionCard({
        numero: 3, titre: "Rédaction libre", icone: "book",
        etat: "ouvert",
        action: "Écrire un texte",
        onOpen: () => { mode = "redaction"; redaction(); },
      }),
    );
    corps.append(cartes);
    corps.append(credit());
  };

  /* ------------------------------------------------- Dictée et traduction */

  const exercice = () => {
    commandes?.arreter?.();
    const tirage = composerEcriture({
      state, mode,
      phrases: mode === "dictee" ? phrasesDictee : phrasesTraduction,
    });

    el.replaceChildren();
    el.append(SessionHeader({
      title: mode === "dictee" ? "Dictée" : "Traduction",
      onHome: choisirMode,
    }));
    corps.replaceChildren();
    el.append(corps);

    if (tirage.verrouille) { corps.append(vide(tirage.raison, choisirMode)); return; }

    const { exercice: ex } = tirage;
    // On rejoue exactement le segment de la conférence, bornes comprises.
    const jouer = () => commandes?.jouer(ex.phrase.debut, ex.phrase.fin);
    if (mode === "dictee") { assurerLecteur(ex.phrase); corps.append(zoneLecteur); }

    corps.append(InputAnswer({
      prompt: ex.invite,
      // La comparaison réelle passe par le service : le composant ne connaît
      // pas les formulations alternatives du corpus.
      expected: ex.acceptees.join(" | "),
      onAudio: mode === "dictee" ? jouer : null,
      onSubmit: ({ value }) => {
        const verdict = verifierEcriture(value, ex);
        corps.append(bilan(verdict, ex));
        enregistrer(
          appliquerEcriture({ state, exercice: ex, correct: verdict.correct,
                              catalogue: contenu.mots, today }),
          { silencieux: true });
        setTimeout(() => { state = { ...state }; exercice(); }, DUREE_VERDICT);
      },
    }));

    if (mode === "dictee") jouer();
    corps.append(credit(ex.phrase));
  };

  /** Ce qu'on montre après une réponse : la forme attendue, toujours. */
  const bilan = (verdict, ex) => {
    const zone = document.createElement("div");
    zone.className = `writing__bilan writing__bilan--${verdict.correct ? "ok" : "ko"}`;

    const verdictTexte = document.createElement("p");
    verdictTexte.className = "writing__verdict";
    verdictTexte.textContent = verdict.correct
      ? (verdict.exact ? "Exact." : "Accepté — une autre formulation valable.")
      : "Ce n'était pas ça.";
    zone.append(verdictTexte);

    // On affiche la phrase attendue même quand c'est juste : en traduction,
    // le corpus n'enregistre souvent qu'UNE formulation, et une réponse
    // correcte tournée autrement serait refusée. Voir la phrase attendue vaut
    // mieux qu'un verdict sec.
    const attendu = document.createElement("p");
    attendu.className = "writing__attendu";
    attendu.lang = "en";
    attendu.textContent = ex.attendu;
    zone.append(attendu);

    if (mode === "dictee") {
      const fr = document.createElement("p");
      fr.className = "writing__traduction";
      fr.textContent = ex.phrase.fr[0];
      zone.append(fr);
    }
    return zone;
  };

  /* ------------------------------------------------------------ Rédaction */

  const redaction = () => {
    const sujet = composerRedaction({ state, catalogue: contenu.mots });

    el.replaceChildren();
    el.append(SessionHeader({ title: "Rédaction libre", onHome: choisirMode }));
    corps.replaceChildren();
    el.append(corps);

    if (sujet.verrouille) { corps.append(vide(sujet.raison, choisirMode)); return; }

    corps.append(CompositionForm({
      consigne: sujet.consigne,
      mots: sujet.mots,
      onCheck: (texte) => verifierRedaction(texte, sujet.mots),
      onCorriger: async (texte, zone) => {
        zone.replaceChildren(Spinner({ size: "md" }));
        const reponse = await corrigerRedaction({
          texte,
          consigne: sujet.consigne.en,
          mots: sujet.mots.map((m) => m.en),
        });
        zone.replaceChildren();
        if (!reponse.ok) {
          zone.append(Toast({ message: reponse.erreur, variant: "error", duration: 5000 }));
          return;
        }
        zone.append(correction(reponse.donnees));
      },
      onTerminer: (texte, resume) => {
        // Aucune boîte Leitner ici : une rédaction ne se note pas (§5).
        enregistrer({
          ...state,
          progression: { ...state.progression, derniere_session: today },
        }, { silencieux: true });
        el.append(Toast({
          message: resume.manquants.length
            ? `${resume.nbMots} mots écrits. Il manquait : ${resume.manquants.join(", ")}.`
            : `${resume.nbMots} mots écrits, tous les mots imposés placés.`,
          variant: resume.manquants.length ? "info" : "success",
          duration: 5000,
        }));
        void texte;
        setTimeout(choisirMode, 1200);
      },
    }));
  };

  /** Retour de l'API : le texte corrigé, les remarques, et ce qui a marché. */
  const correction = (donnees) => {
    const zone = document.createElement("section");
    zone.className = "correction";

    if (donnees.reussi) {
      const bon = document.createElement("p");
      bon.className = "correction__reussi";
      bon.textContent = donnees.reussi;
      zone.append(bon);
    }

    const corrige = document.createElement("p");
    corrige.className = "correction__texte";
    corrige.lang = "en";
    corrige.textContent = donnees.corrige;
    zone.append(corrige);

    if (donnees.remarques.length) {
      zone.append(Divider({ spacing: 3 }));
      const liste = document.createElement("ul");
      liste.className = "correction__remarques";
      for (const r of donnees.remarques) {
        const item = document.createElement("li");
        item.className = "correction__remarque";

        const paire = document.createElement("p");
        paire.className = "correction__paire";
        paire.innerHTML = "";
        const faux = document.createElement("span");
        faux.className = "correction__faux";
        faux.textContent = r.ecrit ?? "";
        const juste = document.createElement("span");
        juste.className = "correction__juste";
        juste.textContent = r.correct ?? "";
        paire.append(faux, document.createTextNode(" → "), juste);
        item.append(paire);

        if (r.pourquoi) {
          const pourquoi = document.createElement("p");
          pourquoi.className = "correction__pourquoi";
          pourquoi.textContent = r.pourquoi;
          item.append(pourquoi);
        }
        liste.append(item);
      }
      zone.append(liste);
    }
    return zone;
  };

  /* ---------------------------------------------------------------- Divers */

  /**
   * Crédit des enregistrements. Ce n'est pas une politesse : la licence
   * CC BY-NC-ND l'impose (§16).
   */
  const credit = (phrase = null) => {
    const zone = document.createElement("p");
    zone.className = "writing__credit";
    // Deux sources, deux licences, deux crédits : la dictée vient d'une
    // conférence TED, la traduction du corpus Tatoeba. Chacune l'impose.
    zone.textContent = phrase?.titre
      ? `${phrase.titre} — TED, CC BY-NC-ND 4.0. Usage personnel, non commercial.`
      : phrase?.lecteur
        ? `Enregistrement : ${phrase.lecteur} — Tatoeba, ${phrase.licence ?? "CC BY-NC-ND 3.0"}.`
        : "Phrases : Tatoeba (tatoeba.org), CC BY-NC-ND 3.0. Usage non commercial.";
    return zone;
  };

  const vide = (texte, retour) => {
    const zone = document.createElement("div");
    zone.className = "ecran__empty";

    const message = document.createElement("p");
    message.className = "ecran__empty-text";
    message.textContent = texte;
    zone.append(message);

    zone.append(Button({ label: "Retour", fullWidth: true, onClick: retour }));
    return zone;
  };

  choisirMode();
  return el;
}
