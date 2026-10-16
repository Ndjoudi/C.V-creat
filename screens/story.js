import { SessionHeader } from "../components/molecules/session-header.js";
import { Button } from "../components/atoms/button.js";
import { Toast } from "../components/atoms/toast.js";
import { TranslationPopover } from "../components/molecules/translation-popover.js";
import { Spinner } from "../components/atoms/spinner.js";
import { StoryReader } from "../components/organisms/story-reader.js";
import { choisirHistoire, appliquerHistoire, requeteHistoire,
         histoireDepuisApi, idHistoireGeneree,
         COUVERTURE_MIN } from "../services/story-builder.js";
import { genererHistoire } from "../services/api.js";
import { ajouterHistoireGeneree } from "../services/store.js";
import { motDepuisTraduction, prochainIdPerso,
         ajouterMotsPerso } from "../services/session-builder.js";
import { appliquerResultat, aujourdhui } from "../services/leitner.js";

/**
 * Story — section §06 « Histoire du jour » (README §2, §13).
 *
 * Un tap sur un mot affiche sa traduction et, si le mot est inconnu, propose
 * de l'ajouter à la file de découverte. Consulter la traduction d'un mot du
 * lexique l'empêche de monter d'une boîte : c'est le signal de maîtrise (§5).
 *
 * @param {{state:object, contenu:object, aller:Function, enregistrer:Function}} contexte
 * @returns {HTMLElement}
 */
export function Story({ state, contenu, aller, enregistrer }) {
  const el = document.createElement("main");
  el.className = "ecran story-screen";

  const today = aujourdhui();
  const histoires = contenu.histoires ?? [];
  const choix = choisirHistoire({ state, histoires, today });

  el.append(SessionHeader({ title: "Histoire du jour", onHome: () => aller("/") }));

  if (choix.dejaLue) {
    return vide(el, aller, "Tu as déjà lu l'histoire du jour. Reviens demain.");
  }
  if (choix.verrouille || !choix.histoire) {
    return vide(el, aller, choix.raison ?? "Aucune histoire disponible.");
  }

  let histoire = choix.histoire;
  /** Mots du lexique dont la traduction a été consultée. */
  const aides = new Set();
  /** Mots ajoutés à la file de découverte pendant la lecture. */
  const ajoutes = [];

  // Index en → entité, pour retrouver un mot tapé dans le texte.
  const parEn = new Map();
  for (const mot of contenu.mots.values()) if (!parEn.has(mot.en)) parEn.set(mot.en, mot);
  for (const mot of state.perso ?? []) if (!parEn.has(mot.en)) parEn.set(mot.en, mot);

  const corps = document.createElement("div");
  corps.className = "session__body";

  /**
   * Bandeau de couverture insuffisante, avec l'offre de génération (§16).
   *
   * Un seul bandeau existe : la zone d'action passe du bouton au spinner et
   * revient au bouton si l'appel échoue. Le texte reste lisible pendant ce
   * temps — l'utilisateur n'est jamais bloqué en attendant le réseau.
   */
  const bandeau = () => {
    const zone = document.createElement("div");
    zone.className = "story-screen__warning";

    const texte = document.createElement("p");
    texte.className = "story-screen__warning-text";
    texte.textContent =
      `Tu connais ${Math.round(choix.couverture * 100)}% des mots de ce texte, `
      + `en dessous des ${Math.round(COUVERTURE_MIN * 100)}% recommandés. `
      + "Il te faudra la traduction plus souvent que d'habitude.";
    zone.append(texte);

    const action = document.createElement("div");
    zone.append(action);

    const bouton = () => action.replaceChildren(Button({
      label: "Demander un texte à ma mesure",
      variant: "secondary",
      fullWidth: true,
      onClick: async () => {
        action.replaceChildren(Spinner({ size: "md" }));

        const requete = requeteHistoire({ state, catalogue: contenu.mots, histoires });
        const reponse = await genererHistoire(requete);

        if (!reponse.ok) {
          el.append(Toast({ message: reponse.erreur, variant: "error", duration: 5000 }));
          bouton();
          return;
        }

        const generee = histoireDepuisApi(reponse.donnees, {
          catalogue: contenu.mots,
          id: idHistoireGeneree(today),
          arc: requete.arc?.id ?? null,
        });
        if (!generee) { bouton(); return; }

        // L'histoire générée vit en localStorage, jamais dans /content (§16).
        ajouterHistoireGeneree(generee);
        histoire = generee;
        zone.remove();
        corps.replaceChildren(StoryReader({ histoire, onWordTap: taper, onFinish: terminer }));
      },
    }));

    bouton();
    el.append(zone);
  };

  if (!choix.suffisante) bandeau();

  /** Popover courant : un seul à la fois dans le DOM. */
  let popover = null;
  const fermer = () => { popover?.remove(); popover = null; };

  const taper = (nu, ancre) => {
    fermer();
    const mot = parEn.get(nu);
    if (!mot) return;

    // Consulter la traduction d'un mot du lexique le prive de sa montée (§5).
    if ((histoire.lexique ?? []).includes(mot.id)) aides.add(mot.id);

    const connu = Boolean(state.words?.[mot.id]) || ajoutes.some((m) => m.en === nu);
    popover = TranslationPopover({
      word: mot.en,
      translation: mot.fr,
      alreadyKnown: connu,
      canAdd: !connu,
      onAdd: () => {
        const ajout = motDepuisTraduction({
          mot: { en: mot.en, fr: mot.fr, type: mot.type ?? null },
          phrase_en: histoire.titre_en ?? null,
          phrase_fr: histoire.titre_fr ?? null,
          id: prochainIdPerso([...(state.perso ?? []), ...ajoutes]),
          date: today,
        });
        if (ajout) ajoutes.push(ajout);
        fermer();
      },
      onClose: fermer,
    });
    ancre.insertAdjacentElement("afterend", popover);
  };

  const terminer = () => {
    fermer();
    let suivant = appliquerHistoire({
      state, histoire, aides: [...aides], appliquer: appliquerResultat, today,
    });
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
    enregistrer(suivant);
    if (ajoutes.length) {
      el.append(Toast({
        message: `${ajoutes.length} mot(s) ajouté(s) à ta file de découverte.`,
        variant: "success",
        duration: 3000,
      }));
    }
    aller("/");
  };

  corps.append(StoryReader({ histoire, onWordTap: taper, onFinish: terminer }));
  el.append(corps);
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
