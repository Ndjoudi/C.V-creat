import { SessionHeader } from "../components/molecules/session-header.js";
import { ManualEntryForm } from "../components/organisms/manual-entry-form.js";
import { WordList } from "../components/organisms/word-list.js";
import { Button } from "../components/atoms/button.js";
import { Toast } from "../components/atoms/toast.js";
import { traduire } from "../services/api.js";
import { aujourdhui } from "../services/leitner.js";
import { normaliser } from "../services/normalize.js";
import { trouverExistant, palierPourRang, prochainIdPerso, motDepuisTraduction,
         ajouterMotsPerso, motsDepuisImport,
         ECART_PALIER_ALERTE } from "../services/session-builder.js";

/**
 * ManualAdd — saisie manuelle et traduction Gemini (README §11, §2.5).
 *
 * Seul écran de l'application qui a besoin du réseau. L'écran orchestre :
 * il appelle `api.js`, enrichit le résultat avec ce que le service métier sait
 * (doublons §5.2, écart de palier §14), et confie l'affichage à l'organism.
 *
 * @param {{state:object, contenu:object, aller:Function, enregistrer:Function}} contexte
 * @returns {HTMLElement}
 */
export function ManualAdd({ state, contenu, aller, enregistrer }) {
  const el = document.createElement("main");
  el.className = "ecran manual-add";

  el.append(SessionHeader({ title: "Ajouter un mot", onHome: () => aller("/") }));

  const corps = document.createElement("div");
  corps.className = "ecran__body";
  el.append(corps);

  // Hors ligne : c'est la seule fonction indisponible, on le dit d'emblée (§11).
  if (!navigator.onLine) {
    const vide = document.createElement("div");
    vide.className = "ecran__empty";

    const texte = document.createElement("p");
    texte.className = "ecran__empty-text";
    texte.textContent =
      "Hors ligne. La traduction est la seule fonction de WordCode qui a besoin du réseau — tout le reste marche.";
    vide.append(texte);

    vide.append(Button({ label: "Réviser à la place", fullWidth: true,
                         onClick: () => aller("/review") }));
    vide.append(Button({ label: "Retour à l'accueil", variant: "ghost", fullWidth: true,
                         onClick: () => aller("/") }));
    corps.append(vide);
    return el;
  }

  const messages = document.createElement("div");
  messages.className = "manual-add__messages";

  const palierCourant = Number(state.progression?.palier_actuel ?? 1);

  corps.append(ManualEntryForm({

    /** Appel réseau puis enrichissement métier. */
    onTranslate: async (texte) => {
      const verdict = await traduire(texte);
      if (!verdict.ok) return { ok: false, erreur: verdict.erreur };

      const { phrase_en, phrase_fr, mots } = verdict.donnees;

      const enrichis = mots.map((mot) => {
        const existant = trouverExistant(mot.en, {
          catalogue: contenu.mots, perso: state.perso,
        });

        // §5.2 — une entrée par sens, mais on prévient au lieu de dupliquer
        // en silence. Quand le sens proposé est celui qu'on connaît déjà, il
        // n'y a pas de polysémie : inutile de proposer un doublon.
        const memeSens = existant && normaliser(existant.fr) === normaliser(mot.fr);
        let avertissement_doublon = null;
        if (memeSens) {
          avertissement_doublon = `Tu connais déjà « ${existant.en} » avec ce sens.`;
        } else if (existant) {
          avertissement_doublon =
            `Tu connais déjà « ${existant.en} » = ${existant.fr}. Ajouter le sens « ${mot.fr} » ?`;
        }

        const palierMot = palierPourRang(mot.rang_freq);
        const avertissement_palier =
          palierMot && palierMot - palierCourant >= ECART_PALIER_ALERTE
            ? `Ce mot est au palier ${palierMot}, tu es au palier ${palierCourant}.`
            : null;

        // La phrase voyage avec chaque mot : c'est elle qui deviendra
        // l'exercice à trous du rappel actif (§3.4).
        return { ...mot, existant, doublon: Boolean(existant), memeSens,
                 phrase_en: phrase_en ?? texte, phrase_fr: phrase_fr ?? null,
                 avertissement_doublon, avertissement_palier };
      });

      return { ok: true, phrase_en: phrase_en ?? texte, phrase_fr, mots: enrichis };
    },

    /** Enregistrement : source « perso », direction file de découverte (§3.1). */
    onSave: (retenus) => {
      const date = aujourdhui();
      const perso = [...(state.perso ?? [])];
      const nouveaux = [];

      for (const mot of retenus) {
        const id = prochainIdPerso([...perso, ...nouveaux]);
        nouveaux.push(motDepuisTraduction({
          mot,
          phrase_en: mot.phrase_en ?? null,
          phrase_fr: mot.phrase_fr ?? null,
          existant: mot.existant ?? null,
          id,
          date,
        }));
      }

      enregistrer(ajouterMotsPerso(state, nouveaux), { silencieux: true });

      messages.replaceChildren(Toast({
        message: nouveaux.length === 1
          ? "1 mot ajouté. Tu le découvriras à la prochaine session."
          : `${nouveaux.length} mots ajoutés. Tu les découvriras à la prochaine session.`,
        variant: "success",
        duration: 5000,
      }));
    },
  }));

  /* --- Import d'une liste de mots --------------------------------------- */

  // Le sélecteur de fichier n'a pas d'équivalent dans l'inventaire §12 : il
  // reste masqué, et c'est un `Button` qui le déclenche.
  const selecteurMots = document.createElement("input");
  selecteurMots.type = "file";
  selecteurMots.accept = "application/json,.json";
  selecteurMots.className = "settings__file";
  selecteurMots.addEventListener("change", async () => {
    const fichier = selecteurMots.files?.[0];
    if (!fichier) return;

    const verdict = motsDepuisImport(await fichier.text(),
                                     { perso: state.perso ?? [], date: aujourdhui() });
    selecteurMots.value = "";

    if (!verdict.ok) {
      messages.replaceChildren(Toast({ message: verdict.erreur, variant: "error",
                                       duration: 6000 }));
      return;
    }

    enregistrer(ajouterMotsPerso(state, verdict.mots), { silencieux: true });

    // Un mot sans définition entrera en découverte mais sautera le quizz : il
    // vaut mieux le dire que de le laisser filer.
    const manquants = verdict.sansDefinition.length;
    const pluriel = verdict.mots.length > 1 ? "s" : "";
    messages.replaceChildren(Toast({
      message: `${verdict.mots.length} mot${pluriel} importé${pluriel}.`
        + (manquants ? ` ${manquants} sans définition : ils n'iront pas au quizz.` : ""),
      variant: manquants ? "info" : "success",
      duration: 6000,
    }));
  });
  corps.append(selecteurMots);

  corps.append(Button({
    label: "Importer une liste de mots",
    icon: "upload",
    variant: "secondary",
    fullWidth: true,
    onClick: () => selecteurMots.click(),
  }));

  corps.append(messages);
  corps.append(listeDesAjouts(state));
  return el;
}

/**
 * Liste des mots déjà ajoutés (§01).
 *
 * On sépare ce qui attend encore le tri de ce qui est entré dans le circuit :
 * sans cette distinction, l'utilisateur ne sait pas si son ajout a servi à
 * quelque chose.
 *
 * @param {object} state
 * @returns {HTMLElement}
 */
function listeDesAjouts(state) {
  const fiches = state.words ?? {};
  const perso = [...(state.perso ?? [])].reverse();
  const enrichir = (mot) => ({ ...mot, b: fiches[mot.id]?.b });

  return WordList({
    showBox: true,
    groupes: [
      {
        titre: "En attente de découverte",
        vide: "Tout ce que tu as ajouté est déjà passé en découverte.",
        mots: perso.filter((mot) => !fiches[mot.id]).map(enrichir),
      },
      {
        titre: "Déjà découverts",
        vide: "Aucun de tes ajouts n'est encore passé en découverte.",
        mots: perso.filter((mot) => fiches[mot.id]).map(enrichir),
      },
    ],
  });
}
