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
function setDashFilter(f) { _dashFilter = f; refreshDash(); }
function setDashFilterSource(f) { _dashFilterSource = f; refreshDash(); }
function toggleDashSortDate() { _dashSortDate = _dashSortDate === 'desc' ? 'asc' : 'desc'; refreshDash(); }
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
// Migrate old profiles missing newer fields
['customSkills','education','languages','informatique'].forEach(k => { if (!P[k]) P[k] = []; });
['linkedin','mobility','permis','disponibilite','contratRecherche','domainesProfile','hobbies','photo','summaryTarget'].forEach(k => { if (P[k] === undefined) P[k] = ''; });
// Migration v3 : domainesProfile est désormais généré automatiquement par offre (split view)
if (!P._v3_hookMigrated) { P.domainesProfile = ''; P._v3_hookMigrated = true; ss('sc_profile', P); }
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

function saveGeminiKey() {
  const k = document.getElementById('gemini-key-input')?.value.trim();
  if (!k) { toast('Entre ta clé Gemini (AIza...)'); return; }
  localStorage.setItem('sc_gemini_key', k);
  document.getElementById('gemini-key-input').value = '';
  refreshProviderUI();
  toast('✓ Clé Gemini sauvegardée');
}

function refreshProviderUI() {
  const p = localStorage.getItem('sc_ai_provider') || 'groq';
  const hasGemini = !!localStorage.getItem('sc_gemini_key');

  const gBtn = document.getElementById('provider-groq-btn');
  const mBtn = document.getElementById('provider-gemini-btn');
  const row  = document.getElementById('gemini-key-row');
  const saved= document.getElementById('gemini-key-saved');
  if (!gBtn) return;

  // Style boutons actif/inactif
  [gBtn, mBtn].forEach(b => {
    b.style.background = 'none'; b.style.color = 'var(--ink3)'; b.style.borderColor = 'var(--border)';
  });
  const active = p === 'gemini' ? mBtn : gBtn;
  active.style.background = '#6366f1'; active.style.color = 'white'; active.style.borderColor = '#6366f1';

  // Affiche input clé Gemini si besoin
  if (p === 'gemini') {
    row.style.display = hasGemini ? 'none' : 'flex';
    saved.style.display = hasGemini ? 'block' : 'none';
  } else {
    row.style.display = 'none';
    saved.style.display = 'none';
  }
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
  document.getElementById('dash-title').textContent = hp ? 'Bonjour, ' + P.firstName : 'Bonjour';

  const dashEl = document.getElementById('dash-stats');
  if (!hp) { dashEl.innerHTML = ''; return; }

  const cands   = ls('sc_cands', []);
  const fields  = [P.firstName, P.lastName, P.email, P.title, P.yearsExp,
    P.subdomains.length > 0, P.tools.length > 0, P.experiences.length > 0, P.education.length > 0];
  const pct     = Math.round(fields.filter(Boolean).length / 9 * 100);

  // ── Stats candidatures (même style que le tracker) ──
  const statCards = STATS.map(s => {
    const [col,, border] = STAT_COLORS[s] || ['var(--ink3)', 'var(--bg)', 'var(--border)'];
    const n = cands.filter(c => c.status === s).length;
    return `<div class="stat" style="border-color:${border}"><div class="stat-n" style="color:${col}">${n}</div><div class="stat-l">${s}</div></div>`;
  }).join('');

  // ── Filtrage ──
  let filtered = [...cands];
  if (_dashFilter !== 'Tous')       filtered = filtered.filter(c => c.status === _dashFilter);
  if (_dashFilterSource !== 'Tous') filtered = filtered.filter(c => (c.jobSource || '') === _dashFilterSource);
  filtered.sort((a, b) => {
    const da = a.date || '', db = b.date || '';
    return _dashSortDate === 'desc' ? db.localeCompare(da) : da.localeCompare(db);
  });
  if (_dashFilter === 'Tous' && _dashFilterSource === 'Tous') filtered = filtered.slice(0, 8);

  // ── Tableau filtré ──
  const renderRow = c => {
    const sourceBadge = c.jobSource === 'linkedin'
      ? `<span style="background:#e0f0ff;color:#0a66c2;border:1px solid #bfdbfe;border-radius:100px;padding:2px 9px;font-size:11px;font-weight:700">LinkedIn</span>`
      : c.jobSource === 'indeed'
      ? `<span style="background:#e8eeff;color:#2164f3;border:1px solid #c7d2fe;border-radius:100px;padding:2px 9px;font-size:11px;font-weight:700">Indeed</span>`
      : `<span style="opacity:.3;font-size:12px">—</span>`;
    return `<tr>
      <td>
        <div style="font-weight:700;color:var(--ink);font-size:13px;cursor:pointer;text-decoration:underline;text-decoration-color:var(--border);text-underline-offset:3px" onclick="openSplitView('${c.id}')" title="Voir offre + CV">${esc(c.poste)}</div>
        <div style="color:var(--ink3);font-size:12px;margin-top:1px">${esc(c.company)}</div>
      </td>
      <td>${sourceBadge}</td>
      <td style="color:var(--ink3);font-size:12.5px">${c.date || ''}</td>
      <td>${renderStatusLetters(c.id, c.status, 'updCandAndRefresh')}</td>
      <td style="white-space:nowrap">
        ${c.analysis ? `<button onclick="loadCVForCand('${c.id}')" style="background:none;border:1.5px solid var(--teal-border);cursor:pointer;color:var(--teal-d);font-size:11px;font-weight:700;padding:3px 8px;border-radius:100px;margin-right:3px" title="CV adapté">CV</button><button onclick="loadCVForCand('${c.id}',true)" style="background:none;border:1.5px solid var(--border);cursor:pointer;color:var(--ink3);font-size:11px;font-weight:600;padding:3px 8px;border-radius:100px;margin-right:3px" title="PDF">⬇ PDF</button>` : ''}
        <button onclick="openSplitView('${c.id}')" style="background:none;border:none;cursor:pointer;color:var(--ink3);font-size:13px;padding:2px 5px;border-radius:4px" title="Ouvrir">↗</button>
        <button onclick="delCand('${c.id}')" style="background:none;border:1.5px solid #fecaca;cursor:pointer;color:#dc2626;font-size:12px;font-weight:700;padding:2px 7px;border-radius:100px;margin-left:3px;line-height:1" title="Supprimer">🗑</button>
      </td>
    </tr>`;
  };

  let recentHtml;
  if (filtered.length) {
    recentHtml = `<table class="tbl">
      <thead><tr><th>Poste · Entreprise</th><th>Source</th><th>Date</th><th>Statut</th><th></th></tr></thead>
      <tbody>${filtered.map(renderRow).join('')}</tbody>
    </table>`;
  } else {
    recentHtml = `<div class="empty" style="padding:24px"><div class="empty-ic">◫</div><div class="empty-t">${cands.length ? 'Aucune candidature pour ce filtre' : 'Aucune candidature'}</div></div>`;
  }

  // ── Chips statut ──
  const filterChips = ['Tous', ...STATS].map(f => {
    const active = f === _dashFilter;
    const [col] = STAT_COLORS[f] || ['var(--ink3)'];
    const count = f === 'Tous' ? cands.length : cands.filter(c => c.status === f).length;
    return `<span onclick="setDashFilter('${f}')" title="${f}" style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:100px;font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap;
      ${active ? `background:${col==='var(--ink3)'?'#374151':col};color:white;border:1.5px solid transparent;` : `background:transparent;color:var(--ink3);border:1.5px solid var(--border);`}"
    >${f}${count ? ` <span style="font-size:10px;opacity:.8">${count}</span>` : ''}</span>`;
  }).join('');

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
    <!-- Stat cards candidatures -->
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">${statCards}</div>

    <!-- Titre + filtres -->
    <div style="margin-bottom:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="font-size:14px;font-weight:700;color:var(--ink)">Candidatures</div>
        ${dateSortBtn}
      </div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px">${filterChips}</div>
      <div style="display:flex;gap:5px;flex-wrap:wrap">${sourceChips}</div>
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
