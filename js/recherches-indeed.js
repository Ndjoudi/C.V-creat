// ── RACCOURCIS DE RECHERCHE (INDEED ET LINKEDIN) ───────────
// Menus déroulants des boutons bleus « Indeed » et « LinkedIn » du tableau
// de bord : un clic sur une catégorie ouvre la recherche correspondante
// dans un nouvel onglet. Mêmes catégories pour les deux sites.
// Filtres repris de la recherche de l'utilisateur : Île-de-France,
// tri par date, types de contrat (sc=…). Seul le mot-clé change.
// Pour ajouter une catégorie : une ligne dans RECHERCHES_INDEED.

const INDEED_FILTRES =
  '&l=%C3%8Ele-de-France&sort=date&fromage=last' +
  '&sc=0kf%3Aattr%285QWDV%7C8YWGX%7CCF3CP%252COR%29%3B';

const RECHERCHES_INDEED = [
  { groupe: 'Approvisionnement et planification', liste: [
    ['Approvisionneur',             'approvisionneur'],
    ['Planificateur',               'planificateur'],
    ['Demand planner / prévisions', 'demand planner'],
    ['Supply planner / S&OP',       'supply planner'],
    ['Gestionnaire de stocks',      'gestionnaire de stocks'],
  ]},
  { groupe: 'Transport et flux', liste: [
    ['Affréteur / exploitant',      'affréteur'],
    ['Responsable transport',       'responsable transport'],
    ['ADV',                         'ADV'],
    ['Import-export / douane',      'import export'],
  ]},
  { groupe: 'Entrepôt et opérations', liste: [
    ["Chef d'équipe logistique",    "chef d'équipe logistique"],
    ['Responsable de quai',         'responsable de quai'],
    ["Responsable d'exploitation",  "responsable d'exploitation logistique"],
    ["Responsable d'activité",      "responsable d'activité logistique"],
  ]},
  { groupe: 'Pilotage et amélioration', liste: [
    ['Analyste supply chain',       'analyste supply chain'],
    ['Amélioration continue',       'amélioration continue logistique'],
    ['Chef de projet supply chain', 'chef de projet supply chain'],
    ['Coordinateur logistique',     'coordinateur logistique'],
  ]},
  { groupe: 'Achats et encadrement', liste: [
    ['Acheteur',                    'acheteur'],
    ['Responsable logistique',      'responsable logistique'],
  ]},
];

function lienIndeed(motCle) {
  return 'https://fr.indeed.com/jobs?q=' + encodeURIComponent(motCle) + INDEED_FILTRES;
}

// LinkedIn : même zone que le bouton existant (geoId Île-de-France),
// tri par date, offres de la semaine.
const LINKEDIN_FILTRES = '&geoId=104246759&sortBy=DD&f_TPR=r604800';

function lienLinkedIn(motCle) {
  return 'https://www.linkedin.com/jobs/search/?keywords=' + encodeURIComponent(motCle) + LINKEDIN_FILTRES;
}

// Un seul moteur pour les deux menus : mêmes catégories, même suivi
const SITES_RECHERCHE = {
  indeed: {
    lien: lienIndeed,
    tout: 'https://fr.indeed.com/jobs?q=&l=%C3%8Ele-de-France',
    libelleTout: 'Toutes les offres Île-de-France'
  },
  linkedin: {
    lien: lienLinkedIn,
    tout: 'https://www.linkedin.com/jobs/search/?keywords=supply%20chain' + LINKEDIN_FILTRES,
    libelleTout: 'Toutes les offres « supply chain »'
  }
};

// ── MÉMOIRE DES RECHERCHES LANCÉES ─────────────────────────
// Date du dernier clic par catégorie, pour savoir d'un coup d'œil ce qui
// reste à faire. Enregistré dans le navigateur (sc_indeed_clics).
const INDEED_CLICS = 'sc_indeed_clics';

function _clicsIndeed() {
  try { return JSON.parse(localStorage.getItem(INDEED_CLICS)) || {}; } catch { return {}; }
}

