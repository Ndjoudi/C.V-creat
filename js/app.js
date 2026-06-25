// ── CONSTANTS ─────────────────────────────────────────────
const SUBS  = ['Logistique / Entrepôt','Transport','Planification / S&OP','Approvisionnement','Achats / Sourcing','Industriel / Lean','Import / Export','Customer Service SC'];
const TOOLS = ['SAP MM','SAP WM/EWM','SAP APO/IBP','Oracle SCM','WMS','TMS','Excel avancé','Power BI','Tableau','Dynamics 365','AS400','EDI','Kinaxis','Blue Yonder','SAGE','Cegid','Generix','Reflex WMS','Manhattan WMS','Infor M3','Excel TCD'];
const CERTS = ['APICS CPIM','APICS CSCP','Six Sigma Green Belt','Six Sigma Black Belt','Lean Manufacturing','CILT','PMP','Prince2','Agile/Scrum','CIPS','ISO 9001','ISO 14001','Lean Six Sigma'];
const SECTS = ['Industrie','Retail / Distribution','Agroalimentaire','Pharmacie','Automobile','Luxe / Mode','Aéronautique','Grande consommation','E-commerce','BTP','Energie','Cosmétique','Santé / Médical'];
const INFORMATIQUE = ['Microsoft Word','Claude Code','PowerPoint','Outlook','Teams','Antigravity','Google Sheets','Google Slides','Canva','Notion','Trello','Slack','Zoom','SharePoint','OneDrive','Adobe Acrobat','Salesforce','HubSpot','WordPress','ChatGPT / IA générative'];
const STATS = ['À traiter','Envoyé','Message in','Entretien','Refusé'];
let _dashFilter = 'Tous';
let _dashFilterSource = 'Tous';
let _dashSortDate = 'desc'; // desc = récent → ancien
let _dashPage = 0;
const DASH_PAGE_SIZE = 15;
function setDashFilter(f) { _dashFilter = f; _dashPage = 0; refreshDash(); }
function setDashFilterSource(f) { _dashFilterSource = f; _dashPage = 0; refreshDash(); }
function toggleDashSortDate() { _dashSortDate = _dashSortDate === 'desc' ? 'asc' : 'desc'; _dashPage = 0; refreshDash(); }
function setDashPage(p) { _dashPage = p; refreshDash(); }
const STAT_COLORS = {
  'À traiter':  ['var(--ink3)','var(--bg)','var(--border)'],
  'Envoyé':     ['#3B82F6','#EFF6FF','#BFDBFE'],
  'Message in': ['#D97706','#FFFBEB','#FDE68A'],
  'Entretien':  ['var(--teal)','var(--teal-bg)','var(--teal-border)'],
  'Refusé':     ['#DC2626','var(--red-bg)','var(--red-border)']
};
// Lettres cliquables de statut — ['À','E','M','E','R']
const STAT_LETTERS = ['À','E','M','E','R'];
function renderStatusLetters(candId, currentStatus, onChangeFn) {
  return `<div style="display:flex;gap:3px;align-items:center">` +
    STATS.map((s, i) => {
      const [col,,border] = STAT_COLORS[s] || ['var(--ink3)','var(--bg)','var(--border)'];
      const active = s === currentStatus;
      return `<span
        onclick="${onChangeFn}('${candId}','status','${s}')"
        title="${s}"
        style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;font-size:11px;font-weight:800;cursor:pointer;transition:all .15s;
          ${active
            ? `background:${col};color:white;border:2px solid ${col};`
            : `background:transparent;color:var(--ink3);border:1.5px solid var(--border);opacity:.55;`}"
        onmouseover="if('${s}'!=='${currentStatus}')this.style.opacity='1'"
        onmouseout="if('${s}'!=='${currentStatus}')this.style.opacity='.55'"
      >${STAT_LETTERS[i]}</span>`;
    }).join('') +
  `</div>`;
}

