// ── VERSIONS DU CV ─────────────────────────────────────────
// Plusieurs CV à partir d'UN SEUL profil : une version par domaine
// (approvisionnement, entreposage, pilotage…). On bascule d'un clic.
//
// Ce qui est PROPRE à chaque version :
//   • le poste ciblé            (version.poste)
//   • la phrase d'accroche      (version.accrocheIntro)
//   • des compétences en plus   (version.competences)
//
// Tout le reste est COMMUN, dans le profil : identité, coordonnées,
// expériences, formation, langues, compétences communes, photo, lettre.
// Corriger une expérience la corrige donc sur tous les CV.
//
// Stockage : sc_cv_versions (liste) + sc_cv_version_active (id).

const CLE_VERSIONS = 'sc_cv_versions';
const CLE_VERSION_ACTIVE = 'sc_cv_version_active';

// Les trois domaines de départ (le bouton ＋ permet d'en ajouter)
const VERSIONS_PAR_DEFAUT = [
  'Approvisionnement',
  'Entreposage',
  'Pilotage et amélioration'
];

// Catégories de compétences, mêmes clés que le profil
const CATEGORIES_COMPETENCES = [
  ['subdomains',   'Domaines'],
  ['tools',        'Outils'],
  ['certifs',      'Certifications'],
  ['customSkills', 'Compétences techniques'],
  ['savoirEtre',   'Savoir-être']
];

function versionsCV()      { return ls(CLE_VERSIONS, []) || []; }
function idVersionActive() { return localStorage.getItem(CLE_VERSION_ACTIVE) || ''; }
function versionActive()   { return versionsCV().find(v => v.id === idVersionActive()) || null; }

// Compétences affichées sur le CV : communes (profil) + propres à la version
function competencesCV(cle) {
  const communes = P[cle] || [];
  const v = versionActive();
  const propres = (v && v.competences && v.competences[cle]) || [];
  return [...communes, ...propres.filter(s => !communes.includes(s))];
}

// Vrai si cette compétence vient de la version active (et non du profil)
function estCompetenceDeVersion(cle, valeur) {
  const v = versionActive();
  return !!(v && v.competences && (v.competences[cle] || []).includes(valeur));
}

function _versionVide(nom) {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    nom,
    poste: localStorage.getItem('sc_cv_target') || '',
    accrocheIntro: P.accrocheIntro || '',
    competences: { subdomains: [], tools: [], certifs: [], customSkills: [], savoirEtre: [] },
    creee: new Date().toISOString()
  };
}

// Enregistre le poste et l'accroche affichés dans la version active
function sauveVersionCourante() {
  const liste = versionsCV();
  const v = liste.find(x => x.id === idVersionActive());
  if (!v) return;
  v.poste = localStorage.getItem('sc_cv_target') || '';
  v.accrocheIntro = P.accrocheIntro || '';
  ss(CLE_VERSIONS, liste);
}

function _appliqueVersion(v) {
  P.accrocheIntro = v.accrocheIntro || '';
  ss('sc_profile', P);
  localStorage.setItem('sc_cv_target', v.poste || '');
  if (typeof _cvTarget !== 'undefined') _cvTarget = v.poste || '';
  const champ = document.getElementById('cv-target-input');
  if (champ) champ.value = v.poste || '';
}

function basculeVersionCV(id) {
  if (id === idVersionActive()) return;
  sauveVersionCourante();
  const v = versionsCV().find(x => x.id === id);
  if (!v) return;
  localStorage.setItem(CLE_VERSION_ACTIVE, id);
  _appliqueVersion(v);
  if (typeof renderCV === 'function') renderCV();
  if (typeof loadProfileToForm === 'function') loadProfileToForm();
  if (typeof _syncSplitCV === 'function') _syncSplitCV();
  renderVersionsCV();
  toast(`Version « ${v.nom} »`);
}

function nouvelleVersionCV() {
  const nom = (prompt('Nom de la nouvelle version (ex. : Transport et flux) :') || '').trim();
  if (!nom) return;
  sauveVersionCourante();
  const liste = versionsCV();
  const v = _versionVide(nom);
  liste.push(v);
  ss(CLE_VERSIONS, liste);
  localStorage.setItem(CLE_VERSION_ACTIVE, v.id);
  _appliqueVersion(v);
  if (typeof renderCV === 'function') renderCV();
  renderVersionsCV();
  toast(`✓ Version « ${nom} » créée`);
}

