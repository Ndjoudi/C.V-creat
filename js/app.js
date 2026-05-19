// ── CONSTANTS ─────────────────────────────────────────────
const SUBS  = ['Logistique / Entrepôt','Transport','Planification / S&OP','Approvisionnement','Achats / Sourcing','Industriel / Lean','Import / Export','Customer Service SC'];
const TOOLS = ['SAP MM','SAP WM/EWM','SAP APO/IBP','Oracle SCM','WMS','TMS','Excel avancé','Power BI','Tableau','Dynamics 365','AS400','EDI','Kinaxis','Blue Yonder','SAGE','Cegid','Generix','Reflex WMS','Manhattan WMS','Infor M3','Excel TCD'];
const CERTS = ['APICS CPIM','APICS CSCP','Six Sigma Green Belt','Six Sigma Black Belt','Lean Manufacturing','CILT','PMP','Prince2','Agile/Scrum','CIPS','ISO 9001','ISO 14001','Lean Six Sigma'];
const SECTS = ['Industrie','Retail / Distribution','Agroalimentaire','Pharmacie','Automobile','Luxe / Mode','Aéronautique','Grande consommation','E-commerce','BTP','Energie','Cosmétique','Santé / Médical'];
const INFORMATIQUE = ['Microsoft Word','Claude Code','PowerPoint','Outlook','Teams','Antigravity','Google Sheets','Google Slides','Canva','Notion','Trello','Slack','Zoom','SharePoint','OneDrive','Adobe Acrobat','Salesforce','HubSpot','WordPress','ChatGPT / IA générative'];
const STATS = ['Analysé','Envoyé','Message in','Entretien','Refusé'];
const STAT_COLORS = {
  'Analysé':    ['#6366F1','#EEF2FF','#C7D2FE'],
  'Envoyé':     ['#3B82F6','#EFF6FF','#BFDBFE'],
  'Message in': ['#D97706','#FFFBEB','#FDE68A'],
  'Entretien':  ['var(--teal)','var(--teal-bg)','var(--teal-border)'],
  'Refusé':     ['#DC2626','var(--red-bg)','var(--red-border)']
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

  // ── Tableau des candidatures récentes (5 dernières) ──
  const recent = [...cands].reverse().slice(0, 5);
  let recentHtml;
  if (recent.length) {
    recentHtml = `<table class="tbl">
      <thead><tr>
        <th>Poste · Entreprise</th><th>Score</th><th>Date</th><th>Statut</th><th></th>
      </tr></thead>
      <tbody>${recent.map(c => {
        const [col, bg, border] = STAT_COLORS[c.status] || ['var(--ink3)', 'var(--bg)', 'var(--border)'];
        const sc = c.score;
        let scoreBadge = '<span style="opacity:.35;font-size:12px">—</span>';
        if (sc !== null && sc !== undefined) {
          const sc_col = sc >= 70 ? 'var(--teal)'    : sc >= 50 ? '#D97706'        : 'var(--red)';
          const sc_bg  = sc >= 70 ? 'var(--teal-bg)' : sc >= 50 ? '#FFFBEB'        : 'var(--red-bg)';
          const sc_bd  = sc >= 70 ? 'var(--teal-border)' : sc >= 50 ? '#FDE68A'   : 'var(--red-border)';
          const hasA   = !!c.analysis;
          scoreBadge = `<span style="display:inline-block;padding:3px 10px;border-radius:100px;font-size:12px;font-weight:700;color:${sc_col};background:${sc_bg};border:1.5px solid ${sc_bd};${hasA ? 'cursor:pointer' : ''}" ${hasA ? `onclick="openAnalysisModal('${c.id}')" title="Voir l'analyse"` : ''}>${sc}%${hasA ? ' ↗' : ''}</span>`;
        }
        return `<tr>
          <td>
            <div style="font-weight:700;color:var(--ink);font-size:13px;cursor:pointer;text-decoration:underline;text-decoration-color:var(--border);text-underline-offset:3px" onclick="openSplitView('${c.id}')" title="Voir offre + CV">${esc(c.poste)}</div>
            <div style="color:var(--ink3);font-size:12px;margin-top:1px">${esc(c.company)}</div>
          </td>
          <td>${scoreBadge}</td>
          <td style="color:var(--ink3);font-size:12.5px">${c.date || ''}</td>
          <td><select style="background:${bg};border:1.5px solid ${border};border-radius:100px;color:${col};font-size:12px;font-weight:700;padding:3px 9px;cursor:pointer;outline:none" onchange="updCand('${c.id}','status',this.value);refreshDash()">${STATS.map(s=>`<option${s===c.status?' selected':''}>${s}</option>`).join('')}</select></td>
          <td style="white-space:nowrap">
            ${c.analysis ? `<button onclick="loadCVForCand('${c.id}')" style="background:none;border:1.5px solid var(--teal-border);cursor:pointer;color:var(--teal-d);font-size:11px;font-weight:700;padding:3px 8px;border-radius:100px;margin-right:3px" title="CV adapté">CV</button><button onclick="loadCVForCand('${c.id}',true)" style="background:none;border:1.5px solid var(--border);cursor:pointer;color:var(--ink3);font-size:11px;font-weight:600;padding:3px 8px;border-radius:100px;margin-right:3px" title="PDF">⬇ PDF</button>` : ''}
            <button onclick="goTo('tracker')" style="background:none;border:none;cursor:pointer;color:var(--ink3);font-size:13px;padding:2px 5px;border-radius:4px" title="Voir dans Candidatures">→</button>
            <button onclick="delCand('${c.id}')" style="background:none;border:1.5px solid #fecaca;cursor:pointer;color:#dc2626;font-size:12px;font-weight:700;padding:2px 7px;border-radius:100px;margin-left:3px;line-height:1" title="Supprimer">🗑</button>
          </td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  } else {
    recentHtml = `<div class="empty" style="padding:30px"><div class="empty-ic">◫</div><div class="empty-t">Aucune candidature</div><div class="empty-s">Ajoute ta première depuis l'onglet Candidatures</div></div>`;
  }

  dashEl.innerHTML = `
    <!-- Profil compact -->
    <div class="card" style="margin-bottom:12px;padding:12px 16px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div style="flex:1;min-width:180px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div style="font-size:12px;font-weight:700;color:var(--ink)">Complétion du profil</div>
          <div style="font-size:12px;font-weight:800;color:var(--teal)">${pct}%</div>
        </div>
        <div class="prog" style="height:5px"><div class="prog-f" style="width:${pct}%"></div></div>
        <div style="margin-top:6px;font-size:11.5px;color:var(--ink3)">${pct < 100
          ? `<span style="color:var(--teal);cursor:pointer;font-weight:600" onclick="goTo('profile')">Compléter → </span>pour de meilleurs résultats IA`
          : '✓ Profil complet — l\'IA est prête'}</div>
      </div>
      <button class="btn btn-g" onclick="goTo('cv')" style="font-size:12px;padding:6px 14px;flex-shrink:0"><i data-lucide="file-text" style="width:12px;height:12px;vertical-align:-2px;margin-right:4px"></i>Mon CV</button>
    </div>

    <!-- Stat cards candidatures -->
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">${statCards}</div>

    <!-- Titre section + lien tout voir -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div style="font-size:14px;font-weight:700;color:var(--ink)">Candidatures récentes</div>
      ${cands.length > 5 ? `<span style="font-size:12.5px;color:var(--teal-d);cursor:pointer;font-weight:600" onclick="goTo('tracker')">Voir tout (${cands.length}) →</span>` : ''}
    </div>
    <div style="margin-bottom:20px">${recentHtml}</div>

    <!-- Actions rapides -->
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <div class="card ac" onclick="goTo('interview')" style="flex:1;min-width:150px;padding:14px 16px">
        <div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:4px;display:flex;align-items:center;gap:7px">
          <i data-lucide="mic" style="width:14px;height:14px;color:var(--teal);flex-shrink:0"></i>Simulation entretien
        </div>
        <div style="font-size:12px;color:var(--ink3);line-height:1.5">Questions sur mesure par IA</div>
      </div>
      <div class="card ac" onclick="goTo('history')" style="flex:1;min-width:150px;padding:14px 16px">
        <div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:4px;display:flex;align-items:center;gap:7px">
          <i data-lucide="history" style="width:14px;height:14px;color:var(--teal);flex-shrink:0"></i>Mes analyses
        </div>
        <div style="font-size:12px;color:var(--ink3);line-height:1.5">Historique des offres analysées</div>
      </div>
      <div class="card ac" onclick="goTo('profile')" style="flex:1;min-width:150px;padding:14px 16px">
        <div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:4px;display:flex;align-items:center;gap:7px">
          <i data-lucide="user-round" style="width:14px;height:14px;color:var(--teal);flex-shrink:0"></i>Mon profil
        </div>
        <div style="font-size:12px;color:var(--ink3);line-height:1.5">${P.tools.length} outils · ${P.experiences.length} expériences</div>
      </div>
    </div>`;

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
