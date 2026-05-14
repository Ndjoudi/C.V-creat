// ── CONSTANTS ─────────────────────────────────────────────
const SUBS  = ['Logistique / Entrepôt','Transport','Planification / S&OP','Approvisionnement','Achats / Sourcing','Industriel / Lean','Import / Export','Customer Service SC'];
const TOOLS = ['SAP MM','SAP WM/EWM','SAP APO/IBP','Oracle SCM','WMS','TMS','Excel avancé','Power BI','Tableau','Dynamics 365','AS400','EDI','Kinaxis','Blue Yonder','SAGE','Cegid','Generix','Reflex WMS','Manhattan WMS','Infor M3','Excel TCD'];
const CERTS = ['APICS CPIM','APICS CSCP','Six Sigma Green Belt','Six Sigma Black Belt','Lean Manufacturing','CILT','PMP','Prince2','Agile/Scrum','CIPS','ISO 9001','ISO 14001','Lean Six Sigma'];
const SECTS = ['Industrie','Retail / Distribution','Agroalimentaire','Pharmacie','Automobile','Luxe / Mode','Aéronautique','Grande consommation','E-commerce','BTP','Energie','Cosmétique','Santé / Médical'];
const INFORMATIQUE = ['Microsoft Word','Claude Code','PowerPoint','Outlook','Teams','Antigravity','Google Sheets','Google Slides','Canva','Notion','Trello','Slack','Zoom','SharePoint','OneDrive','Adobe Acrobat','Salesforce','HubSpot','WordPress','ChatGPT / IA générative'];
const STATS = ['Envoyée','En cours','Entretien','Offre reçue','Refusée'];
const STAT_COLORS = {
  'Envoyée':      ['#3B82F6','#EFF6FF','#BFDBFE'],
  'En cours':     ['#D97706','#FFFBEB','#FDE68A'],
  'Entretien':    ['var(--teal)','var(--teal-bg)','var(--teal-border)'],
  'Offre reçue':  ['#16A34A','#F0FDF4','#BBF7D0'],
  'Refusée':      ['#DC2626','var(--red-bg)','var(--red-border)']
};

const DEF_PROFILE = {
  firstName:'',lastName:'',email:'',phone:'',location:'',linkedin:'',
  title:'',yearsExp:'',mobility:'',summaryTarget:'',
  permis:'',disponibilite:'',contratRecherche:'',domainesProfile:'',hobbies:'',photo:'',
  subdomains:[],tools:[],certifs:[],sectors:[],customSkills:[],informatique:[],
  experiences:[],education:[],languages:[],
  highlightConfig:{ formation:true, contrat:true, dispo:true, mobility:true, permis:false }
};

// ── CV TARGET (poste ciblé — persiste entre sessions) ──────
let _cvTarget = localStorage.getItem('sc_cv_target') || '';

// ── MATCHED SKILLS (depuis dernière analyse d'offre) ────────
let _matchedSkills = JSON.parse(localStorage.getItem('sc_matched_skills') || '[]');

// ── LOCALSTORAGE HELPERS ───────────────────────────────────
function ls(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }
function ss(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

// ── SAFE JSON PARSE ────────────────────────────────────────
function safeParseJSON(raw) {
  let txt = raw.replace(/```json\s*/gi,'').replace(/```/g,'').trim();
  const start = txt.search(/[\[{]/);
  if (start !== -1) txt = txt.slice(start);
  const lastClose = Math.max(txt.lastIndexOf('}'), txt.lastIndexOf(']'));
  if (lastClose !== -1) txt = txt.slice(0, lastClose + 1);
  txt = txt.replace(/"((?:[^"\\]|\\.)*)"/g, (_, s) =>
    '"' + s.replace(/\n/g,'\\n').replace(/\r/g,'').replace(/\t/g,'\\t') + '"'
  );
  return JSON.parse(txt);
}

// ── ESCAPE ─────────────────────────────────────────────────
function esc(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── PROFILE STATE ──────────────────────────────────────────
let P = ls('sc_profile', DEF_PROFILE);
// Migrate old profiles missing newer fields
['customSkills','education','languages','informatique'].forEach(k => { if (!P[k]) P[k] = []; });
['linkedin','mobility','permis','disponibilite','contratRecherche','domainesProfile','hobbies','photo','summaryTarget'].forEach(k => { if (P[k] === undefined) P[k] = ''; });
if (!P.highlightConfig) P.highlightConfig = { formation:true, contrat:true, dispo:true, mobility:true, permis:false };
if (P.highlightConfig.contrat === undefined) P.highlightConfig.contrat = true;
// Migrate experience objects to include new fields
P.experiences.forEach(e => {
  if (e.contractType === undefined) e.contractType = '';
  if (e.sector === undefined) e.sector = '';
  if (e.souvenirs === undefined) e.souvenirs = '';
  if (e.fichemetier === undefined) e.fichemetier = '';
  if (e.bullets === undefined) e.bullets = [];
});

// ── THEME (mode clair fixe) ────────────────────────────────
document.documentElement.setAttribute('data-theme', 'light');

// ── TOAST ──────────────────────────────────────────────────
function toast(msg, dur = 2800) {
  const wrap = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toastOut .3s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, dur);
}