function renommeVersionCV() {
  const liste = versionsCV();
  const v = liste.find(x => x.id === idVersionActive());
  if (!v) return;
  const nom = (prompt('Nouveau nom :', v.nom) || '').trim();
  if (!nom) return;
  v.nom = nom;
  ss(CLE_VERSIONS, liste);
  renderVersionsCV();
}

function supprimeVersionCV() {
  const liste = versionsCV();
  const v = liste.find(x => x.id === idVersionActive());
  if (!v) return;
  if (liste.length < 2) { toast('Il faut garder au moins une version'); return; }
  if (!confirm(`Supprimer la version « ${v.nom} » ? Ses compétences propres et son accroche seront perdues. Le profil commun n'est pas touché.`)) return;
  const reste = liste.filter(x => x.id !== v.id);
  ss(CLE_VERSIONS, reste);
  localStorage.setItem(CLE_VERSION_ACTIVE, reste[0].id);
  _appliqueVersion(reste[0]);
  if (typeof renderCV === 'function') renderCV();
  renderVersionsCV();
  toast('Version supprimée');
}

// ── COMPÉTENCES PROPRES À LA VERSION ───────────────────────
function ajouteCompetenceVersion(cle) {
  const liste = versionsCV();
  const v = liste.find(x => x.id === idVersionActive());
  if (!v) return;
  const val = (prompt('Compétence à ajouter à cette version seulement :') || '').trim();
  if (!val) return;
  v.competences = v.competences || {};
  v.competences[cle] = v.competences[cle] || [];
  if (!v.competences[cle].includes(val)) v.competences[cle].push(val);
  ss(CLE_VERSIONS, liste);
  if (typeof renderCV === 'function') renderCV();
  if (typeof _syncSplitCV === 'function') _syncSplitCV();
  renderVersionsCV();
}

function retireCompetenceVersion(cle, val) {
  const liste = versionsCV();
  const v = liste.find(x => x.id === idVersionActive());
  if (!v || !v.competences || !v.competences[cle]) return;
  v.competences[cle] = v.competences[cle].filter(s => s !== val);
  ss(CLE_VERSIONS, liste);
  if (typeof renderCV === 'function') renderCV();
  if (typeof _syncSplitCV === 'function') _syncSplitCV();
  renderVersionsCV();
}

// Phrase d'accroche : propre au CV affiché, modifiable ici comme dans Mon Profil
function majAccrocheVersion(val) {
  P.accrocheIntro = (val || '').trim();
  ss('sc_profile', P);
  sauveVersionCourante();
  if (typeof renderCV === 'function') renderCV();
  if (typeof _updateAccrochePreview === 'function') _updateAccrochePreview();
  const champProfil = document.getElementById('p-accrocheIntro');
  if (champProfil) champProfil.value = P.accrocheIntro;
}

function basculePanneauCompetences() {
  const p = document.getElementById('cvv-competences');
  if (p) p.hidden = !p.hidden;
}

function _panneauCompetencesHtml(v) {
  return `<div id="cvv-competences" class="cvv-competences" hidden>
    <div class="cvv-aide">Ces compétences n'apparaissent que sur « ${esc(v.nom)} ». Celles de Mon Profil → Compétences restent sur tous les CV.</div>
    ${CATEGORIES_COMPETENCES.map(([cle, label]) => {
      const items = (v.competences && v.competences[cle]) || [];
      return `<div class="cvv-cat">
        <span class="cvv-cat-nom">${label}</span>
        ${items.map(s => `<span class="cvv-tag">${esc(s)}<button onclick="retireCompetenceVersion('${cle}', ${JSON.stringify(s).replace(/"/g, '&quot;')})" title="Retirer">×</button></span>`).join('')}
        <button class="cvv-ajout" onclick="ajouteCompetenceVersion('${cle}')">＋</button>
      </div>`;
    }).join('')}
  </div>`;
}

// ── MINIATURES : le vrai CV de chaque version ──────────────
// On applique la version le temps d'un rendu, on récupère le HTML, puis on
// remet l'état d'avant. Un seul moteur de CV (renderCV) pour tout le site.
function _cvHtmlDeVersion(v) {
  const doc = document.getElementById('cv-doc');
  if (!doc || typeof renderCV !== 'function') return '';
  const avant = { accroche: P.accrocheIntro || '', poste: localStorage.getItem('sc_cv_target') || '', actif: idVersionActive() };
  try {
    localStorage.setItem(CLE_VERSION_ACTIVE, v.id);
    P.accrocheIntro = v.accrocheIntro || '';
    localStorage.setItem('sc_cv_target', v.poste || '');
    if (typeof _cvTarget !== 'undefined') _cvTarget = v.poste || '';
    renderCV();
    return doc.innerHTML;
  } finally {
    localStorage.setItem(CLE_VERSION_ACTIVE, avant.actif);
    P.accrocheIntro = avant.accroche;
    localStorage.setItem('sc_cv_target', avant.poste);
    if (typeof _cvTarget !== 'undefined') _cvTarget = avant.poste;
    renderCV();
  }
}