// Reprise : avant l'arrivée de LinkedIn, les clics étaient enregistrés sans
// préfixe de site. On les rattache à Indeed pour ne rien perdre.
(function _repriseClics() {
  try {
    const clics = _clicsIndeed();
    let change = false;
    Object.keys(clics).forEach(k => {
      if (!k.includes(':')) { clics['indeed:' + k] = clics[k]; delete clics[k]; change = true; }
    });
    if (change) localStorage.setItem(INDEED_CLICS, JSON.stringify(clics));
  } catch {}
})();

function _jour(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function _noteClicIndeed(cle) {
  const clics = _clicsIndeed();
  clics[cle] = _jour();
  localStorage.setItem(INDEED_CLICS, JSON.stringify(clics));
}

// Rythme quotidien : vert si la recherche est faite aujourd'hui, rouge sinon.
// Le texte rappelle la date du dernier clic.
function _etatIndeed(cle) {
  const date = _clicsIndeed()[cle];
  if (!date) return { texte: 'jamais', classe: 'ri-etat--oublie' };
  const jours = Math.round((new Date(_jour()) - new Date(date)) / 86400000);
  if (jours <= 0)  return { texte: '✓ aujourd\'hui', classe: 'ri-etat--fait' };
  if (jours === 1) return { texte: 'hier',            classe: 'ri-etat--oublie' };
  return { texte: `il y a ${jours} j`,                classe: 'ri-etat--oublie' };
}

// Redessiné à chaque ouverture : les dates sont donc toujours à jour
function renderMenuRecherche(site) {
  const conf    = SITES_RECHERCHE[site];
  const panneau = document.getElementById('ri-panneau-' + site);
  if (!conf || !panneau) return;
  panneau.innerHTML = `
    <a class="ri-lien ri-lien--tout" href="${conf.tout}" target="_blank" rel="noopener">${esc(conf.libelleTout)}</a>
    ${RECHERCHES_INDEED.map(g => `
      <div class="ri-groupe">${esc(g.groupe)}</div>
      ${g.liste.map(([libelle, motCle]) => {
        const e = _etatIndeed(site + ':' + motCle);
        return `<a class="ri-lien" href="${conf.lien(motCle)}" target="_blank" rel="noopener" data-mot="${esc(site + ':' + motCle)}">
          <span>${esc(libelle)}</span><span class="ri-etat ${e.classe}">${esc(e.texte)}</span></a>`;
      }).join('')}`).join('')}`;

  if (panneau.dataset.pret) return;
  panneau.dataset.pret = '1';
  // Un clic retient la date du jour pour cette catégorie, puis referme le menu
  panneau.addEventListener('click', e => {
    const lien = e.target.closest('a[data-mot]');
    if (lien) _noteClicIndeed(lien.dataset.mot);
    if (e.target.closest('a')) fermeMenusRecherche();
  });
}

function basculeMenuRecherche(site, e) {
  e.stopPropagation();
  const panneau = document.getElementById('ri-panneau-' + site);
  if (!panneau) return;
  const ouvrir = panneau.hidden;
  fermeMenusRecherche();
  if (!ouvrir) return;
  renderMenuRecherche(site);
  panneau.hidden = false;
  document.querySelector(`#ri-menu-${site} .ri-bouton`)?.setAttribute('aria-expanded', 'true');
}

function fermeMenusRecherche() {
  Object.keys(SITES_RECHERCHE).forEach(site => {
    const panneau = document.getElementById('ri-panneau-' + site);
    if (panneau && !panneau.hidden) {
      panneau.hidden = true;
      document.querySelector(`#ri-menu-${site} .ri-bouton`)?.setAttribute('aria-expanded', 'false');
    }
  });
}

// Fermeture : clic ailleurs ou touche Échap
document.addEventListener('click', e => { if (!e.target.closest('.ri-menu')) fermeMenusRecherche(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') fermeMenusRecherche(); });
