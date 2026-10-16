import { Button } from "../atoms/button.js";
import { Chip } from "../atoms/chip.js";
import { Divider } from "../atoms/divider.js";
import { IconButton } from "../atoms/icon-button.js";
import { disponible as microDisponible, ecouter } from "../../services/speech.js";

/**
 * CompositionForm — rédaction libre, troisième mode de §08 (README §12.3).
 *
 * Le seul endroit de l'application où l'utilisateur écrit plusieurs phrases
 * sans modèle. Deux contrôles très différents y cohabitent :
 *
 *  - les **mots imposés** sont vérifiés en local, à chaque frappe. C'est
 *    instantané, ça marche hors ligne, et ça ne juge pas la langue.
 *  - la **correction linguistique** part à l'API (§16), à la demande.
 *
 * L'exercice garde donc du sens sans réseau : on peut écrire, voir qu'on a
 * bien placé ses mots, et demander la correction plus tard.
 *
 * @param {object}   consigne     { fr, en }
 * @param {object[]} mots         mots imposés
 * @param {Function} onCheck      reçoit le texte, renvoie { employes, manquants, nbMots }
 * @param {Function} onCorriger   demande la correction à l'API
 * @param {Function} onTerminer
 * @returns {HTMLElement}
 */
export function CompositionForm({ consigne = {}, mots = [], onCheck,
                                  onCorriger, onTerminer } = {}) {
  const el = document.createElement("section");
  el.className = "composition";

  const titre = document.createElement("h2");
  titre.className = "composition__consigne";
  titre.textContent = consigne.fr ?? "";
  el.append(titre);

  if (consigne.en) {
    const anglais = document.createElement("p");
    anglais.className = "composition__consigne-en";
    anglais.lang = "en";
    anglais.textContent = consigne.en;
    el.append(anglais);
  }

  /* --- Mots imposés ------------------------------------------------------ */

  const zoneMots = document.createElement("div");
  zoneMots.className = "composition__mots";
  el.append(zoneMots);

  const rendreMots = (employes = []) => {
    zoneMots.replaceChildren();
    const faits = new Set(employes);
    for (const mot of mots) {
      zoneMots.append(Chip({
        label: mot.en,
        variant: faits.has(mot.en) ? "success" : "theme",
      }));
    }
  };
  rendreMots();

  /* --- Saisie ------------------------------------------------------------ */

  const champ = document.createElement("textarea");
  champ.className = "composition__field";
  champ.lang = "en";
  champ.rows = 8;
  champ.autocapitalize = "sentences";
  champ.spellcheck = false;
  champ.setAttribute("aria-label", consigne.fr ?? "Ta rédaction");
  el.append(champ);

  const compteur = document.createElement("p");
  compteur.className = "composition__compteur";
  el.append(compteur);

  /*
   * Micro : la voix AJOUTE au texte, elle ne le remplace pas.
   *
   * Une rédaction s'écrit en plusieurs fois. Écraser ce qui est déjà là au
   * premier essai de dictée coûterait tout le paragraphe précédent.
   */
  if (microDisponible()) {
    const zone = document.createElement("div");
    zone.className = "composition__micro";

    let ecoute = null;
    zone.append(IconButton({
      icon: "mic",
      label: "Dicter la suite du texte",
      variant: "secondary",
      onClick: async () => {
        if (ecoute) { ecoute.arreter(); return; }
        zone.classList.add("composition__micro--actif");
        ecoute = ecouter();
        const resultat = await ecoute.promesse;
        ecoute = null;
        zone.classList.remove("composition__micro--actif");

        if (!resultat.ok) { compteur.textContent = resultat.erreur; return; }
        const separateur = champ.value.trim() ? " " : "";
        champ.value = `${champ.value.trimEnd()}${separateur}${resultat.texte}`;
        champ.focus();
        majSuivi();
      },
    }));
    el.append(zone);
  }

  const majSuivi = () => {
    const bilan = onCheck?.(champ.value) ?? { employes: [], manquants: [], nbMots: 0 };
    rendreMots(bilan.employes);
    compteur.textContent = bilan.manquants.length
      ? `${bilan.nbMots} mots · il te reste à placer : ${bilan.manquants.join(", ")}`
      : `${bilan.nbMots} mots · tous les mots imposés sont placés`;
    return bilan;
  };
  champ.addEventListener("input", majSuivi);
  majSuivi();

  /* --- Retour de l'API --------------------------------------------------- */

  const retour = document.createElement("div");
  retour.className = "composition__retour";
  el.append(retour);

  const actions = document.createElement("div");
  actions.className = "composition__actions";
  actions.append(
    Button({
      label: "Demander la correction",
      variant: "secondary",
      fullWidth: true,
      onClick: () => onCorriger?.(champ.value, retour),
    }),
    Button({
      label: "J'ai terminé",
      fullWidth: true,
      onClick: () => onTerminer?.(champ.value, majSuivi()),
    }),
  );
  el.append(Divider({ spacing: 4 }));
  el.append(actions);

  return el;
}
