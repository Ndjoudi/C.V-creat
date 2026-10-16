import { SessionHeader } from "../components/molecules/session-header.js";
import { StatRow } from "../components/molecules/stat-row.js";
import { ProgressBar } from "../components/atoms/progress-bar.js";
import { Chip } from "../components/atoms/chip.js";
import { Button } from "../components/atoms/button.js";
import { Divider } from "../components/atoms/divider.js";
import { PalierList } from "../components/organisms/palier-list.js";
import { repartitionParBoite, motsDus, BOITE_MAX, DELAIS, motsConnus } from "../services/leitner.js";
import { entreesPaliers, choisirPalier } from "../services/session-builder.js";

/**
 * Progress — statistiques, paliers, répartition par boîte (README §11).
 * @param {{state:object, contenu:object, aller:Function}} contexte
 * @returns {HTMLElement}
 */
export function Progress({ state, contenu, aller, enregistrer }) {
  const el = document.createElement("main");
  el.className = "ecran progress";

  el.append(SessionHeader({ title: "Progression", onHome: () => aller("/") }));

  const corps = document.createElement("div");
  corps.className = "ecran__body";

  const fiches = state.words ?? {};
  const total = Object.keys(fiches).length;

  if (total === 0) {
    const vide = document.createElement("div");
    vide.className = "ecran__empty";

    const message = document.createElement("p");
    message.className = "ecran__empty-text";
    message.textContent = "Aucun mot travaillé pour l'instant. Une session suffit pour remplir cette page.";
    vide.append(message);

    vide.append(Button({ label: "Commencer une session", fullWidth: true,
                         onClick: () => aller("/session") }));
    corps.append(vide);
    corps.append(Divider({ spacing: 5 }));
    corps.append(titrePaliers());
    corps.append(listePaliers());
    el.append(corps);
    return el;
  }

  const dus = motsDus(state).length;
  const repartition = repartitionParBoite(fiches);
  const acquis = repartition[BOITE_MAX - 1];

  const stats = document.createElement("div");
  stats.className = "progress__stats";
  stats.append(
    StatRow({ label: "Mots connus", value: `${motsConnus(state).length}`, icon: "check" }),
    StatRow({ label: "Mots rencontrés", value: total, icon: "book" }),
    StatRow({ label: "Mots acquis", value: acquis, icon: "check" }),
    StatRow({ label: "À réviser aujourd'hui", value: dus, icon: "chart" }),
    StatRow({ label: "Objectif quotidien", value: state.progression.objectif_quotidien ?? 5, icon: "settings" }),
  );
  corps.append(stats);
  corps.append(Divider({ spacing: 5 }));

  const titreBoites = document.createElement("h2");
  titreBoites.className = "progress__title";
  titreBoites.textContent = "Répartition par boîte";
  corps.append(titreBoites);

  const boites = document.createElement("div");
  boites.className = "progress__boxes";
  repartition.forEach((compte, rang) => {
    const ligne = document.createElement("div");
    ligne.className = "progress__box";

    const etiquette = document.createElement("div");
    etiquette.className = "progress__box-head";
    etiquette.append(Chip({ label: `Boîte ${rang + 1}`, variant: "palier" }));

    const delai = document.createElement("span");
    delai.className = "progress__box-delay";
    delai.textContent = `${DELAIS[rang]} j — ${compte} mot${compte > 1 ? "s" : ""}`;
    etiquette.append(delai);
    ligne.append(etiquette);

    ligne.append(ProgressBar({
      value: compte, max: total,
      variant: rang + 1 === BOITE_MAX ? "success" : "primary",
    }));
    boites.append(ligne);
  });
  corps.append(boites);
  corps.append(Divider({ spacing: 5 }));

  corps.append(titrePaliers());

  const paliers = listePaliers();
  corps.append(paliers);

  el.append(corps);
  return el;

  function titrePaliers() {
    const h = document.createElement("h2");
    h.className = "progress__title";
    h.textContent = "Paliers";
    return h;
  }

  /**
   * Tous les paliers du manifeste, y compris ceux qui ne sont pas chargés :
   * l'utilisateur doit voir où il va (chargement paresseux, §6).
   */
  function listePaliers() {
    return PalierList({
      paliers: entreesPaliers(state, contenu.mots, contenu.manifeste),
      current: state.progression?.palier_actuel,
      onSelect: (id) => enregistrer(choisirPalier(state, id)),
    });
  }
}
