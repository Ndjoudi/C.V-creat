// ── IMPORT D'UNE ANNONCE LUE DANS TON NAVIGATEUR ───────────
// Indeed et LinkedIn bloquent la lecture par un serveur (anti-robot,
// connexion obligatoire). Le bouton favori lit donc l'annonce là où tu
// la consultes, puis la transmet ici de deux façons :
//   1. par l'adresse du site :  …#import=<données>   (ouverture directe)
//   2. par le presse-papiers :  tu cliques « Coller » dans le tableau de bord
// Les données reçues passent par _runJobFetch(), le même affichage que
// pour une récupération classique.

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

async function importeAnnonce(job) {
  if (typeof goTo === 'function') goTo('dash');
  await new Promise(r => setTimeout(r, 150));

  const ta = document.getElementById('dash-paste-text');
  if (ta) ta.value = job.url || `${job.title} — ${job.company}`;
  if (typeof _showSourceBadge === 'function') _showSourceBadge(job.source);
  await _runJobFetch(job.url, job.source, job);
}

// ── 1. Arrivée par l'adresse (#import=…) ───────────────────
async function _importDepuisAdresse() {
  const m = location.hash.match(/^#import=([A-Za-z0-9_-]+)/);
  if (!m) return;
  // On retire tout de suite les données de l'adresse (historique, favoris)
  history.replaceState(history.state, '', location.pathname + location.search);

  let job = null;
  try { job = _importValide(_importDecode(m[1])); } catch {}
  if (!job) { if (typeof toast === 'function') toast('⚠ Annonce reçue illisible'); return; }

  // L'app doit être démarrée (profil chargé, écran affiché)
  for (let i = 0; i < 40 && document.getElementById('app')?.classList.contains('hidden'); i++) {
    await new Promise(r => setTimeout(r, 100));
  }
  importeAnnonce(job);
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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _importDepuisAdresse);
} else {
  _importDepuisAdresse();
}
// Si l'app est déjà ouverte dans cet onglet, seule la fin de l'adresse
// change (#import=…) : pas de rechargement, donc on écoute ce changement.
window.addEventListener('hashchange', _importDepuisAdresse);