// Ouvre la version puis lance le téléchargement du PDF
function pdfVersionCV(id) {
  basculeVersionCV(id);
  setTimeout(() => { if (typeof printCV === 'function') printCV(); }, 120);
}

// ── AFFICHAGE ──────────────────────────────────────────────
function renderVersionsCV() {
  const el = document.getElementById('cv-versions-bar');
  if (!el) return;

  let liste = versionsCV();
  // Première ouverture : les trois versions de départ, copiées du CV actuel
  if (!liste.length) {
    liste = VERSIONS_PAR_DEFAUT.map(nom => _versionVide(nom));
    ss(CLE_VERSIONS, liste);
    localStorage.setItem(CLE_VERSION_ACTIVE, liste[0].id);
  }
  if (!liste.find(v => v.id === idVersionActive())) {
    localStorage.setItem(CLE_VERSION_ACTIVE, liste[0].id);
  }
  const actif = idVersionActive();
  const v = liste.find(x => x.id === actif);
  const nbPropres = CATEGORIES_COMPETENCES.reduce((n, [cle]) => n + (((v.competences || {})[cle] || []).length), 0);

  el.innerHTML = `
    <div class="cvv-entete">
      <span class="cvv-titre">Mes CV</span>
      <span class="cvv-aide">Le poste ciblé, la phrase d'accroche et les compétences ajoutées ici sont propres à chaque CV. Expériences, formation et coordonnées sont communes.</span>
      <button class="btn btn-g cvv-mini" onclick="nouvelleVersionCV()">＋ Nouveau CV</button>
    </div>
    <div class="cvv-grille">
      ${liste.map(x => `
        <div class="cvv-carte${x.id === actif ? ' cvv-carte--on' : ''}">
          <div class="cvv-apercu" onclick="basculeVersionCV('${x.id}')" title="Afficher ce CV en grand">
            <div class="cvv-page cv-doc cv-doc--ats">${_cvHtmlDeVersion(x)}</div>
          </div>
          <div class="cvv-pied">
            <span class="cvv-nom">${esc(x.nom)}</span>
            <span class="cvv-poste">${esc(x.poste || 'Poste ciblé non défini')}</span>
          </div>
          <div class="cvv-boutons">
            <button class="btn btn-g cvv-mini" onclick="basculeVersionCV('${x.id}')">${x.id === actif ? 'Affiché' : 'Afficher'}</button>
            <button class="btn btn-p cvv-mini" onclick="pdfVersionCV('${x.id}')">PDF</button>
          </div>
        </div>`).join('')}
    </div>
    <div class="cvv-accroche-ligne">
      <label class="cvv-label" for="cvv-accroche">Phrase d'accroche de « ${esc(v.nom)} »</label>
      <textarea class="inp cvv-accroche-champ" id="cvv-accroche" rows="2"
        placeholder="Fort de 7 ans en logistique e-commerce et entrepôt, coordination des approvisionnements et suivi de performance"
        oninput="majAccrocheVersion(this.value)" onblur="renderVersionsCV()">${esc(P.accrocheIntro || '')}</textarea>
    </div>
    <div class="cvv-barre-active">
      <span class="cvv-actif">CV affiché : <strong>${esc(v.nom)}</strong></span>
      <button class="btn btn-g cvv-mini" onclick="basculePanneauCompetences()">Compétences propres à ce CV${nbPropres ? ` (${nbPropres})` : ''}</button>
      <button class="btn btn-g cvv-mini" onclick="renommeVersionCV()">Renommer</button>
      <button class="btn btn-g cvv-mini" onclick="supprimeVersionCV()" title="Supprimer ce CV">Supprimer</button>
    </div>
    ${_panneauCompetencesHtml(v)}`;
}

// Le poste et l'accroche affichés appartiennent à la version active :
// on les enregistre avant de quitter la page.
window.addEventListener('beforeunload', () => { try { sauveVersionCourante(); } catch {} });
