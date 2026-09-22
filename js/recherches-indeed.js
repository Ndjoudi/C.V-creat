// ── RACCOURCIS DE RECHERCHE INDEED ─────────────────────────
// Menu déroulant du bouton bleu « Indeed » (tableau de bord) : un clic sur
// une catégorie ouvre la recherche Indeed correspondante dans un nouvel onglet.
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

// Toutes les offres de la zone, sans mot-clé (ancien lien du bouton)
const INDEED_TOUTES = 'https://fr.indeed.com/jobs?q=&l=%C3%8Ele-de-France';

function renderMenuIndeed() {
  const panneau = document.getElementById('ri-panneau');
  if (!panneau || panneau.dataset.pret) return;
  panneau.dataset.pret = '1';
  panneau.innerHTML = `
    <a class="ri-lien ri-lien--tout" href="${INDEED_TOUTES}" target="_blank" rel="noopener">Toutes les offres Île-de-France</a>
    ${RECHERCHES_INDEED.map(g => `
      <div class="ri-groupe">${esc(g.groupe)}</div>
      ${g.liste.map(([libelle, motCle]) =>
        `<a class="ri-lien" href="${lienIndeed(motCle)}" target="_blank" rel="noopener">${esc(libelle)}</a>`
      ).join('')}`).join('')}`;
  // Un clic sur un lien ouvre Indeed et referme le menu
  panneau.addEventListener('click', e => { if (e.target.closest('a')) fermeMenuIndeed(); });
}

function basculeMenuIndeed(e) {
  e.stopPropagation();
  const panneau = document.getElementById('ri-panneau');
  if (!panneau) return;
  renderMenuIndeed();
  const ouvrir = panneau.hidden;
  panneau.hidden = !ouvrir;
  document.querySelector('#ri-menu .ri-bouton')?.setAttribute('aria-expanded', String(ouvrir));
}

function fermeMenuIndeed() {
  const panneau = document.getElementById('ri-panneau');
  if (panneau && !panneau.hidden) {
    panneau.hidden = true;
    document.querySelector('#ri-menu .ri-bouton')?.setAttribute('aria-expanded', 'false');
  }
}

// Fermeture : clic ailleurs ou touche Échap
document.addEventListener('click', e => { if (!e.target.closest('#ri-menu')) fermeMenuIndeed(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') fermeMenuIndeed(); });
