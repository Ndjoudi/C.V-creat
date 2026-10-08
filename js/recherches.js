// ── MES RECHERCHES ─────────────────────────────────────────
// Un seul bouton « Recherches » ouvre un panneau avec une colonne par site.
// Chaque ligne est simplement un NOM + une ADRESSE : un clic ouvre la page
// dans un nouvel onglet. Tout est modifiable depuis le site (bouton
// « Modifier ») : ajouter, renommer, changer l'adresse, supprimer, et
// ajouter ou supprimer un site.
//
// Stockage : sc_recherches = [{ id, nom, liens:[{ id, nom, url }] }]
// Suivi des clics : sc_indeed_clics, par identifiant de lien.

const CLE_RECHERCHES = 'sc_recherches';
const CLE_PANNEAU_OUVERT = 'sc_recherches_ouvert';
const CLE_CLICS      = 'sc_indeed_clics';

// ── POINT DE DÉPART ────────────────────────────────────────
// Les 19 catégories et les 3 sites déjà en place sont convertis une fois en
// lignes « nom + adresse ». Les identifiants reprennent « site:motclé »,
// ce qui conserve le suivi vert/rouge déjà enregistré.
const CATEGORIES_DEPART = [
  ['Approvisionnement et planification', [
    ['Approvisionneur',             'approvisionneur'],
    ['Planificateur',               'planificateur'],
    ['Demand planner / prévisions', 'demand planner'],
    ['Supply planner / S&OP',       'supply planner'],
    ['Gestionnaire de stocks',      'gestionnaire de stocks'] ]],
  ['Transport et flux', [
    ['Affréteur / exploitant',      'affréteur'],
    ['Responsable transport',       'responsable transport'],
    ['ADV',                         'ADV'],
    ['Import-export / douane',      'import export'] ]],
  ['Entrepôt et opérations', [
    ["Chef d'équipe logistique",    "chef d'équipe logistique"],
    ['Responsable de quai',         'responsable de quai'],
    ["Responsable d'exploitation",  "responsable d'exploitation logistique"],
    ["Responsable d'activité",      "responsable d'activité logistique"] ]],
  ['Pilotage et amélioration', [
    ['Analyste supply chain',       'analyste supply chain'],
    ['Amélioration continue',       'amélioration continue logistique'],
    ['Chef de projet supply chain', 'chef de projet supply chain'],
    ['Coordinateur logistique',     'coordinateur logistique'] ]],
  ['Achats et encadrement', [
    ['Acheteur',                    'acheteur'],
    ['Responsable logistique',      'responsable logistique'] ]]
];

const SITES_DEPART = [
  { id: 'indeed', nom: 'Indeed', couleur: '#2164f3',
    lien: m => 'https://fr.indeed.com/jobs?q=' + encodeURIComponent(m)
      + '&l=%C3%8Ele-de-France&sort=date&fromage=last'
      + '&sc=0kf%3Aattr%285QWDV%7C8YWGX%7CCF3CP%252COR%29%3B' },
  { id: 'linkedin', nom: 'LinkedIn', couleur: '#0a66c2',
    lien: m => 'https://www.linkedin.com/jobs/search/?keywords=' + encodeURIComponent(m)
      + '&geoId=104246759&sortBy=DD&f_TPR=r604800' },
  { id: 'hellowork', nom: 'HelloWork', couleur: '#16205B',
    lien: m => 'https://www.hellowork.com/fr-fr/emploi/recherche.html?k=' + encodeURIComponent(m)
      + '&k_autocomplete=&l=Ile-de-France&l_autocomplete=&st=relevance'
      + '&c=CDI&c=Travail_temp&c=Fonctionnaire&c=Freelance&cod=all&msa=0&ray=20&d=w' }
];

function _recherchesDepart() {
  return SITES_DEPART.map(s => {
    const elements = [];
    CATEGORIES_DEPART.forEach(([categorie, liens]) => {
      elements.push({ id: _nouvelId(), type: 'titre', nom: categorie });
      liens.forEach(([nom, motCle]) => elements.push({
        id: s.id + ':' + motCle,    // garde le suivi des clics déjà enregistré
        type: 'lien', nom, url: s.lien(motCle)
      }));
    });
    return { id: s.id, nom: s.nom, couleur: s.couleur, elements, rangeeParFamilles: true };
  });
}

