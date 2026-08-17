// ── FEED — offres récupérées automatiquement ───────────────
// Les offres sont collectées 2×/jour par le worker Cloudflare.
// Ici on les affiche en cartes groupées par entreprise, on filtre,
// on masque celles qui n'intéressent pas, et on bascule dans le suivi.

const FEED_URL_DEFAUT   = 'https://job-feed.djoudi-feed.workers.dev';
const FEED_TOKEN_DEFAUT = '96c23cd3bb4ba6c654d8074e2fd13f74';

const feedUrl   = () => localStorage.getItem('sc_feed_url')   || FEED_URL_DEFAUT;
const feedToken = () => localStorage.getItem('sc_feed_token') || FEED_TOKEN_DEFAUT;

// Départements d'Île-de-France
const DEPTS_IDF = ['75', '77', '78', '91', '92', '93', '94', '95'];

let _feedData    = { offres: [], sources: [], total: 0 };
// Filtres par défaut à l'ouverture : Val-de-Marne + CDI
let _feedFiltres = { societe: 'Tous', secteur: 'Tous', contrat: 'CDI', depts: ['94'], preset: '94', recherche: '', nouvellesSeules: false };
let _feedCharge  = false;
let _feedVisiteRef = '';          // figée à l'ouverture, sinon les ⭐ disparaissent en cours de route
let _feedVue = 'aconsulter';      // 'aconsulter' | 'masquees' | 'suivies'
let _feedVoirJournal = false;     // panneau "historique des collectes"

// ── OFFRES MASQUÉES ("pas intéressant") ────────────────────
function _feedMasquees()      { return new Set(ls('sc_feed_hidden', [])); }
function _feedSauveMasquees(s){ ss('sc_feed_hidden', [...s]); }

function _feedMasque(id) {
  const s = _feedMasquees();
  s.add(id);
  _feedSauveMasquees(s);
  _feedRenderListe();
  _feedMajCompteurs();
}

function _feedRestaure(id) {
  const s = _feedMasquees();
  s.delete(id);
  _feedSauveMasquees(s);
  _feedRenderListe();
  _feedMajCompteurs();
}

// Bascule entre les 3 vues (recliquer revient à "à consulter")
function _feedSetVue(vue) {
  _feedVue = (_feedVue === vue) ? 'aconsulter' : vue;
  _feedMajCompteurs();
  _feedRenderListe();
}

// Date de la dernière consultation → sert à marquer les ⭐
function _feedDerniereVisite() { return localStorage.getItem('sc_feed_lastvisit') || ''; }
function _feedMarqueVisite()   { localStorage.setItem('sc_feed_lastvisit', new Date().toISOString()); }

// Département — les sources ne l'écrivent pas pareil :
//   STEF     "FRANCE, RUNGIS, 94150"            → code postal
//   Staff'U  "Centre-Val de Loire · 77 - Seine…" → numéro suivi d'un tiret
function _feedDept(lieu) {
  const s = lieu || '';
  const cp = s.match(/\b(\d{2})\d{3}\b/);
  if (cp) return cp[1];
  const num = s.match(/\b(\d{2})\s*-\s*[A-Za-zÀ-ÿ]/);
  return num ? num[1] : '';
}

