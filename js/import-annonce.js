// ── IMPORT D'UNE ANNONCE LUE DANS TON NAVIGATEUR ───────────
// Indeed et LinkedIn bloquent la lecture par un serveur (anti-robot,
// connexion obligatoire), et interdisent aussi à leurs pages d'envoyer
// des données en douce vers un autre site (règles CSP vérifiées).
// Le bouton favori ouvre donc une petite fenêtre de l'app :
//   …#import=<données>&auto=1  → enregistre, confirme, se referme
//   …#import=<données>         → remplit la fiche sans enregistrer
// En secours, l'annonce est copiée et se colle avec « Coller ».
// Les données passent par _runJobFetch() puis addCandFromDash() :
// exactement le même chemin qu'une saisie normale.

const IMPORT_MARQUEUR = '@@SUPPLY-COPILOT@@';

// UTF-8 ⇄ base64url (les accents doivent survivre au transport)
function _importDecode(b64) {
  const norm = b64.replace(/-/g, '+').replace(/_/g, '/');
  const bin  = atob(norm + '==='.slice((norm.length + 3) % 4));
  const oct  = Uint8Array.from(bin, c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(oct));
}

// Vérifie et normalise ce qu'envoie le bouton favori
function _importValide(d) {
  if (!d || typeof d !== 'object') return null;
  const s = v => (typeof v === 'string' ? v.trim() : '');
  const job = {
    source:   /linkedin/i.test(d.source) ? 'linkedin' : 'indeed',
    title:    s(d.title).slice(0, 200),
    company:  s(d.company).slice(0, 200),
    location: s(d.location).slice(0, 200),
    contract: s(d.contract).slice(0, 120),
    salary:   s(d.salary).slice(0, 120),
    url:      /^https:\/\/([a-z]+\.)?(indeed|linkedin)\.com\//i.test(s(d.url)) ? s(d.url) : '',
    descText: s(d.descText).slice(0, 20000)
  };
  return job.descText.length >= 50 ? job : null;
}

async function importeAnnonce(job, auto = false) {
  if (typeof goTo === 'function') goTo('dash');
  await new Promise(r => setTimeout(r, 150));

  // Déjà enregistrée ? (même lien d'offre) → on ne crée pas de doublon
  const existante = job.url && ls('sc_cands', []).find(c => c.jobUrl === job.url);
  if (auto && existante) {
    _importConfirme('Déjà dans tes candidatures', `${existante.poste} · ${existante.company}`);
    return;
  }

  const ta = document.getElementById('dash-paste-text');
  if (ta) ta.value = job.url || `${job.title} — ${job.company}`;
  if (typeof _showSourceBadge === 'function') _showSourceBadge(job.source);
  await _runJobFetch(job.url, job.source, job);

  if (!auto) return;
  const id = addCandFromDash({ sansAnalyse: true });
  if (id === null) {
    _importConfirme('⚠ Enregistrement impossible', 'Poste ou entreprise introuvable sur la page', true);
    return;
  }
  const c = ls('sc_cands', []).slice(-1)[0];
  _importConfirme('✓ Candidature enregistrée', `${c.poste} · ${c.company}`);
}

// Écran de confirmation de la petite fenêtre, puis fermeture automatique
function _importConfirme(titre, detail, erreur = false) {
  const voile = document.createElement('div');
  voile.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;' +
    'background:var(--bg,#f7f7f5);font-family:Inter,Arial,sans-serif;padding:20px;text-align:center';
  voile.innerHTML = `<div>
    <div style="font-size:17px;font-weight:800;color:${erreur ? '#dc2626' : '#111'};margin-bottom:6px">${esc(titre)}</div>
    <div style="font-size:13px;color:#555;line-height:1.5">${esc(detail)}</div>
    <div style="font-size:11px;color:#999;margin-top:14px">${erreur ? '' : 'Cette fenêtre se ferme toute seule…'}</div>
  </div>`;
  document.body.appendChild(voile);
  if (!erreur) setTimeout(() => window.close(), 1300);
}

// ── 1. Arrivée par l'adresse (#import=…[&auto=1]) ──────────
async function _importDepuisAdresse() {
  const m = location.hash.match(/^#import=([A-Za-z0-9_-]+)/);
  if (!m) return;
  const auto = /[#&]auto=1\b/.test(location.hash);
  // On retire tout de suite les données de l'adresse (historique, favoris)
  history.replaceState(history.state, '', location.pathname + location.search);

  let job = null;
  try { job = _importValide(_importDecode(m[1])); } catch {}
  if (!job) { if (typeof toast === 'function') toast('⚠ Annonce reçue illisible'); return; }

  // L'app doit être démarrée (profil chargé, écran affiché)
  for (let i = 0; i < 40 && document.getElementById('app')?.classList.contains('hidden'); i++) {
    await new Promise(r => setTimeout(r, 100));
  }
  importeAnnonce(job, auto);
}

// ── 2. Arrivée par le presse-papiers (bouton « Coller ») ───
(function installerImportCollage() {
  const _original = window.scheduleDashPasteAnalysis;
  if (typeof _original !== 'function') return;
  window.scheduleDashPasteAnalysis = function () {
    const ta  = document.getElementById('dash-paste-text');
    const val = (ta?.value || '').trim();
    const i   = val.indexOf(IMPORT_MARQUEUR);
    if (i !== -1) {
      let job = null;
      try { job = _importValide(_importDecode(val.slice(i + IMPORT_MARQUEUR.length).trim())); } catch {}
      if (job) { importeAnnonce(job); return; }
      if (typeof toast === 'function') toast('⚠ Annonce copiée illisible — relance le bouton favori');
      return;
    }
    return _original.apply(this, arguments);
  };
})();

// ── 3. Onglet principal : voir ce que la petite fenêtre a enregistré ──
// Les données sont partagées entre onglets, mais l'affichage ne se met pas
// à jour tout seul : on écoute le changement, on rafraîchit, et on lance
// ici l'analyse IA que la fenêtre (refermée) n'a pas pu faire.
window.addEventListener('storage', (e) => {
  if (e.key !== 'sc_cands') return;
  if (typeof refreshDash   === 'function') refreshDash();
  if (typeof renderTracker === 'function') renderTracker();

  const avant = new Set((JSON.parse(e.oldValue || '[]') || []).map(c => c.id));
  const nouvelles = ls('sc_cands', []).filter(c =>
    !avant.has(c.id) && c.jobDescription && !c.analysis?.career_ops && !c.analysis?.auto_tentee
  );
  nouvelles.forEach(c => {
    if (typeof toast === 'function') toast(`✓ Ajoutée : ${c.poste} — analyse IA en cours…`);
    if (typeof _marqueAnalyseTentee === 'function') _marqueAnalyseTentee(c.id);
    if (typeof launchCareerOpsAnalysis === 'function') launchCareerOpsAnalysis(c.id, 'gemini', true);
  });
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _importDepuisAdresse);
} else {
  _importDepuisAdresse();
}
// Si l'app est déjà ouverte dans cet onglet, seule la fin de l'adresse
// change (#import=…) : pas de rechargement, donc on écoute ce changement.
window.addEventListener('hashchange', _importDepuisAdresse);