function _sansAccent(t) {
  return (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

// Range une colonne dans les cinq familles d'origine, à la demande.
// Les intertitres existants sont remplacés ; les recherches inconnues
// (ajoutées à la main) sont conservées à la fin.
function _rangeColonne(site) {
  const restants = site.elements.filter(e => e.type === 'lien');
  const ranges = [];
  CATEGORIES_DEPART.forEach(([categorie, membres]) => {
    const dedans = [];
    membres.forEach(([nom, motCle]) => {
      const i = restants.findIndex(e =>
        e.id === site.id + ':' + motCle ||
        _sansAccent(e.nom) === _sansAccent(nom) ||
        _sansAccent(e.nom) === _sansAccent(motCle));
      if (i !== -1) dedans.push(restants.splice(i, 1)[0]);
    });
    if (dedans.length) ranges.push({ id: _nouvelId(), type: 'titre', nom: categorie }, ...dedans);
  });

  if (!ranges.length) return 0;
  site.elements = [...ranges, ...restants];
  site.rangeeParFamilles = true;
  return restants.length;        // recherches non reconnues, laissées à la fin
}

// Bouton « ⟲ Classer par familles » d'une colonne
function classeParFamilles(idSite) {
  const liste = recherches();
  const site = liste.find(x => x.id === idSite);
  if (!site) return;
  const titres = site.elements.filter(e => e.type === 'titre').length;
  if (!confirm(`Ranger « ${site.nom} » dans les 5 familles supply chain ?`
    + (titres ? `\n\nLes ${titres} catégorie${titres > 1 ? 's' : ''} actuelle${titres > 1 ? 's' : ''} seront remplacées.` : '')
    + `\nLes recherches que je ne reconnais pas resteront à la fin.`)) return;
  const inconnues = _rangeColonne(site);
  _sauveRecherches(liste);
  renderPanneauRecherches();
  toast(inconnues
    ? `✓ Rangé — ${inconnues} recherche${inconnues > 1 ? 's' : ''} non reconnue${inconnues > 1 ? 's' : ''} laissée${inconnues > 1 ? 's' : ''} à la fin`
    : '✓ Colonne rangée par familles');
}

// Rangement automatique : une colonne d'un site connu qui n'a plus de
// catégories (ou une seule) est reclassée une fois, sans rien demander.
function _rangementAuto(liste) {
  let change = false;
  liste.forEach(site => {
    if (!SITES_DEPART.find(d => d.id === site.id)) return;   // site ajouté à la main
    if (site.rangeeParFamilles) return;                      // déjà rangé une fois
    const titres = site.elements.filter(e => e.type === 'titre').length;
    if (titres >= 2) { site.rangeeParFamilles = true; change = true; return; }
    _rangeColonne(site);
    change = true;
  });
  return change;
}

function recherches() {
  const liste = ls(CLE_RECHERCHES, null);
  if (Array.isArray(liste) && liste.length) {
    // Reprise des listes enregistrées avant l'arrivée des catégories
    liste.forEach(s => {
      if (!s.elements) s.elements = (s.liens || []).map(l => ({ ...l, type: 'lien' }));
      s.elements.forEach(e => { if (!e.type) e.type = e.url ? 'lien' : 'titre'; });
      delete s.liens;
    });
    if (_rangementAuto(liste)) ss(CLE_RECHERCHES, liste);
    return liste;
  }
  const depart = _recherchesDepart();
  ss(CLE_RECHERCHES, depart);
  return depart;
}

function _sauveRecherches(liste) { ss(CLE_RECHERCHES, liste); }
function _nouvelId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ── SUIVI DES CLICS ────────────────────────────────────────
function _clics() {
  try { return JSON.parse(localStorage.getItem(CLE_CLICS)) || {}; } catch { return {}; }
}

function _jour(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function _noteClic(id) {
  const c = _clics();
  c[id] = _jour();
  localStorage.setItem(CLE_CLICS, JSON.stringify(c));
}

// Vert si la recherche a été lancée aujourd'hui, rouge sinon
function _etatClic(id) {
  const date = _clics()[id];
  if (!date) return { texte: 'jamais', classe: 'ri-etat--oublie' };
  const jours = Math.round((new Date(_jour()) - new Date(date)) / 86400000);
  if (jours <= 0)  return { texte: '✓ aujourd\'hui', classe: 'ri-etat--fait' };
  if (jours === 1) return { texte: 'hier',            classe: 'ri-etat--oublie' };
  return { texte: `il y a ${jours} j`,                classe: 'ri-etat--oublie' };
}

// ── MODIFICATIONS ──────────────────────────────────────────
let _modeEdition = false;

function basculeEditionRecherches() {
  _modeEdition = !_modeEdition;
  renderPanneauRecherches();
}

function ajouteSiteRecherche() {
  const nom = (prompt('Nom du site (ex. : APEC) :') || '').trim();
  if (!nom) return;
  const liste = recherches();
  liste.push({ id: _nouvelId(), nom, couleur: '#16205B', liens: [] });
  _sauveRecherches(liste);
  renderPanneauRecherches();
}

function supprimeSiteRecherche(idSite) {
  const liste = recherches();
  const s = liste.find(x => x.id === idSite);
  if (!s) return;
  const nb = (s.elements || []).filter(e => e.type === 'lien').length;
  if (!confirm(`Supprimer « ${s.nom} » et ses ${nb} recherche${nb > 1 ? 's' : ''} ?`)) return;
  _sauveRecherches(liste.filter(x => x.id !== idSite));
  renderPanneauRecherches();
}

// Un intertitre : « ça, c'est cette catégorie »
function ajouteCategorieRecherche(idSite) {
  const liste = recherches();
  const s = liste.find(x => x.id === idSite);
  if (!s) return;
  const nom = (prompt('Nom de la catégorie (ex. : Transport et flux) :') || '').trim();
  if (!nom) return;
  s.elements.push({ id: _nouvelId(), type: 'titre', nom });
  _sauveRecherches(liste);
  renderPanneauRecherches();
}

// Enregistre l'ordre affiché après un glisser-déposer
function _ordonneDepuisDOM(idSite, conteneur) {
  const liste = recherches();
  const s = liste.find(x => x.id === idSite);
  if (!s) return;
  const ordre = [...conteneur.querySelectorAll('[data-id]')].map(el => el.dataset.id);
  s.elements.sort((a, b) => ordre.indexOf(a.id) - ordre.indexOf(b.id));
  _sauveRecherches(liste);
}

// Glisser-déposer : on maintient la poignée ⠿ et on déplace la ligne
// Une catégorie et les recherches qui la suivent forment un bloc :
// on les déplace ensemble, jusqu'à la catégorie suivante.
function _blocDe(ligne) {
  if (ligne.dataset.type !== 'titre') return [ligne];
  const bloc = [ligne];
  let n = ligne.nextElementSibling;
  while (n && n.dataset.type !== 'titre') { bloc.push(n); n = n.nextElementSibling; }
  return bloc;
}

function _initGlisser(conteneur) {
  if (conteneur.dataset.glisserPret) return;
  conteneur.dataset.glisserPret = '1';
  let source = null;
  let bloc = [];

  conteneur.addEventListener('mousedown', e => {
    const poignee = e.target.closest('.rch-poignee');
    if (!poignee) return;
    poignee.closest('[data-id]').draggable = true;
  });
  conteneur.addEventListener('mouseup', () => {
    conteneur.querySelectorAll('[data-id]').forEach(el => el.draggable = false);
  });

  conteneur.addEventListener('dragstart', e => {
    source = e.target.closest('[data-id]');
    if (!source) return;
    bloc = _blocDe(source);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
    setTimeout(() => bloc.forEach(el => el.classList.add('rch-glisse')), 0);
  });

  conteneur.addEventListener('dragover', e => {
    e.preventDefault();
    const cible = e.target.closest('[data-id]');
    if (!cible || !source || bloc.includes(cible)) return;   // jamais dans son propre bloc
    const r = cible.getBoundingClientRect();
    const avant = e.clientY < r.top + r.height / 2;
    const repere = avant ? cible : cible.nextSibling;
    bloc.forEach(el => conteneur.insertBefore(el, repere));   // le bloc reste groupé
  });

  conteneur.addEventListener('drop', e => { e.preventDefault(); });

  conteneur.addEventListener('dragend', () => {
    if (!source) return;
    bloc.forEach(el => { el.classList.remove('rch-glisse'); el.draggable = false; });
    _ordonneDepuisDOM(conteneur.dataset.site, conteneur);
    source = null;
    bloc = [];
  });
}

function ajouteLienRecherche(idSite) {
  const liste = recherches();
  const s = liste.find(x => x.id === idSite);
  if (!s) return;
  const nom = (prompt('Nom affiché (ex. : Gestionnaire de flux) :') || '').trim();
  if (!nom) return;
  const url = (prompt('Adresse de la recherche — colle le lien complet depuis le site :') || '').trim();
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) { toast('L\'adresse doit commencer par https://'); return; }
  s.elements.push({ id: _nouvelId(), type: 'lien', nom, url });
  _sauveRecherches(liste);
  renderPanneauRecherches();
}

function supprimeLienRecherche(idSite, idLien) {
  const liste = recherches();
  const s = liste.find(x => x.id === idSite);
  if (!s) return;
  s.elements = s.elements.filter(l => l.id !== idLien);
  _sauveRecherches(liste);
  renderPanneauRecherches();
}

// Renommage et changement d'adresse, à la sortie du champ
function majRecherche(idSite, idLien, champ, valeur) {
  const liste = recherches();
  const s = liste.find(x => x.id === idSite);
  if (!s) return;
  const val = (valeur || '').trim();
  if (!val) return;
  if (!idLien) { s.nom = val; }
  else {
    const l = s.elements.find(x => x.id === idLien);
    if (l) l[champ] = val;
  }
  _sauveRecherches(liste);
}

// ── AFFICHAGE ──────────────────────────────────────────────
function renderPanneauRecherches() {
  const panneau = document.getElementById('rch-panneau');
  if (!panneau) return;
  const liste = recherches();

  const colonnes = liste.map(s => {
    const tete = _modeEdition
      ? `<input class="inp rch-champ-site" value="${esc(s.nom)}"
           onblur="majRecherche('${s.id}', null, 'nom', this.value)">
         <button class="rch-suppr-site" title="Supprimer ce site"
           onclick="supprimeSiteRecherche('${s.id}')">× Supprimer le site</button>`
      : `<div class="rch-site-nom" style="color:${s.couleur || 'var(--ink)'}">${esc(s.nom)}</div>`;

    const liens = s.elements.map(l => {
      const poignee = `<span class="rch-poignee" title="Maintenir pour déplacer">⠿</span>`;

      if (l.type === 'titre') {
        return _modeEdition
          ? `<div class="rch-ligne-edit" data-id="${esc(l.id)}" data-type="titre">${poignee}
              <input class="inp rch-champ-titre" value="${esc(l.nom)}" placeholder="Nom de la catégorie"
                onblur="majRecherche('${s.id}', '${l.id}', 'nom', this.value)">
              <button class="rch-suppr" title="Supprimer" onclick="supprimeLienRecherche('${s.id}', '${l.id}')">×</button>
            </div>`
          : `<div class="rch-categorie">${esc(l.nom)}</div>`;
      }

      if (_modeEdition) {
        return `<div class="rch-ligne-edit" data-id="${esc(l.id)}" data-type="lien">${poignee}
          <input class="inp" value="${esc(l.nom)}" placeholder="Nom affiché"
            onblur="majRecherche('${s.id}', '${l.id}', 'nom', this.value)">
          <input class="inp rch-url" value="${esc(l.url)}" placeholder="https://…"
            onblur="majRecherche('${s.id}', '${l.id}', 'url', this.value)">
          <button class="rch-suppr" title="Supprimer" onclick="supprimeLienRecherche('${s.id}', '${l.id}')">×</button>
        </div>`;
      }
      const e = _etatClic(l.id);
      return `<a class="ri-lien" href="${esc(l.url)}" target="_blank" rel="noopener" data-lien="${esc(l.id)}" data-id="${esc(l.id)}">
        <span>${esc(l.nom)}</span><span class="ri-etat ${e.classe}">${esc(e.texte)}</span></a>`;
    }).join('') || (_modeEdition ? '' : '<div class="rch-vide">Aucune recherche</div>');

    const pied = _modeEdition
      ? `<button class="rch-ajout" onclick="ajouteLienRecherche('${s.id}')">＋ Recherche</button>
         <button class="rch-ajout" onclick="ajouteCategorieRecherche('${s.id}')">＋ Catégorie</button>
         <button class="rch-ajout" onclick="classeParFamilles('${s.id}')" title="Range cette colonne dans les 5 familles supply chain">⟲ Classer par familles</button>`
      : '';

    return `<div class="rch-colonne">${tete}
      <div class="rch-liste" data-site="${esc(s.id)}">${liens}</div>${pied}</div>`;
  }).join('');

  panneau.innerHTML = `
    <div class="rch-entete">
      <span class="rch-titre">Mes recherches</span>
      <span class="rch-aide">${_modeEdition
        ? 'Modifie les noms et les adresses, puis clique sur Terminer.'
        : 'Vert : lancée aujourd\'hui. Rouge : à faire.'}</span>
      <button class="btn btn-g rch-mini" onclick="basculeEditionRecherches()">${_modeEdition ? '✓ Terminer' : '✏️ Modifier'}</button>
    </div>
    <div class="rch-colonnes">${colonnes}
      ${_modeEdition ? `<button class="rch-ajout-site" onclick="ajouteSiteRecherche()">＋<br>Ajouter un site</button>` : ''}
    </div>`;

  if (_modeEdition) panneau.querySelectorAll('.rch-liste').forEach(_initGlisser);

  if (panneau.dataset.pret) return;
  panneau.dataset.pret = '1';
  panneau.addEventListener('click', e => {
    const lien = e.target.closest('a[data-lien]');
    if (!lien) return;
    _noteClic(lien.dataset.lien);
    fermeMenuRecherches();
  });
}

function basculeMenuRecherches(e) {
  if (e) e.stopPropagation();
  const panneau = document.getElementById('rch-panneau');
  if (!panneau) return;
  const ouvrir = panneau.hidden;
  if (ouvrir) renderPanneauRecherches();
  panneau.hidden = !ouvrir;
  // L'état est retenu : le panneau se rouvre tout seul au prochain passage
  localStorage.setItem(CLE_PANNEAU_OUVERT, ouvrir ? '1' : '0');
  document.querySelector('#rch-menu .rch-bouton')?.setAttribute('aria-expanded', String(ouvrir));
}

function fermeMenuRecherches() {
  const panneau = document.getElementById('rch-panneau');
  if (panneau && !panneau.hidden) {
    panneau.hidden = true;
    _modeEdition = false;
    localStorage.setItem(CLE_PANNEAU_OUVERT, '0');
    document.querySelector('#rch-menu .rch-bouton')?.setAttribute('aria-expanded', 'false');
  }
}

// Au chargement : on retrouve le panneau tel qu'on l'a laissé
function restaurePanneauRecherches() {
  if (localStorage.getItem(CLE_PANNEAU_OUVERT) !== '1') return;
  const panneau = document.getElementById('rch-panneau');
  if (!panneau || !panneau.hidden) return;
  renderPanneauRecherches();
  panneau.hidden = false;
  document.querySelector('#rch-menu .rch-bouton')?.setAttribute('aria-expanded', 'true');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(restaurePanneauRecherches, 300));
} else {
  setTimeout(restaurePanneauRecherches, 300);
}

// Le panneau fait partie de la page : il ne se ferme qu'avec le bouton
// (ou avec Échap), pas au premier clic ailleurs.
document.addEventListener('keydown', e => { if (e.key === 'Escape') fermeMenuRecherches(); });