// Échappe pour une chaîne JS entre apostrophes dans un attribut HTML
// (certains identifiants de repli contiennent le titre → apostrophes possibles)
function _feedJs(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function _feedDateCourte(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// Clés des offres déjà présentes dans mes candidatures (calculé une fois par rendu)
function _feedClesSuivies() {
  const urls = new Set(), paires = new Set();
  for (const c of ls('sc_cands', [])) {
    if (c.jobUrl) urls.add(c.jobUrl);
    paires.add(`${(c.poste || '').toLowerCase()}|${(c.company || '').toLowerCase()}`);
  }
  return { urls, paires };
}

// L'offre est-elle déjà dans mes candidatures ?
function _feedEstSuivie(o, cles) {
  return (o.url && cles.urls.has(o.url)) ||
         cles.paires.has(`${(o.titre || '').toLowerCase()}|${(o.société || '').toLowerCase()}`);
}

// ── RÉCUPÉRATION ───────────────────────────────────────────
async function chargeFeed(forcerCollecte = false) {
  const statutEl = document.getElementById('feed-statut');
  if (statutEl) {
    statutEl.innerHTML = `<span class="sp" style="width:12px;height:12px;display:inline-block;margin-right:6px;vertical-align:-2px"></span>${forcerCollecte ? 'Collecte en cours sur les sites…' : 'Chargement…'}`;
    statutEl.style.color = 'var(--ink3)';
  }
  try {
    if (forcerCollecte) {
      await fetch(`${feedUrl()}/collecte?token=${feedToken()}`, { cache: 'no-store' });
    }
    const r = await fetch(`${feedUrl()}/?token=${feedToken()}`, { cache: 'no-store' });
    if (r.status === 401) throw new Error('Jeton refusé — vérifie la configuration');
    if (!r.ok) throw new Error(`Le serveur a répondu ${r.status}`);
    _feedData   = await r.json();
    _feedCharge = true;
    renderFeed();
    if (statutEl) statutEl.textContent = '';
  } catch (e) {
    if (statutEl) {
      statutEl.style.color = 'var(--red)';
      statutEl.textContent = '⚠ ' + e.message;
    }
  }
}

// ── RENDU COMPLET (structure figée : ne touche plus aux champs) ──
function renderFeed() {
  const wrap = document.getElementById('feed-content');
  if (!wrap) return;

  if (!_feedCharge) {
    wrap.innerHTML = `<div class="empty" style="padding:38px">
      <div class="empty-ic">📡</div>
      <div class="empty-t">Chargement du feed…</div>
    </div>`;
    chargeFeed();
    return;
  }

  const toutes = _feedData.offres || [];

  const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort();
  const societes = uniq(toutes.map(o => o.société));
  const secteurs = uniq(toutes.map(o => o.secteur));
  const contrats = uniq(toutes.map(o => o.contrat));

  const f = _feedFiltres;

  // Si une valeur par défaut n'existe pas dans les données, on la relâche
  // (sinon le menu afficherait "Tous" alors que le filtre bloque tout)
  if (f.contrat !== 'Tous' && !contrats.includes(f.contrat)) f.contrat = 'Tous';
  if (f.secteur !== 'Tous' && !secteurs.includes(f.secteur)) f.secteur = 'Tous';
  if (f.societe !== 'Tous' && !societes.includes(f.societe)) f.societe = 'Tous';

  const opt = (liste, actif) =>
    ['Tous', ...liste].map(v => `<option${v === actif ? ' selected' : ''}>${esc(v)}</option>`).join('');

  wrap.innerHTML = `
    <div style="display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
      <select class="inp" onchange="_feedSetFiltre('societe',this.value)"
        style="width:auto;padding:5px 9px;font-size:12px">${opt(societes, f.societe)}</select>
      <select class="inp" onchange="_feedSetFiltre('secteur',this.value)"
        style="width:auto;padding:5px 9px;font-size:12px;max-width:210px">${opt(secteurs, f.secteur)}</select>
      <select class="inp" onchange="_feedSetFiltre('contrat',this.value)"
        style="width:auto;padding:5px 9px;font-size:12px">${opt(contrats, f.contrat)}</select>
      <input class="inp" id="feed-f-dept" placeholder="Dépt (ex: 94)" value="${esc(f.preset ? '' : (f.depts[0] || ''))}" maxlength="2"
        oninput="_feedSetDeptTexte(this.value)"
        style="width:105px;padding:5px 9px;font-size:12px"/>
      <span id="feed-dept-94" onclick="_feedSetPreset('94')"
        style="cursor:pointer;user-select:none;border-radius:100px;padding:4px 12px;font-size:11.5px;font-weight:700;white-space:nowrap">94</span>
      <span id="feed-dept-idf" onclick="_feedSetPreset('idf')"
        style="cursor:pointer;user-select:none;border-radius:100px;padding:4px 12px;font-size:11.5px;font-weight:700;white-space:nowrap">Île-de-France</span>
      <input class="inp" id="feed-f-rech" placeholder="Rechercher…" value="${esc(f.recherche)}"
        oninput="_feedSetFiltre('recherche',this.value)"
        style="flex:1;min-width:140px;padding:5px 9px;font-size:12px"/>
      <span id="feed-toggle-new" onclick="_feedSetFiltre('nouvellesSeules',!_feedFiltres.nouvellesSeules)"
        style="cursor:pointer;user-select:none;border-radius:100px;padding:4px 12px;font-size:11.5px;font-weight:700;white-space:nowrap"></span>
      <span id="feed-toggle-suivies" onclick="_feedSetVue('suivies')"
        style="cursor:pointer;user-select:none;border-radius:100px;padding:4px 12px;font-size:11.5px;font-weight:700;white-space:nowrap"></span>
      <span id="feed-toggle-masq" onclick="_feedSetVue('masquees')"
        style="cursor:pointer;user-select:none;border-radius:100px;padding:4px 12px;font-size:11.5px;font-weight:700;white-space:nowrap"></span>
    </div>

    <div id="feed-journal"></div>
    <div id="feed-compteur" style="font-size:12px;color:var(--ink3);margin-bottom:14px"></div>
    <div id="feed-liste"></div>`;

  _feedRenderJournal();

  _feedMajCompteurs();
  _feedRenderListe();
}

// ── JOURNAL DES COLLECTES ──────────────────────────────────
function _feedToggleJournal() {
  _feedVoirJournal = !_feedVoirJournal;
  _feedRenderJournal();
}

function _feedRenderJournal() {
  const el = document.getElementById('feed-journal');
  if (!el) return;
  if (!_feedVoirJournal) { el.innerHTML = ''; return; }

  const journal = _feedData.journal || [];
  if (!journal.length) {
    el.innerHTML = `<div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;
      padding:14px;margin-bottom:14px;font-size:12px;color:var(--ink3)">
      Aucune collecte enregistrée pour l'instant. Le journal se remplira à la prochaine mise à jour
      (7h et 13h UTC) ou si tu cliques sur « Actualiser ».</div>`;
    return;
  }

  const lignes = journal.map(e => {
    const d = new Date(e.quand);
    const quand = isNaN(d) ? e.quand
      : d.toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    const auto = e.origine === 'auto';
    const enPanne = (e.sources || []).some(s => !s.ok) || (e.alertes || []).length;

    const detail = (e.sources || []).map(s => {
      const nom = s.source === 'stef' ? 'STEF' : s.source === 'staffu' ? 'Staff’U' : s.source;
      if (!s.ok) return `<span style="color:var(--red);font-weight:700">⚠ ${esc(nom)} : ${esc(s.erreur || 'échec')}</span>`;
      const nv = s.nouvelles ? ` <b style="color:var(--teal-d)">+${s.nouvelles}</b>` : '';
      return `<span style="color:var(--ink2)">${esc(nom)} ${s.count}${nv}</span>`;
    }).join('<span style="color:var(--border)"> · </span>');

    const titres = (e.titres || []).length
      ? `<div style="margin-top:5px;padding-left:10px;border-left:2px solid var(--teal-border);
           font-size:11px;color:var(--ink3);line-height:1.6">
           ${e.titres.map(t => esc(t)).join('<br>')}
           ${e.nouvelles > e.titres.length ? `<br><i>…et ${e.nouvelles - e.titres.length} autre(s)</i>` : ''}
         </div>`
      : '';

    return `<div style="padding:9px 0;border-bottom:1px solid var(--border2)">
      <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap;font-size:12px">
        <span style="font-weight:700;color:var(--ink);min-width:96px">${quand}</span>
        <span style="background:${auto ? 'var(--bg)' : '#eef2ff'};border:1px solid ${auto ? 'var(--border)' : '#c7d2fe'};
          color:${auto ? 'var(--ink3)' : '#4f46e5'};border-radius:100px;padding:1px 8px;font-size:10px;font-weight:700">
          ${auto ? 'automatique' : 'manuel'}</span>
        ${detail}
        <span style="color:var(--ink3);font-size:11px;margin-left:auto">${(e.duree/1000).toFixed(1)} s</span>
        ${enPanne ? '<span style="color:var(--red);font-weight:700;font-size:11px">⚠</span>' : ''}
      </div>
      ${titres}
    </div>`;
  }).join('');

  el.innerHTML = `<div style="background:var(--card);border:1.5px solid var(--border);border-radius:12px;
    padding:6px 16px 10px;margin-bottom:16px">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0 4px">
      <div style="font-size:12.5px;font-weight:800;color:var(--ink)">Historique des collectes</div>
      <span onclick="_feedToggleJournal()" style="cursor:pointer;color:var(--ink3);font-size:15px;line-height:1">✕</span>
    </div>
    <div style="font-size:11px;color:var(--ink3);margin-bottom:4px">
      ${journal.length} dernière${journal.length > 1 ? 's' : ''} · les nouveautés détectées sont listées sous chaque ligne
    </div>
    ${lignes}
  </div>`;
}

// ── PASTILLES (mises à jour sur place, sans re-render) ─────
function _feedStylePastille(el, actif, couleur) {
  if (!el) return;
  el.style.background = actif ? couleur : 'transparent';
  el.style.color      = actif ? '#fff'  : 'var(--ink3)';
  el.style.border     = `1.5px solid ${actif ? couleur : 'var(--border)'}`;
}

function _feedMajDeptBoutons() {
  const p = _feedFiltres.preset;
  _feedStylePastille(document.getElementById('feed-dept-94'),  p === '94',  '#2164f3');
  _feedStylePastille(document.getElementById('feed-dept-idf'), p === 'idf', '#2164f3');
}

function _feedMajCompteurs() {
  const toutes = _feedData.offres || [];
  const masq   = _feedMasquees();
  const cles   = _feedClesSuivies();

  const nbSuivies = toutes.filter(o => _feedEstSuivie(o, cles)).length;
  const nbMasq    = toutes.filter(o => masq.has(o.id)).length;
  // Les ⭐ ne comptent que ce qu'il reste réellement à consulter
  const nbNouv = _feedVisiteRef
    ? toutes.filter(o => o.vueLe > _feedVisiteRef && !masq.has(o.id) && !_feedEstSuivie(o, cles)).length
    : 0;

  const elNew = document.getElementById('feed-toggle-new');
  if (elNew) {
    elNew.textContent   = `⭐ Nouvelles ${nbNouv}`;
    elNew.style.display = nbNouv ? '' : 'none';
    _feedStylePastille(elNew, _feedFiltres.nouvellesSeules, '#111');
  }

  const elSuiv = document.getElementById('feed-toggle-suivies');
  if (elSuiv) {
    elSuiv.textContent   = `✓ Suivies ${nbSuivies}`;
    elSuiv.style.display = nbSuivies ? '' : 'none';
    _feedStylePastille(elSuiv, _feedVue === 'suivies', 'var(--teal-d)');
  }

  const elMasq = document.getElementById('feed-toggle-masq');
  if (elMasq) {
    elMasq.textContent   = `🗑 Pas intéressant ${nbMasq}`;
    elMasq.style.display = nbMasq ? '' : 'none';
    _feedStylePastille(elMasq, _feedVue === 'masquees', '#dc2626');
  }

  _feedMajDeptBoutons();
}

// ── FILTRAGE ───────────────────────────────────────────────
function _feedOffresVisibles() {
  const toutes = _feedData.offres || [];
  const f      = _feedFiltres;
  const rech   = f.recherche.toLowerCase().trim();
  const masq   = _feedMasquees();

  const cles = _feedClesSuivies();

  return toutes.filter(o => {
    // Vue active : à consulter (ni masquée ni suivie) / masquées / suivies
    const estMasquee = masq.has(o.id);
    const estSuivie  = _feedEstSuivie(o, cles);
    if (_feedVue === 'masquees')      { if (!estMasquee) return false; }
    else if (_feedVue === 'suivies')  { if (!estSuivie)  return false; }
    else if (estMasquee || estSuivie) return false;   // vue "à consulter"

    if (f.societe !== 'Tous' && o.société !== f.societe) return false;
    if (f.secteur !== 'Tous' && o.secteur !== f.secteur) return false;
    if (f.contrat !== 'Tous' && o.contrat !== f.contrat) return false;
    if (f.depts.length && !f.depts.includes(_feedDept(o.lieu))) return false;
    if (f.nouvellesSeules && !(_feedVisiteRef && o.vueLe > _feedVisiteRef)) return false;
    if (rech && !(`${o.titre} ${o.lieu} ${o.secteur}`.toLowerCase().includes(rech))) return false;
    return true;
  });
}

// ── RENDU DE LA LISTE (appelé à chaque frappe / action) ────
function _feedRenderListe() {
  const listeEl = document.getElementById('feed-liste');
  const cptEl   = document.getElementById('feed-compteur');
  if (!listeEl) return;

  const toutes   = _feedData.offres || [];
  const visibles = _feedOffresVisibles();

  if (cptEl) {
    const n = visibles.length, s = n > 1 ? 's' : '';
    cptEl.textContent =
      _feedVue === 'masquees' ? `${n} offre${s} écartée${s} — « Restaurer » pour la remettre dans la liste`
    : _feedVue === 'suivies'  ? `${n} offre${s} déjà dans tes candidatures`
    : `${n} offre${s} à consulter · sur ${toutes.length} collectées`;
  }

  if (!visibles.length) {
    const vide =
      _feedVue === 'masquees' ? { ic: '🗑', txt: 'Aucune offre écartée' }
    : _feedVue === 'suivies'  ? { ic: '✓',  txt: 'Aucune offre suivie pour ces filtres' }
    : toutes.length           ? { ic: '🎉', txt: 'Tout est traité pour ces filtres !' }
    :                           { ic: '◫',  txt: 'Aucune offre collectée' };
    listeEl.innerHTML = `<div class="empty" style="padding:34px">
      <div class="empty-ic">${vide.ic}</div>
      <div class="empty-t">${vide.txt}</div>
    </div>`;
    return;
  }

  const cles = _feedClesSuivies();

  // Regroupement par entreprise, dans l'ordre des sources
  const ordre   = (_feedData.sources || []).map(s => s.nom);
  const groupes = new Map();
  for (const o of visibles) {
    const cle = o.société || '—';
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(o);
  }
  const clesTriees = [...groupes.keys()].sort((a, b) => {
    const ia = ordre.indexOf(a), ib = ordre.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  listeEl.innerHTML = clesTriees.map((nomSociete, idx) => {
    const offres = groupes.get(nomSociete);
    const pisteId = `feed-piste-${idx}`;
    const meta   = (_feedData.sources || []).find(s => s.nom === nomSociete);
    const ok     = meta ? meta.ok === true : true;
    const quand  = meta?.derniereCollecte
      ? new Date(meta.derniereCollecte).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
      : '';
    const col = ok ? 'var(--teal-d)' : 'var(--red)';
    const bg  = ok ? 'var(--teal-bg)' : 'var(--red-bg)';
    const bd  = ok ? 'var(--teal-border)' : 'var(--red-border)';

    return `<div class="feed-groupe">
      <div class="feed-groupe-hdr">
        <span style="display:inline-flex;align-items:center;gap:6px;background:${bg};border:1px solid ${bd};
          border-radius:100px;padding:3px 12px;font-size:11.5px;font-weight:700;color:${col}">
          ${ok ? '●' : '⚠'} ${esc(nomSociete)}
          <span style="opacity:.75;font-weight:400">${offres.length} offre${offres.length > 1 ? 's' : ''}${quand ? ' · ' + quand : ''}</span>
        </span>
      </div>
      <div class="feed-piste">
        <button class="feed-fleche feed-fleche--g" onclick="_feedScroll('${pisteId}',-1)" aria-label="Précédent">‹</button>
        <div class="feed-grid" id="${pisteId}" onscroll="_feedMajFleches('${pisteId}')">
          ${offres.map(o => _feedCarte(o, cles)).join('')}
        </div>
        <button class="feed-fleche feed-fleche--d" onclick="_feedScroll('${pisteId}',1)" aria-label="Suivant">›</button>
      </div>
    </div>`;
  }).join('');

  // Les flèches n'apparaissent que si la bande dépasse l'écran
  clesTriees.forEach((_, idx) => _feedMajFleches(`feed-piste-${idx}`));
}

// ── DÉFILEMENT HORIZONTAL ──────────────────────────────────
function _feedScroll(pisteId, sens) {
  const el = document.getElementById(pisteId);
  if (!el) return;
  // Un « écran » = la largeur visible ; repli sur 3 colonnes si la mesure est nulle
  const carte = el.querySelector('.feed-card');
  const pas = el.clientWidth > 40
    ? el.clientWidth * 0.92
    : (carte ? (carte.offsetWidth + 13) * 3 : 900);
  el.scrollBy({ left: sens * pas, behavior: 'smooth' });
}

function _feedMajFleches(pisteId) {
  const el = document.getElementById(pisteId);
  if (!el) return;
  const piste = el.closest('.feed-piste');
  if (!piste) return;
  const g = piste.querySelector('.feed-fleche--g');
  const d = piste.querySelector('.feed-fleche--d');
  const reste = el.scrollWidth - el.clientWidth - el.scrollLeft;
  if (g) g.disabled = el.scrollLeft <= 4;
  if (d) d.disabled = reste <= 4;
}

// ── UNE CARTE ──────────────────────────────────────────────
function _feedCarte(o, cles) {
  const nouvelle = _feedVisiteRef && o.vueLe > _feedVisiteRef;
  const id  = _feedJs(o.id);
  const lien = `<a class="feed-btn feed-btn--voir" href="${esc(o.url)}" target="_blank" rel="noopener">Voir ↗</a>`;

  const btnCv = `<button class="feed-btn feed-btn--cv" onclick="_feedCvPdf('${id}', this)"
       title="CV au nom de ce poste, prêt à envoyer">⬇ CV</button>`;

  let actions;
  if (_feedVue === 'masquees') {
    actions = `<button class="feed-btn feed-btn--restore" onclick="_feedRestaure('${id}')">↺ Restaurer</button>${lien}`;
  } else if (_feedVue === 'suivies') {
    actions = `<span class="feed-suivie">✓ Suivie</span>${lien}${btnCv}`;
  } else {
    actions = `<button class="feed-btn feed-btn--non" onclick="_feedMasque('${id}')"
         title="Écarter — l'offre disparaît de la liste">Pas intéressant</button>
       ${lien}${btnCv}
       <button class="feed-btn feed-btn--suivre" onclick="_feedAjouteAuSuivi('${id}', this)">+ Suivre</button>`;
  }

  return `<div class="feed-card${nouvelle ? ' feed-card--new' : ''}${_feedVue === 'masquees' ? ' feed-card--masquee' : ''}">
    <div class="feed-card-titre">${esc(o.titre)}</div>
    <div class="feed-card-meta">${esc(o.société)} · ${esc(o.lieu)}</div>
    <div class="feed-card-sep"></div>
    <div class="feed-card-tags">
      <span class="feed-card-secteur" title="${esc(o.secteur)}">${esc(o.secteur)}</span>
      ${o.contrat ? `<span class="feed-card-contrat">${esc(o.contrat)}</span>` : ''}
    </div>
    <div class="feed-card-actions">${actions}</div>
    <div class="feed-card-date">
      ${nouvelle ? '<span style="font-size:13px">⭐</span>' : ''}
      Date d'ajout : ${_feedDateCourte(o.vueLe)}
    </div>
  </div>`;
}

// ── ACTIONS ────────────────────────────────────────────────
function _feedSetFiltre(cle, val) {
  _feedFiltres[cle] = val;
  if (cle === 'nouvellesSeules') _feedMajCompteurs();
  _feedRenderListe();   // ne redessine QUE la liste → le curseur reste dans le champ
}

// Saisie libre du département → désactive les raccourcis
function _feedSetDeptTexte(val) {
  const v = (val || '').trim();
  _feedFiltres.depts  = v ? [v] : [];
  _feedFiltres.preset = '';
  _feedMajDeptBoutons();
  _feedRenderListe();
}

// Raccourcis 94 / Île-de-France — recliquer désactive
function _feedSetPreset(nom) {
  const f = _feedFiltres;
  if (f.preset === nom) {
    f.preset = '';
    f.depts  = [];
  } else {
    f.preset = nom;
    f.depts  = nom === 'idf' ? [...DEPTS_IDF] : [nom];
  }
  const champ = document.getElementById('feed-f-dept');
  if (champ) champ.value = '';
  _feedMajDeptBoutons();
  _feedRenderListe();
}

// ── CV PDF DEPUIS UNE OFFRE ────────────────────────────────
// Réutilise loadCVForCand() — exactement le bouton "⬇ PDF" existant.
// L'offre doit donc être une candidature : on l'ajoute si besoin.
async function _feedCvPdf(offreId, btn) {
  const o = (_feedData.offres || []).find(x => x.id === offreId);
  if (!o) return;
  if (!P.firstName) { toast('Renseigne d\'abord ton profil'); return; }

  let cand = _feedCandPourOffre(o);
  if (!cand) {
    await _feedAjouteAuSuivi(offreId, btn);   // récupère aussi l'annonce complète
    cand = _feedCandPourOffre(o);
  }
  if (!cand) { toast('Impossible de préparer le CV'); return; }

  loadCVForCand(cand.id, true);               // ← la fonction existante
}

// Retrouve la candidature correspondant à une offre
function _feedCandPourOffre(o) {
  return ls('sc_cands', []).find(c =>
    (c.jobUrl && o.url && c.jobUrl === o.url) ||
    ((c.poste || '').toLowerCase() === (o.titre || '').toLowerCase() &&
     (c.company || '').toLowerCase() === (o.société || '').toLowerCase())
  );
}

// Récupère la description complète depuis la page de l'annonce
async function _feedDescription(url) {
  if (!url) return '';
  try {
    const r = await fetch(`${feedUrl()}/offre?token=${feedToken()}&url=${encodeURIComponent(url)}`);
    if (!r.ok) return '';
    const d = await r.json();
    return d.description || '';
  } catch { return ''; }
}

async function _feedAjouteAuSuivi(offreId, btn) {
  const o = (_feedData.offres || []).find(x => x.id === offreId);
  if (!o) return;

  // Récupération de l'annonce complète (nécessaire pour l'analyse et le CV adapté)
  let libelle = '';
  if (btn) { libelle = btn.textContent; btn.textContent = '…'; btn.disabled = true; }
  const description = await _feedDescription(o.url);
  if (btn) { btn.textContent = libelle; btn.disabled = false; }

  const cands = ls('sc_cands', []);
  cands.push({
    id: Date.now().toString(),
    company:        o.société || '',
    poste:          o.titre   || '',
    date:           new Date().toISOString().split('T')[0],
    status:         'À traiter',
    notes:          '',
    indeedUrl:      '',
    jobDescription: description,
    jobLocation:    o.lieu    || '',
    jobContract:    o.contrat || '',
    jobSalary:      '',
    jobUrl:         o.url     || '',
    jobSource:      o.source  || '',
    score:          null,
    analysis:       null
  });
  ss('sc_cands', cands);
  const nouvelId = cands[cands.length - 1].id;

  // Analyse IA lancée en arrière-plan (Gemini → Groq si quota atteint)
  if (description && typeof launchCareerOpsAnalysis === 'function') {
    toast('✓ Ajoutée — analyse IA en cours…');
    launchCareerOpsAnalysis(nouvelId, 'gemini', true);
  } else {
    toast(description
      ? '✓ Ajoutée avec l\'annonce complète'
      : '✓ Ajoutée — annonce non récupérée, colle-la manuellement');
  }
  _feedMajCompteurs();   // la pastille "Suivies" augmente
  _feedRenderListe();    // …et la carte quitte la vue "à consulter"
  if (typeof renderTracker === 'function') renderTracker();
  if (typeof refreshDash   === 'function') refreshDash();
}

function actualiseFeed() { chargeFeed(true); }

// Appelé à l'ouverture de l'onglet
function ouvreFeed() {
  // Fige la référence des ⭐ pour toute la session d'affichage
  _feedVisiteRef    = _feedDerniereVisite();
  _feedVue = 'aconsulter';
  renderFeed();
  setTimeout(_feedMarqueVisite, 1200);
}