// ── INIT ───────────────────────────────────────────────────
window.onload = () => {
  // Render all static Lucide icons
  if (typeof lucide !== 'undefined') lucide.createIcons();

  const key = localStorage.getItem('sc_key');
  if (key) showApp();
  document.getElementById('key-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveKey();
  });
  initTabs();
  initNav();
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('f-date').value = today;

  // Close modals on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal();
      closeHistModal();
      closeNoteModal();
      if (typeof closeAnalysisModal === 'function') closeAnalysisModal();
    }
  });
  // Close modals on overlay click
  document.addEventListener('click', e => {
    if (e.target.id === 'modal-overlay') closeModal();
    if (e.target.id === 'hist-modal-overlay') closeHistModal();
    if (e.target.id === 'note-modal-overlay') closeNoteModal();
    if (e.target.id === 'bullet-picker-overlay') closeBulletPicker();
    if (e.target.id === 'bullet-match-overlay') closeBulletMatch();
  });
};

// ── KEY / APP ──────────────────────────────────────────────
function saveKey() {
  const k = document.getElementById('key-input').value.trim();
  if (!k) { toast('Entre une clé API Groq valide'); return; }
  if (!k.startsWith('gsk_')) { toast('La clé doit commencer par gsk_'); return; }
  localStorage.setItem('sc_key', k);
  showApp();
}
function resetKey() {
  if (!confirm('Changer de clé API ? Tes données de profil seront conservées.')) return;
  localStorage.removeItem('sc_key');
  document.getElementById('setup-sc').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}
function showApp() {
  document.getElementById('setup-sc').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  loadProfileToForm();
  renderChips();
  renderExpList();
  renderEduList();
  renderLangList();
  refreshDash();
  renderTracker();
  refreshBadges();
}

// ── MOBILE MENU ────────────────────────────────────────────
function openMobileMenu() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sb-overlay').classList.add('open');
}
function closeMobileMenu() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sb-overlay').classList.remove('open');
}

// ── NAVIGATION ─────────────────────────────────────────────
function initNav() {
  document.querySelectorAll('.ni').forEach(n => {
    n.addEventListener('click', () => { goTo(n.dataset.sc); closeMobileMenu(); });
  });
}
function goTo(id) {
  document.querySelectorAll('.ni').forEach(n => n.classList.toggle('on', n.dataset.sc === id));
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === 'sc-' + id));
  if (id === 'cv')       renderCV();
  if (id === 'dash')     refreshDash();
  if (id === 'tracker')  renderTracker();
  if (id === 'history')  renderHistory();
  if (id === 'interview') prefillInterviewRole();
}

function refreshBadges() {
  const cands = ls('sc_cands', []);
  const badge = document.getElementById('badge-cands');
  if (cands.length > 0) { badge.textContent = cands.length; badge.style.display = ''; }
  else badge.style.display = 'none';

  const hist = ls('sc_history', []);
  const bh = document.getElementById('badge-hist');
  if (hist.length > 0) { bh.textContent = hist.length; bh.style.display = ''; }
  else bh.style.display = 'none';
}

// ── TABS ───────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tabs').forEach(tabGroup => {
    const tabs = tabGroup.querySelectorAll('.tab');
    tabs.forEach(t => {
      t.addEventListener('click', () => {
        tabs.forEach(x => x.classList.toggle('on', x === t));
        tabGroup.querySelectorAll('.tab').forEach(x => {
          const pane = document.getElementById('tab-' + x.dataset.tab);
          if (pane) pane.classList.toggle('hidden', x !== t);
        });
      });
    });
  });
}

// ── DASHBOARD ──────────────────────────────────────────────
function refreshDash() {
  updateSBProfile();
  const hp = P.firstName && P.lastName;
  document.getElementById('onboard-block').classList.toggle('hidden', !!hp);
  document.getElementById('dash-stats').classList.toggle('hidden', !hp);
  if (hp) {
    document.getElementById('dash-title').textContent = 'Bonjour, ' + P.firstName;
    const fields = [P.firstName, P.lastName, P.email, P.title, P.yearsExp,
      P.subdomains.length > 0, P.tools.length > 0, P.experiences.length > 0, P.education.length > 0];
    const pct = Math.round(fields.filter(Boolean).length / 9 * 100);
    document.getElementById('pct-label').textContent = pct + '%';
    document.getElementById('pct-bar').style.width = pct + '%';
    document.getElementById('pct-hint').innerHTML = pct < 100
      ? `<span style="color:var(--teal);cursor:pointer;font-weight:600" onclick="goTo('profile')">Compléter → </span>pour de meilleurs résultats IA`
      : '✓ Profil complet — l\'IA est prête';
    const cands = ls('sc_cands', []);
    document.getElementById('dash-counts').innerHTML = [
      { n: P.tools.length, l: 'Outils' },
      { n: P.certifs.length, l: 'Certifications' },
      { n: P.experiences.length, l: 'Expériences' },
      { n: cands.length, l: 'Candidatures' }
    ].map(({ n, l }) => `<div class="stat"><div class="stat-n">${n}</div><div class="stat-l">${l}</div></div>`).join('');
  } else {
    document.getElementById('dash-title').textContent = 'Bonjour';
  }
}

// ── EXPORT ALL DATA ─────────────────────────────────────────
function exportAllData() {
  const data = { profile: P, candidatures: ls('sc_cands', []), historique: ls('sc_history', []), exported: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'supply-copilot-backup.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Sauvegarde téléchargée');
}

// ── IMPORT ALL DATA ─────────────────────────────────────────
function importAllData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.profile) throw new Error('Fichier invalide');
        if (!confirm('Remplacer toutes tes données actuelles par ce fichier ?')) return;
        if (data.profile)       { ss('sc_profile', data.profile); P = data.profile; }
        if (data.candidatures)  ss('sc_cands', data.candidatures);
        if (data.historique)    ss('sc_history', data.historique);
        showApp();
        toast('Données importées');
      } catch {
        toast('Fichier JSON invalide');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}