const DEF_PROFILE = {
  firstName:'',lastName:'',email:'',phone:'',location:'',linkedin:'',
  title:'',yearsExp:'',mobility:'',summaryTarget:'',
  permis:'',disponibilite:'',contratRecherche:'',domainesProfile:'',hobbies:'',photo:'',
  subdomains:[],tools:[],certifs:[],sectors:[],customSkills:[],informatique:[],
  experiences:[],education:[],languages:[],
  emphases:[],
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
  // 1. Retire les blocs markdown
  let txt = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();

  // 2. Normalise les guillemets typographiques → ASCII (problème fréquent avec Gemini)
  txt = txt
    .replace(/[“”„‟″‶]/g, '"')  // " " → "
    .replace(/[‘’‚‛′‵]/g, "'");  // ' ' → '

  // 3. Isole le JSON
  const start = txt.search(/[\[{]/);
  if (start !== -1) txt = txt.slice(start);
  const lastClose = Math.max(txt.lastIndexOf('}'), txt.lastIndexOf(']'));
  if (lastClose !== -1) txt = txt.slice(0, lastClose + 1);

  // 4. Essai direct
  try { return JSON.parse(txt); } catch {}

  // 5. Réparation caractère par caractère — échappe les vrais \n \r \t
  //    qui se trouvent à l'intérieur d'une chaîne JSON
  let fixed = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (escaped) { fixed += ch; escaped = false; continue; }
    if (ch === '\\') { fixed += ch; escaped = true; continue; }
    if (ch === '"') { inString = !inString; fixed += ch; continue; }
    if (inString) {
      if (ch === '\n') { fixed += '\\n'; continue; }
      if (ch === '\r') { continue; }
      if (ch === '\t') { fixed += '\\t'; continue; }
    }
    fixed += ch;
  }

  return JSON.parse(fixed);
}

// ── ESCAPE ─────────────────────────────────────────────────
function esc(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── PROFILE STATE ──────────────────────────────────────────
let P = ls('sc_profile', DEF_PROFILE);
if (!P.emphases) P.emphases = [];
// Migrate old profiles missing newer fields
['customSkills','education','languages','informatique'].forEach(k => { if (!P[k]) P[k] = []; });
['linkedin','mobility','permis','disponibilite','contratRecherche','domainesProfile','hobbies','photo','summaryTarget'].forEach(k => { if (P[k] === undefined) P[k] = ''; });
// Migration v3 : domainesProfile est désormais généré automatiquement par offre (split view)
if (!P._v3_hookMigrated) { P.domainesProfile = ''; P._v3_hookMigrated = true; ss('sc_profile', P); }
// Migration v4 : renommage statut "Analysé" → "À traiter"
(function _migrateAnalyse() {
  const cands = ls('sc_cands', []);
  let changed = false;
  cands.forEach(c => { if (c.status === 'Analysé') { c.status = 'À traiter'; changed = true; } });
  if (changed) ss('sc_cands', cands);
})();
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
  // Init le switch provider sur l'écran de setup
  const savedProvider = localStorage.getItem('sc_ai_provider') || 'groq';
  setupSetProvider(savedProvider);
  document.getElementById('key-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveKey();
  });
  initTabs();
  initNav();
  initSidebarState();
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('f-date').value = today;
  const dashDate = document.getElementById('dash-date');
  if (dashDate) dashDate.value = today;

  // Close modals on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal();
      closeHistModal();
      closeNoteModal();
      if (typeof closeAnalysisModal === 'function') closeAnalysisModal();
      if (typeof closeSplitView === 'function') closeSplitView();
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
function setupSetProvider(p) {
  localStorage.setItem('sc_ai_provider', p);
  const groqBtn   = document.getElementById('setup-groq-btn');
  const geminiBtn = document.getElementById('setup-gemini-btn');
  const label     = document.getElementById('setup-key-label');
  const note      = document.getElementById('setup-key-note');
  const input     = document.getElementById('key-input');

  if (p === 'gemini') {
    geminiBtn.style.background = '#111'; geminiBtn.style.color = 'white'; geminiBtn.style.borderColor = '#111';
    groqBtn.style.background   = 'none'; groqBtn.style.color   = 'var(--ink3)'; groqBtn.style.borderColor = 'var(--border)';
    label.textContent = 'Clé API Gemini (gratuite)';
    input.placeholder = 'AIza...';
    note.innerHTML = 'Gratuit. Va sur <a class="alink" href="https://aistudio.google.com/apikey" target="_blank">aistudio.google.com/apikey</a> → "Create API key in new project" → copie ta clé ici.';
  } else {
    groqBtn.style.background   = '#111'; groqBtn.style.color   = 'white'; groqBtn.style.borderColor = '#111';
    geminiBtn.style.background = 'none'; geminiBtn.style.color = 'var(--ink3)'; geminiBtn.style.borderColor = 'var(--border)';
    label.textContent = 'Clé API Groq (gratuite)';
    input.placeholder = 'gsk_...';
    note.innerHTML = 'Gratuit, fonctionne en France. Va sur <a class="alink" href="https://console.groq.com/keys" target="_blank">console.groq.com/keys</a> → crée un compte → "Create API key" → copie ta clé ici.';
  }
}

function saveKey() {
  const k = document.getElementById('key-input').value.trim();
  const p = localStorage.getItem('sc_ai_provider') || 'groq';
  if (!k) { toast('Entre une clé API valide'); return; }
  if (p === 'groq' && !k.startsWith('gsk_')) { toast('La clé Groq doit commencer par gsk_'); return; }
  if (p === 'gemini' && !k.startsWith('AIza')) { toast('La clé Gemini doit commencer par AIza'); return; }
  if (p === 'gemini') {
    localStorage.setItem('sc_gemini_key', k);
    localStorage.setItem('sc_key', 'gemini'); // valeur placeholder pour que showApp() s'active
  } else {
    localStorage.setItem('sc_key', k);
  }
  showApp();
}
function resetKey() {
  if (!confirm('Changer de clé API ? Tes données de profil seront conservées.')) return;
  localStorage.removeItem('sc_key');
  document.getElementById('setup-sc').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function setProvider(p) {
  localStorage.setItem('sc_ai_provider', p);
  refreshProviderUI();
}

function refreshProviderUI() {
  const p = localStorage.getItem('sc_ai_provider') || 'groq';
  const groqKey      = localStorage.getItem('sc_key');
  const geminiKey    = localStorage.getItem('sc_gemini_key');
  const geminiProKey = localStorage.getItem('sc_gemini_pro_key');
  const hasGroq      = !!groqKey && groqKey !== 'gemini';
  const hasGemini    = !!geminiKey;
  const hasGeminiPro = !!geminiProKey;

  _renderKeyRow('api-key-groq',       'Groq',       'groq',       hasGroq,      hasGroq ? groqKey : '',           p === 'groq');
  _renderKeyRow('api-key-gemini',     'Gemini',     'gemini',     hasGemini,    hasGemini ? geminiKey : '',       p === 'gemini');
  _renderKeyRow('api-key-gemini-pro', 'Gemini Pro', 'gemini-pro', hasGeminiPro, hasGeminiPro ? geminiProKey : '', p === 'gemini-pro');
}

function _renderKeyRow(elId, label, provider, hasKey, rawKey, isActive) {
  const el = document.getElementById(elId);
  if (!el) return;
  const masked = hasKey ? rawKey.slice(0, 4) + '•••' + rawKey.slice(-4) : '—';
  el.className = 'api-key-row' + (isActive ? ' active' : '');
  el.innerHTML = `
    <span class="api-key-dot ${hasKey ? 'on' : 'off'}"></span>
    <span class="api-key-name">${label}</span>
    <span class="api-key-preview">${hasKey ? masked : 'Non configurée'}</span>
    <button class="api-key-btn" onclick="event.stopPropagation();_editApiKey('${provider}')">${hasKey ? 'Modifier' : 'Ajouter'}</button>
  `;
}

const _KEY_META = {
  'groq':       { elId: 'api-key-groq',       label: 'Groq',       ph: 'gsk_...',  lsKey: 'sc_key',            prefix: 'gsk_' },
  'gemini':     { elId: 'api-key-gemini',     label: 'Gemini',     ph: 'AIza...',  lsKey: 'sc_gemini_key',     prefix: 'AIza' },
  'gemini-pro': { elId: 'api-key-gemini-pro', label: 'Gemini Pro', ph: 'Clé API...', lsKey: 'sc_gemini_pro_key', prefix: '' }
};

function _editApiKey(provider) {
  const m = _KEY_META[provider]; if (!m) return;
  const el = document.getElementById(m.elId);
  if (!el) return;
  const label = m.label;
  const ph    = m.ph;
  el.innerHTML = `
    <span class="api-key-dot off" style="background:#6366f1"></span>
    <span class="api-key-name">${label}</span>
    <input class="api-key-input" id="edit-key-${provider}" placeholder="${ph}" autofocus
      onkeydown="if(event.key==='Enter')_saveApiKey('${provider}');if(event.key==='Escape')refreshProviderUI()"/>
    <button class="api-key-save" onclick="event.stopPropagation();_saveApiKey('${provider}')">OK</button>
    <button class="api-key-btn" onclick="event.stopPropagation();refreshProviderUI()">✕</button>
  `;
  el.onclick = null;
  setTimeout(() => document.getElementById('edit-key-' + provider)?.focus(), 50);
}

function _saveApiKey(provider) {
  const m = _KEY_META[provider]; if (!m) return;
  const input = document.getElementById('edit-key-' + provider);
  const k = input?.value.trim();
  if (!k) { toast('Entre une clé API valide'); return; }
  if (m.prefix && !k.startsWith(m.prefix)) { toast('La clé ' + m.label + ' doit commencer par ' + m.prefix); return; }
  localStorage.setItem(m.lsKey, k);
  if (provider === 'groq') localStorage.setItem('sc_key', k);
  setProvider(provider);
  toast('✓ Clé ' + m.label + ' sauvegardée');
  const el = document.getElementById(m.elId);
  if (el) el.onclick = () => setProvider(provider);
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
  refreshProviderUI();
}

// ── SIDEBAR COLLAPSE ───────────────────────────────────────
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const collapsed = sb.classList.toggle('collapsed');
  localStorage.setItem('sc_sb_collapsed', collapsed ? '1' : '0');
}
function initSidebarState() {
  if (localStorage.getItem('sc_sb_collapsed') === '1') {
    document.getElementById('sidebar').classList.add('collapsed');
  }
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
  // badges désactivés (nav Candidatures + Mes analyses supprimés)
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
  document.getElementById('dash-title').textContent = hp ? 'Bonjour, ' + P.firstName : 'Bonjour';

  const dashEl = document.getElementById('dash-stats');
  if (!hp) { dashEl.innerHTML = ''; return; }

  const cands   = ls('sc_cands', []);
  const fields  = [P.firstName, P.lastName, P.email, P.title, P.yearsExp,
    P.subdomains.length > 0, P.tools.length > 0, P.experiences.length > 0, P.education.length > 0];
  const pct     = Math.round(fields.filter(Boolean).length / 9 * 100);

  // ── Stat-filter cards (cliquables) ──
  const allCount = cands.length;
  const allActive = _dashFilter === 'Tous';
  const statCards = [
    { key: 'Tous', label: 'TOUS', count: allCount }
  ].concat(STATS.map(s => ({ key: s, label: s, count: cands.filter(c => c.status === s).length })))
  .map(({ key, label, count }) => {
    const [col,, border] = STAT_COLORS[key] || ['var(--ink)', 'var(--bg)', 'var(--border)'];
    const active = key === _dashFilter;
    return `<div onclick="setDashFilter('${key}')" style="
      cursor:pointer;user-select:none;text-align:center;
      background:${active ? `${col}12` : 'var(--card)'};
      border:1.5px solid ${active ? col : 'var(--border)'};
      border-radius:10px;padding:7px 12px;min-width:64px;flex:1;
      transition:border-color .15s,background .15s;
      box-shadow:${active ? `0 0 0 2px ${col}22` : 'none'};
    ">
      <div style="font-size:18px;font-weight:800;color:${col};line-height:1.1">${count}</div>
      <div style="font-size:9.5px;font-weight:700;color:var(--ink3);letter-spacing:.5px;margin-top:3px;white-space:nowrap">${label}</div>
    </div>`;
  }).join('');

  // ── Filtrage ──
  let filtered = [...cands];
  if (_dashFilter !== 'Tous')       filtered = filtered.filter(c => c.status === _dashFilter);
  if (_dashFilterSource !== 'Tous') filtered = filtered.filter(c => (c.jobSource || '') === _dashFilterSource);
  filtered.sort((a, b) => {
    const da = a.date || '', db = b.date || '';
    return _dashSortDate === 'desc' ? db.localeCompare(da) : da.localeCompare(db);
  });
  // ── Pagination ──
  const totalRows  = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / DASH_PAGE_SIZE));
  if (_dashPage >= totalPages) _dashPage = totalPages - 1;
  if (_dashPage < 0) _dashPage = 0;
  const pageStart = _dashPage * DASH_PAGE_SIZE;
  filtered = filtered.slice(pageStart, pageStart + DASH_PAGE_SIZE);

  // ── Tableau filtré ──
  const _fmtDate = (d) => {
    if (!d) return '';
    const p = d.split('-');
    if (p.length !== 3) return d;
    return p[2] + '-' + p[1] + '-' + p[0].slice(2);
  };

  let _prevDate = '';
  const renderRow = c => {
    const [, bg] = STAT_COLORS[c.status] || ['var(--ink3)', 'var(--bg)', 'var(--border)'];
    const tdBg = `background:${bg}`;
    const sourceBadge = c.jobSource === 'linkedin'
      ? `<span style="background:#e0f0ff;color:#0a66c2;border:1px solid #bfdbfe;border-radius:100px;padding:2px 9px;font-size:11px;font-weight:700">LinkedIn</span>`
      : c.jobSource === 'indeed'
      ? `<span style="background:#e8eeff;color:#2164f3;border:1px solid #c7d2fe;border-radius:100px;padding:2px 9px;font-size:11px;font-weight:700">Indeed</span>`
      : `<span style="opacity:.3;font-size:12px">—</span>`;

    let sep = '';
    if (_prevDate && c.date !== _prevDate) {
      sep = `<tr><td colspan="5" style="padding:0;height:3px;background:var(--border);border:none"></td></tr>`;
    }
    _prevDate = c.date;

    return sep + `<tr data-cand-id="${c.id}">
      <td style="${tdBg}">
        <div style="font-weight:700;color:var(--ink);font-size:13px;cursor:pointer;text-decoration:underline;text-decoration-color:var(--border);text-underline-offset:3px" onclick="openSplitView('${c.id}')" title="Voir offre + CV">${esc(c.poste)}</div>
        <div style="color:var(--ink3);font-size:12px;margin-top:1px">${esc(c.company)}</div>
      </td>
      <td style="${tdBg}">${sourceBadge}</td>
      <td style="${tdBg};color:var(--ink3);font-size:12.5px">${_fmtDate(c.date)}</td>
      <td style="${tdBg}">${renderStatusLetters(c.id, c.status, 'updCandAndRefresh')}</td>
      <td style="${tdBg};white-space:nowrap">
        ${c.analysis ? `<button onclick="loadCVForCand('${c.id}')" style="background:none;border:1.5px solid var(--teal-border);cursor:pointer;color:var(--teal-d);font-size:11px;font-weight:700;padding:3px 8px;border-radius:100px;margin-right:3px" title="CV adapté">CV</button><button onclick="loadCVForCand('${c.id}',true)" style="background:none;border:1.5px solid var(--border);cursor:pointer;color:var(--ink3);font-size:11px;font-weight:600;padding:3px 8px;border-radius:100px;margin-right:3px" title="PDF">⬇ PDF</button>` : ''}
        <button onclick="openSplitView('${c.id}')" style="background:none;border:none;cursor:pointer;color:var(--ink3);font-size:13px;padding:2px 5px;border-radius:4px" title="Ouvrir">↗</button>
        <button onclick="delCand('${c.id}')" style="background:none;border:1.5px solid #fecaca;cursor:pointer;color:#dc2626;font-size:12px;font-weight:700;padding:2px 7px;border-radius:100px;margin-left:3px;line-height:1" title="Supprimer">🗑</button>
      </td>
    </tr>`;
  };

  let recentHtml;
  if (filtered.length) {
    _prevDate = '';
    let paginationHtml = '';
    if (totalPages > 1) {
      const from = pageStart + 1;
      const to   = pageStart + filtered.length;
      const btn = (label, page, disabled) =>
        `<button onclick="setDashPage(${page})" ${disabled ? 'disabled' : ''} style="
          background:none;border:1.5px solid var(--border);border-radius:7px;
          padding:4px 11px;font-size:12px;font-weight:600;cursor:${disabled ? 'default' : 'pointer'};
          color:${disabled ? 'var(--border)' : 'var(--ink2)'};">${label}</button>`;
      paginationHtml = `<div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px">
        <span style="font-size:12px;color:var(--ink3)">${from}–${to} sur ${totalRows}</span>
        <div style="display:flex;gap:6px;align-items:center">
          ${btn('← Préc', _dashPage - 1, _dashPage === 0)}
          <span style="font-size:12px;color:var(--ink3);font-weight:600;padding:0 4px">${_dashPage + 1} / ${totalPages}</span>
          ${btn('Suiv →', _dashPage + 1, _dashPage === totalPages - 1)}
        </div>
      </div>`;
    }
    recentHtml = `<table class="tbl">
      <thead><tr><th>Poste · Entreprise</th><th>Source</th><th>Date</th><th>Statut</th><th></th></tr></thead>
      <tbody>${filtered.map(renderRow).join('')}</tbody>
    </table>${paginationHtml}`;
  } else {
    recentHtml = `<div class="empty" style="padding:24px"><div class="empty-ic">◫</div><div class="empty-t">${cands.length ? 'Aucune candidature pour ce filtre' : 'Aucune candidature'}</div></div>`;
  }

  // filterChips remplacés par statCards cliquables (ci-dessus)

  // ── Chips source ──
  const sourceChips = ['Tous','linkedin','indeed'].map(s => {
    const active = s === _dashFilterSource;
    const label = s === 'Tous' ? 'Toutes sources' : s === 'linkedin' ? 'LinkedIn' : 'Indeed';
    const col = s === 'linkedin' ? '#0a66c2' : s === 'indeed' ? '#2164f3' : 'var(--ink3)';
    const count = s === 'Tous' ? cands.length : cands.filter(c => c.jobSource === s).length;
    return `<span onclick="setDashFilterSource('${s}')" style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:100px;font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap;
      ${active ? `background:${col==='var(--ink3)'?'#374151':col};color:white;border:1.5px solid transparent;` : `background:transparent;color:var(--ink3);border:1.5px solid var(--border);`}"
    >${label}${count ? ` <span style="font-size:10px;opacity:.8">${count}</span>` : ''}</span>`;
  }).join('');

  // ── Bouton tri date ──
  const dateSortBtn = `<span onclick="toggleDashSortDate()" style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:100px;font-size:11.5px;font-weight:700;cursor:pointer;background:transparent;color:var(--ink3);border:1.5px solid var(--border);">
    Date ${_dashSortDate === 'desc' ? '↓' : '↑'}
  </span>`;

  dashEl.innerHTML = `
    <!-- Stat-filter cards -->
    <div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px">${statCards}</div>

    <!-- Titre + filtres source + tri -->
    <div style="margin-bottom:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div style="display:flex;gap:5px;flex-wrap:wrap">${sourceChips}</div>
        ${dateSortBtn}
      </div>
    </div>
    <div style="margin-bottom:20px">${recentHtml}</div>
  `;

  if (typeof lucide !== 'undefined') lucide.createIcons();
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
