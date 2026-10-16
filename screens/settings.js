import { SessionHeader } from "../components/molecules/session-header.js";
import { Button } from "../components/atoms/button.js";
import { Counter } from "../components/atoms/counter.js";
import { Toast } from "../components/atoms/toast.js";
import { Chip } from "../components/atoms/chip.js";
import { Divider } from "../components/atoms/divider.js";
import { exporter, importer, nomFichierSauvegarde,
         sauvegardeARappeler } from "../services/store.js";
import { aujourdhui } from "../services/leitner.js";
import { identifiant, definirIdentifiant, sauvegarderEnLigne,
         restaurerDepuisLigne } from "../services/sync.js";

/** Objectif quotidien : bornes raisonnables, pas de saisie libre. */
const OBJECTIF_MIN = 1;
const OBJECTIF_MAX = 20;

/**
 * Settings — export/import, objectif quotidien, erreurs de contenu (§11).
 * @param {{state:object, contenu:object, aller:Function, enregistrer:Function}} contexte
 * @returns {HTMLElement}
 */
export function Settings({ state, contenu, aller, enregistrer }) {
  const el = document.createElement("main");
  el.className = "ecran settings";

  el.append(SessionHeader({ title: "Réglages", onHome: () => aller("/") }));

  const corps = document.createElement("div");
  corps.className = "ecran__body";

  const messages = document.createElement("div");
  messages.className = "settings__messages";
  const dire = (message, variant) => messages.append(Toast({ message, variant, duration: 4000 }));

  /* --- Sauvegarde ------------------------------------------------------- */

  /* --- Sauvegarde en ligne ---------------------------------------------- */

  const titreLigne = document.createElement("h2");
  titreLigne.className = "settings__title";
  titreLigne.textContent = "Sauvegarde en ligne";
  corps.append(titreLigne);

  const noteLigne = document.createElement("p");
  noteLigne.className = "settings__note";
  noteLigne.textContent =
    "La progression est recopiée sur le serveur à chaque changement. "
    + "Recopie cet identifiant sur un autre appareil pour y retrouver la même "
    + "progression — c'est lui, et lui seul, qui donne accès à la sauvegarde.";
  corps.append(noteLigne);

  const champId = document.createElement("input");
  champId.type = "text";
  champId.className = "settings__field";
  champId.spellcheck = false;
  champId.value = identifiant();
  champId.setAttribute("aria-label", "Identifiant de synchronisation");
  corps.append(champId);

  /** L'identifiant affiché fait foi : on le retient avant d'agir. */
  const idChoisi = () => definirIdentifiant(champId.value) ?? identifiant();

  corps.append(Button({
    label: "Sauvegarder en ligne",
    fullWidth: true,
    onClick: async () => {
      const verdict = await sauvegarderEnLigne({ state, id: idChoisi() });
      dire(verdict.ok ? "Progression sauvegardée en ligne." : verdict.erreur,
           verdict.ok ? "success" : "error");
    },
  }));

  corps.append(Button({
    label: "Restaurer depuis le serveur",
    variant: "secondary",
    fullWidth: true,
    onClick: async () => {
      const verdict = await restaurerDepuisLigne({ id: idChoisi() });
      if (!verdict.ok) { dire(verdict.erreur, "error"); return; }
      const relu = importer(verdict.donnees);
      if (!relu.ok) { dire(relu.erreur, "error"); return; }
      // Silencieux : un enregistrement ordinaire re-rend l'écran, ce qui
      // emporterait la confirmation qu'on vient d'afficher.
      enregistrer(relu.state, { silencieux: true });
      dire("Progression restaurée.", "success");
    },
  }));

  corps.append(Divider({ spacing: 5 }));

  /* --- Sauvegarde dans un fichier --------------------------------------- */

  const titreSauvegarde = document.createElement("h2");
  titreSauvegarde.className = "settings__title";
  titreSauvegarde.textContent = "Sauvegarde";
  corps.append(titreSauvegarde);

  const avertissement = document.createElement("p");
  avertissement.className = "settings__note";
  avertissement.textContent =
    "localStorage se vide au nettoyage du navigateur. Sans export, la progression disparaît.";
  corps.append(avertissement);

  // Rappel des 30 jours (§6). Il disparaît dès que la sauvegarde est faite :
  // l'écran ne se re-rend pas à ce moment-là, pour ne pas effacer la
  // confirmation qui vient de s'afficher.
  const rappel = sauvegardeARappeler(state)
    ? Toast({ message: "Il est temps de sauvegarder ta progression.",
              variant: "info", duration: 0 })
    : null;
  if (rappel) corps.append(rappel);

  corps.append(Button({
    label: "Sauvegarder ma progression",
    icon: "download",
    fullWidth: true,
    onClick: () => {
      const date = aujourdhui();
      const sauvegarde = exporter(state, date);
      telecharger(JSON.stringify(sauvegarde, null, 2), nomFichierSauvegarde(date));
      enregistrer(sauvegarde, { silencieux: true });
      rappel?.remove();
      dire("Sauvegarde téléchargée.", "success");
    },
  }));

  // Le sélecteur de fichier n'a pas d'équivalent dans l'inventaire §10 : il
  // reste masqué et c'est un `Button` qui le déclenche.
  const selecteur = document.createElement("input");
  selecteur.type = "file";
  selecteur.accept = "application/json,.json";
  selecteur.className = "settings__file";
  selecteur.addEventListener("change", async () => {
    const fichier = selecteur.files?.[0];
    if (!fichier) return;
    const verdict = importer(await fichier.text());
    selecteur.value = "";
    if (!verdict.ok) {
      dire(verdict.erreur, "error");
      return;
    }
    enregistrer(verdict.state);
    dire("Progression restaurée.", "success");
  });
  corps.append(selecteur);

  corps.append(Button({
    label: "Restaurer une sauvegarde",
    icon: "upload",
    variant: "secondary",
    fullWidth: true,
    onClick: () => selecteur.click(),
  }));

  corps.append(Divider({ spacing: 5 }));

  /* --- Objectif quotidien ------------------------------------------------ */

  const titreObjectif = document.createElement("h2");
  titreObjectif.className = "settings__title";
  titreObjectif.textContent = "Objectif quotidien";
  corps.append(titreObjectif);

  const reglage = document.createElement("div");
  reglage.className = "settings__objectif";
  const objectif = Number(state.progression.objectif_quotidien ?? 5);

  const changer = (delta) => {
    const valeur = Math.min(Math.max(objectif + delta, OBJECTIF_MIN), OBJECTIF_MAX);
    if (valeur === objectif) return;
    enregistrer({
      ...state,
      progression: { ...state.progression, objectif_quotidien: valeur },
    });
  };

  reglage.append(
    Button({ label: "−", variant: "secondary", disabled: objectif <= OBJECTIF_MIN,
             onClick: () => changer(-1) }),
    Counter({ value: objectif, label: "mots par jour" }),
    Button({ label: "+", variant: "secondary", disabled: objectif >= OBJECTIF_MAX,
             onClick: () => changer(1) }),
  );
  corps.append(reglage);

  corps.append(Divider({ spacing: 5 }));

  /* --- État du contenu --------------------------------------------------- */

  const titreContenu = document.createElement("h2");
  titreContenu.className = "settings__title";
  titreContenu.textContent = "Contenu";
  corps.append(titreContenu);

  const filieres = document.createElement("div");
  filieres.className = "settings__filieres";
  filieres.append(Chip({ label: `${contenu.paliers.length} palier(s)`, variant: "palier" }));
  const livrees = Object.entries(contenu.filieres ?? {}).filter(([, presente]) => presente);
  for (const [nom] of livrees) filieres.append(Chip({ label: nom, variant: "source" }));
  if (!navigator.onLine) {
    filieres.append(Chip({ label: "hors ligne", variant: "theme" }));
  }
  corps.append(filieres);

  if (!livrees.length) {
    const aVenir = document.createElement("p");
    aVenir.className = "settings__note";
    aVenir.textContent =
      "Filières verbes, phrasal verbs et expressions : contenu pas encore livré.";
    corps.append(aVenir);
  }

  const horsLigne = document.createElement("p");
  horsLigne.className = "settings__note";
  horsLigne.textContent = navigator.onLine
    ? "Tout le contenu est local : l'application fonctionne sans réseau."
    : "Hors ligne. Tout fonctionne normalement : le contenu est local.";
  corps.append(horsLigne);

  const anomalies = contenu.erreurs ?? [];
  if (anomalies.length) {
    const titreErreurs = document.createElement("h3");
    titreErreurs.className = "settings__subtitle";
    titreErreurs.textContent = `${anomalies.length} anomalie(s) de contenu`;
    corps.append(titreErreurs);

    const liste = document.createElement("ul");
    liste.className = "settings__errors";
    for (const anomalie of anomalies) {
      const ligne = document.createElement("li");
      ligne.className = `settings__error${anomalie.bloquant ? " settings__error--bloquant" : ""}`;

      const fichier = document.createElement("span");
      fichier.className = "settings__error-file";
      fichier.textContent = anomalie.fichier;
      ligne.append(fichier);

      const texte = document.createElement("span");
      texte.className = "settings__error-text";
      texte.textContent = anomalie.message;
      ligne.append(texte);
      liste.append(ligne);
    }
    corps.append(liste);
  } else {
    const rien = document.createElement("p");
    rien.className = "settings__note";
    rien.textContent = "Aucune anomalie de contenu.";
    corps.append(rien);
  }

  corps.append(messages);
  el.append(corps);
  return el;
}

/** Déclenche le téléchargement d'un fichier texte. */
function telecharger(contenu, nom) {
  const lien = document.createElement("a");
  const url = URL.createObjectURL(new Blob([contenu], { type: "application/json" }));
  lien.href = url;
  lien.download = nom;
  lien.click();
  URL.revokeObjectURL(url);
}
