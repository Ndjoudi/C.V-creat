// ── PROFILE FORM ───────────────────────────────────────────
const FIELD_MAP = {
  fn:'firstName', ln:'lastName', email:'email', phone:'phone',
  loc:'location', linkedin:'linkedin', title:'title',
  yexp:'yearsExp', mobility:'mobility', summaryTarget:'summaryTarget',
  permis:'permis', disponibilite:'disponibilite', contratRecherche:'contratRecherche',
  domainesProfile:'domainesProfile', hobbies:'hobbies'
};

// Supprime les balises HTML résiduelles (phase rich-editor)
function _cleanField(v) {
  return (v || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function loadProfileToForm() {
  Object.entries(FIELD_MAP).forEach(([k, v]) => {
    const el = document.getElementById('p-' + k);
    if (!el) return;
    // Pour summaryTarget : nettoyer l'HTML éventuel (legacy rich-editor)
    el.value = (v === 'summaryTarget') ? _cleanField(P[v]) : (P[v] || '');
  });
  renderFormationDisplay();
  renderPhotoPreview();
}

// ── FORMATION DISPLAY (read-only from education[0]) ────────
function renderFormationDisplay() {
  const el = document.getElementById('p-formation-display');
  if (!el) return;
  const edu = P.education && P.education[0];
  if (edu && edu.degree) {
    let txt = edu.degree;
    if (edu.school) txt += ' · ' + edu.school;
    if (edu.year) {
      const endYear = edu.year.trim().split(/\s*[-–—]\s*/).pop();
      txt += ' (' + endYear + ')';
    }
    el.textContent = txt;
    el.style.color = 'var(--ink)';
  } else {
    el.textContent = '— ajoute une formation dans l\'onglet Formation';
    el.style.color = 'var(--ink3)';
  }
}

function saveProfile() {
  Object.entries(FIELD_MAP).forEach(([k, v]) => {
    const el = document.getElementById('p-' + k);
    if (el) P[v] = el.value.trim();
  });
  ss('sc_profile', P);
  updateSBProfile();
  refreshDash();
}

function updateSBProfile() {
  const info = document.getElementById('sb-profile-info');
  if (P.firstName && P.lastName) {
    info.classList.remove('hidden');
    document.getElementById('sb-pname').textContent = P.firstName + ' ' + P.lastName;
    document.getElementById('sb-prole').textContent = P.title || 'Supply Chain';
  } else {
    info.classList.add('hidden');
  }
}

// ── CHIPS ──────────────────────────────────────────────────
function renderChips() {
  renderChipGroup('chips-subs',   SUBS,         'subdomains');
  renderChipGroup('chips-tools',  TOOLS,        'tools');
  renderChipGroup('chips-certs',  CERTS,        'certifs');
  renderChipGroup('chips-sects',  SECTS,        'sectors');
  renderChipGroup('chips-info',   INFORMATIQUE, 'informatique');
  renderChipGroup('chips-custom', [],           'customSkills');
  updateSBProfile();
}

function renderChipGroup(elId, opts, key) {
  const el = document.getElementById(elId);
  if (!el) return;
  const selected   = (P[key] || []).filter(Boolean);
  const unselected = opts.filter(x => !selected.includes(x));

  // Chips sélectionnées (en haut, colorées, avec ×)
  let html = selected.map(o =>
    `<span class="chip sel" style="padding-right:6px">${esc(o)}<span class="chip-x" style="display:inline-block;margin-left:5px;opacity:.5;cursor:pointer;font-size:11px;font-weight:700;line-height:1;vertical-align:1px" title="Supprimer">×</span></span>`
  ).join('');

  // Séparateur entre sélectionnées et non sélectionnées
  if (selected.length && unselected.length) {
    html += `<span style="display:block;width:100%;border-top:1px solid var(--border);margin:8px 0 5px"></span>`;
  }

  // Chips non sélectionnées (cliquables pour ajouter)
  html += unselected.map(o =>
    `<span class="chip" onclick="toggleChip('${key}','${o.replace(/'/g,"\\'")}',this)">${esc(o)}</span>`
  ).join('');

  if (!selected.length && !unselected.length) {
    html = `<span style="font-size:12px;color:var(--ink3)">Aucun élément — clique sur "+ Ajouter" pour en créer.</span>`;
  }

  el.innerHTML = html;

  // Gestionnaires de suppression via JS (évite les problèmes d'échappement)
  el.querySelectorAll('.chip-x').forEach((btn, i) => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      P[key].splice(i, 1);
      ss('sc_profile', P);
      renderChips();
    });
  });
}

function toggleChip(key, val) {
  if (!P[key]) P[key] = [];
  if (P[key].includes(val)) P[key] = P[key].filter(x => x !== val);
  else P[key].push(val);
  ss('sc_profile', P);
  renderChips();
}

// ── AJOUTER / SUPPRIMER des éléments libres ────────────────
function showAddChip(section) {
  const form = document.getElementById('add-chip-' + section);
  if (!form) return;
  form.classList.remove('hidden');
  setTimeout(() => { const inp = document.getElementById('add-chip-' + section + '-inp'); if (inp) inp.focus(); }, 40);
}

function hideAddChip(section) {
  const form = document.getElementById('add-chip-' + section);
  if (form) form.classList.add('hidden');
  const inp = document.getElementById('add-chip-' + section + '-inp');
  if (inp) inp.value = '';
}

function saveAddChip(key, section) {
  const inp = document.getElementById('add-chip-' + section + '-inp');
  const val = inp ? inp.value.trim() : '';
  if (!val) return;
  if (!P[key]) P[key] = [];
  if (!P[key].includes(val)) P[key].push(val);
  ss('sc_profile', P);
  hideAddChip(section);
  renderChips();
}

// ── EXPERIENCES ────────────────────────────────────────────
const CONTRACT_TYPES = ['CDI','CDD','Stage','Alternance','Bénévolat','Freelance','Intérim','Autre'];
const CONTRACT_COLORS = {
  'CDI':        ['#16A34A','#F0FDF4','#BBF7D0'],
  'CDD':        ['#D97706','#FFFBEB','#FDE68A'],
  'Stage':      ['#7C3AED','#F5F3FF','#DDD6FE'],
  'Alternance': ['#2563EB','#EFF6FF','#BFDBFE'],
  'Bénévolat':  ['#0891B2','#ECFEFF','#A5F3FC'],
  'Freelance':  ['#DC2626','#FEF2F2','#FECACA'],
  'Intérim':    ['#9333EA','#FAF5FF','#E9D5FF'],
};

function renderExpList() {
  const el = document.getElementById('exp-list');
  if (!P.experiences.length) { el.innerHTML = ''; return; }
  el.innerHTML = P.experiences.map((e, i) => {
    const ct = e.contractType || '';
    const [cc, cb, cborder] = CONTRACT_COLORS[ct] || ['var(--ink3)','var(--bg)','var(--border)'];
    const opts = CONTRACT_TYPES.map(t => '<option' + (ct === t ? ' selected' : '') + '>' + t + '</option>').join('');
    const bullets = e.bullets || [];
    const bulletsHtml = bullets.length
      ? bullets.map(b =>
          '<div class="bullet-item" id="bi-' + b.id + '">' +
            '<button class="bullet-req-btn ' + (b.required ? 'is-req' : '') + '" onclick="toggleRequired(\'' + e.id + '\',\'' + b.id + '\')" title="' + (b.required ? 'Toujours affiché' : 'Affiché si sélectionné') + '">' +
              (b.required ? '★' : '○') +
            '</button>' +
            '<span class="bullet-item-text" id="bt-' + b.id + '" contenteditable="true" onblur="updBulletText(\'' + e.id + '\',\'' + b.id + '\',this.textContent)">' + esc(b.text) + '</span>' +
            '<button onclick="delBullet(\'' + e.id + '\',\'' + b.id + '\')" class="bullet-del-btn">×</button>' +
          '</div>'
        ).join('')
      : '<div style="font-size:12.5px;color:var(--ink3);padding:10px 0;text-align:center">Aucune réalisation — génère avec l\'IA ou ajoute manuellement</div>';

    return '<div class="ecard" id="ecard-' + e.id + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
          '<div style="font-size:13.5px;font-weight:700;color:var(--ink)">Expérience ' + (i+1) + '</div>' +
          (ct ? '<span class="contract-badge" style="color:' + cc + ';background:' + cb + ';border-color:' + cborder + '">' + esc(ct) + '</span>' : '') +
        '</div>' +
        '<button class="btn-del" onclick="delExp(\'' + e.id + '\')">Supprimer</button>' +
      '</div>' +
      '<div class="g2">' +
        '<div class="fg"><label class="lb">Type de contrat</label>' +
          '<select class="inp" oninput="updExp(\'' + e.id + '\',\'contractType\',this.value)">' +
            '<option value="">Sélectionner...</option>' + opts +
          '</select></div>' +
        '<div class="fg"><label class="lb">Dates</label>' +
          '<input class="inp" value="' + esc(e.duration) + '" placeholder="Jan 2020 – Déc 2022" oninput="updExp(\'' + e.id + '\',\'duration\',this.value)"/></div>' +
      '</div>' +
      '<div class="g2">' +
        '<div class="fg"><label class="lb">Fonction</label>' +
          '<input class="inp" value="' + esc(e.title) + '" placeholder="Responsable Logistique" oninput="updExp(\'' + e.id + '\',\'title\',this.value)"/></div>' +
        '<div class="fg"><label class="lb">Entreprise</label>' +
          '<input class="inp" value="' + esc(e.company) + '" placeholder="Carrefour" oninput="updExp(\'' + e.id + '\',\'company\',this.value)"/></div>' +
      '</div>' +
      '<div class="g2">' +
        '<div class="fg"><label class="lb">Secteur d\'activité</label>' +
          '<input class="inp" value="' + esc(e.sector||'') + '" placeholder="Ex: Retail, Industrie, Pharma..." oninput="updExp(\'' + e.id + '\',\'sector\',this.value)"/></div>' +
        '<div class="fg"><label class="lb">Localisation</label>' +
          '<input class="inp" value="' + esc(e.location||'') + '" placeholder="Paris" oninput="updExp(\'' + e.id + '\',\'location\',this.value)"/></div>' +
      '</div>' +
      '<div class="fg" style="margin-bottom:14px"><label class="lb">Rattaché(e) à</label>' +
        '<input class="inp" value="' + esc(e.reportingTo||'') + '" placeholder="Ex : Directeur des Opérations, DAF, PDG..." oninput="updExp(\'' + e.id + '\',\'reportingTo\',this.value)"/></div>' +
      '<!-- Réalisations & Résultats (BULLET BANK) -->' +
      '<div class="exp-section">' +
        '<div class="exp-section-hd">' +
          '<div>' +
            '<div class="exp-section-label">Réalisations &amp; Résultats</div>' +
            '<div class="exp-section-sub">Ces bullets apparaissent sur le CV · ★ = toujours affiché · ○ = affiché si sélectionné</div>' +
          '</div>' +
          '<button id="gen-bullets-' + e.id + '" class="btn-ai" onclick="reformulateBulletsForExp(\'' + e.id + '\')">' +
            '<i data-lucide="wand-sparkles" style="width:13px;height:13px;vertical-align:-2px;margin-right:4px"></i>Reformuler' +
          '</button>' +
        '</div>' +
        '<div id="bullets-list-' + e.id + '">' +
          bulletsHtml +
        '</div>' +
        '<div style="margin-top:8px">' +
          '<div style="display:flex;gap:8px">' +
            '<input class="inp" id="bullet-inp-' + e.id + '" placeholder="Optimisé les niveaux de stock de 450 réf, réduisant les ruptures de 30%" style="flex:1;font-size:12.5px;padding:8px 11px"/>' +
            '<button class="btn btn-g" style="font-size:12px;padding:8px 14px;white-space:nowrap" onclick="addBulletManual(\'' + e.id + '\')">+ Ajouter</button>' +
          '</div>' +
          '<div style="font-size:10.5px;color:var(--ink3);margin-top:5px">Formule APR : Verbe d\'action fort · Action concrète · Résultat chiffré</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function addExp() {
  P.experiences.push({
    id: Date.now().toString(),
    contractType: '', title: '', company: '',
    duration: '', sector: '', location: '',
    description: '', souvenirs: '', fichemetier: '', bullets: []
  });
  ss('sc_profile', P);
  renderExpList();
}
function delExp(id) { P.experiences = P.experiences.filter(e => e.id !== id); ss('sc_profile', P); renderExpList(); }
function updExp(id, key, val) { const e = P.experiences.find(x => x.id === id); if (e) { e[key] = val; ss('sc_profile', P); } }

// ── BULLETS ────────────────────────────────────────────────

function addBulletManual(expId) {
  const inp = document.getElementById('bullet-inp-' + expId);
  const text = (inp?.value || '').trim();
  if (!text) { toast('Écris une réalisation avant d\'ajouter'); return; }
  const exp = P.experiences.find(e => e.id === expId);
  if (!exp) return;
  if (!exp.bullets) exp.bullets = [];
  exp.bullets.push({ id: Date.now().toString(), text, required: false, selected: false });
  ss('sc_profile', P);
  if (inp) inp.value = '';
  renderExpList();
  toast('Bullet ajouté');
}

function delBullet(expId, bId) {
  const exp = P.experiences.find(e => e.id === expId);
  if (!exp) return;
  exp.bullets = (exp.bullets || []).filter(b => b.id !== bId);
  ss('sc_profile', P);
  renderExpList();
}

function updBulletText(expId, bId, text) {
  const exp = P.experiences.find(e => e.id === expId);
  const b = (exp?.bullets || []).find(b => b.id === bId);
  if (b) { b.text = text.trim(); ss('sc_profile', P); }
}

function toggleRequired(expId, bId) {
  const exp = P.experiences.find(e => e.id === expId);
  const b = (exp?.bullets || []).find(b => b.id === bId);
  if (!b) return;
  b.required = !b.required;
  ss('sc_profile', P);
  const btn = document.querySelector('#bi-' + bId + ' .bullet-req-btn');
  if (btn) {
    btn.classList.toggle('is-req', b.required);
    btn.textContent = b.required ? '★' : '○';
    btn.title = b.required ? 'Toujours affiché' : 'Affiché si sélectionné';
  }
}

let _reformulateExpId = null;

async function reformulateBulletsWithProvider(forceProvider) {
  if (_reformulateExpId) await reformulateBulletsForExp(_reformulateExpId, forceProvider);
}

async function reformulateBulletsForExp(expId, forceProvider) {
  _reformulateExpId = expId;
  const exp = P.experiences.find(e => e.id === expId);
  if (!exp) return;

  const existingBullets = (exp.bullets || []).map(b => b.text || b).filter(Boolean);
  if (!existingBullets.length) {
    toast('Ajoute d\'abord des bullets à reformuler');
    return;
  }

  const btn = document.getElementById('gen-bullets-' + expId);
  if (btn) { btn.disabled = true; btn.textContent = 'Reformulation...'; }

  const bulletsList = existingBullets.map((b, i) => `${i + 1}. ${b}`).join('\n');

  const prompt = `Tu es expert RH spécialisé CV supply chain. Reformule chaque bullet point pour le rendre plus percutant, en appliquant strictement la formule APR.

BULLETS ACTUELS:
${bulletsList}

RÈGLES:
- Commence par un verbe fort au passé composé (Optimisé, Piloté, Réduit, Négocié, Déployé, Coordonné, Mis en place, Structuré...)
- Action concrète et précise (garde le même sens, amplifie l'impact)
- Résultat chiffré si possible (%, nombre, délai) — invente RIEN, garde les chiffres existants
- 10-15 mots maximum
- INTERDIT : "Responsable de", "En charge de", "Participation à", "Gestion de"
- Garde le même nombre de bullets

Réponds UNIQUEMENT en JSON: {"bullets":["reformulation 1","reformulation 2",...]}`;

  // Affiche spinner dans la popup si déjà ouverte (relance via bouton IA)
  const listEl = document.getElementById('bullet-picker-list');
  const overlay = document.getElementById('bullet-picker-overlay');
  if (!overlay.classList.contains('hidden') && listEl) {
    listEl.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:24px;color:var(--ink3);font-size:13px"><span class="sp" style="width:14px;height:14px;flex-shrink:0"></span>Reformulation en cours…</div>`;
  }

  try {
    let raw;
    if (forceProvider === 'gemini') {
      raw = await callGemini(prompt, { maxTokens: 600, temperature: 0.4 });
    } else {
      raw = await callGroq(prompt, { maxTokens: 600, temperature: 0.4 });
    }
    const data = safeParseJSON(raw);
    const reformulated = data.bullets || [];
    if (!reformulated.length) { toast('Aucune reformulation générée'); return; }
    showReformulationPicker(expId, existingBullets, reformulated);
  } catch(err) {
    toast('Erreur lors de la reformulation');
    if (listEl) listEl.innerHTML = `<div style="color:var(--red);padding:20px;font-size:13px">⚠ ${err.message}</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="wand-sparkles" style="width:13px;height:13px;vertical-align:-2px;margin-right:4px"></i>Reformuler'; if(typeof lucide!=='undefined')lucide.createIcons(); }
  }
}

function showReformulationPicker(expId, originals, reformulated) {
  const overlay = document.getElementById('bullet-picker-overlay');
  const exp = P.experiences.find(e => e.id === expId);
  document.getElementById('bullet-picker-title').textContent = (exp?.title || 'Expérience') + ' — Choisir la version à garder';
  const aibtns = document.getElementById('bullet-picker-ai-btns');
  if (aibtns) aibtns.style.display = 'flex';
  const subEl = document.getElementById('bullet-picker-sub');
  if (subEl) subEl.textContent = 'Choisir la version à garder pour chaque bullet';

  const pairs = originals.map((orig, i) => {
    const newV = reformulated[i] || orig;
    const same = orig.trim() === newV.trim();
    return `<div style="border:1.5px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:10px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0">
        <label style="display:flex;gap:10px;align-items:flex-start;padding:11px 13px;cursor:pointer;border-right:1px solid var(--border);background:${same?'var(--bg)':''}">
          <input type="radio" name="ref-${i}" value="orig" checked style="margin-top:3px;accent-color:#374151;flex-shrink:0"/>
          <div>
            <div style="font-size:9.5px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">Actuel</div>
            <div style="font-size:12.5px;color:var(--ink);line-height:1.55">${esc(orig)}</div>
          </div>
        </label>
        <label style="display:flex;gap:10px;align-items:flex-start;padding:11px 13px;cursor:pointer;background:${same?'var(--bg)':'#f0fdf4'}">
          <input type="radio" name="ref-${i}" value="new" style="margin-top:3px;accent-color:#16a34a;flex-shrink:0"${same?' disabled':''}/>
          <div>
            <div style="font-size:9.5px;font-weight:700;color:${same?'var(--ink3)':'#16a34a'};text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">${same?'Identique':'Reformulé ✦'}</div>
            <div style="font-size:12.5px;color:var(--ink);line-height:1.55">${esc(newV)}</div>
          </div>
        </label>
      </div>
    </div>`;
  }).join('');

  document.getElementById('bullet-picker-list').innerHTML = pairs;
  overlay.dataset.expId = expId;
  overlay.dataset.mode  = 'reformulate';
  overlay.dataset.originals    = JSON.stringify(originals);
  overlay.dataset.reformulated = JSON.stringify(reformulated);
  overlay.classList.remove('hidden');
}

function showBulletPicker(expId, bullets) {
  if (!bullets.length) { toast('Aucun bullet généré'); return; }
  const overlay = document.getElementById('bullet-picker-overlay');
  const exp = P.experiences.find(e => e.id === expId);
  document.getElementById('bullet-picker-title').textContent = (exp?.title || 'Expérience') + ' — Sélectionne les bullets à garder';
  const aibtns = document.getElementById('bullet-picker-ai-btns');
  if (aibtns) aibtns.style.display = 'none';
  const subEl = document.getElementById('bullet-picker-sub');
  if (subEl) subEl.textContent = 'Décoche les bullets non pertinents — les autres seront ajoutés à ta base';
  document.getElementById('bullet-picker-list').innerHTML = bullets.map((b, i) =>
    `<label class="bullet-picker-item">
      <input type="checkbox" id="bpck-${i}" checked style="flex-shrink:0;margin-top:3px;accent-color:#000;width:15px;height:15px"/>
      <span style="font-size:13px;color:var(--ink);line-height:1.55">${esc(b)}</span>
    </label>`
  ).join('');
  overlay.dataset.expId  = expId;
  overlay.dataset.bullets = JSON.stringify(bullets);
  overlay.classList.remove('hidden');
}

function confirmBulletPicker() {
  const overlay = document.getElementById('bullet-picker-overlay');
  const expId   = overlay.dataset.expId;
  const exp     = P.experiences.find(e => e.id === expId);
  if (!exp) return;

  if (overlay.dataset.mode === 'reformulate') {
    // Mode reformulation : remplace chaque bullet par la version choisie
    const originals    = JSON.parse(overlay.dataset.originals    || '[]');
    const reformulated = JSON.parse(overlay.dataset.reformulated || '[]');
    let changed = 0;
    originals.forEach((orig, i) => {
      const radio = document.querySelector(`input[name="ref-${i}"]:checked`);
      if (radio?.value === 'new' && reformulated[i]) {
        const bullet = exp.bullets.find(b => (b.text || b) === orig);
        if (bullet) { bullet.text = reformulated[i]; changed++; }
      }
    });
    ss('sc_profile', P);
    overlay.classList.add('hidden');
    delete overlay.dataset.mode;
    renderExpList();
    toast(changed + ' bullet' + (changed !== 1 ? 's' : '') + ' remplacé' + (changed !== 1 ? 's' : ''));
  } else {
    // Mode ajout classique
    const bullets = JSON.parse(overlay.dataset.bullets || '[]');
    if (!exp.bullets) exp.bullets = [];
    let added = 0;
    bullets.forEach((b, i) => {
      const cb = document.getElementById('bpck-' + i);
      if (cb?.checked) { exp.bullets.push({ id: Date.now().toString() + i, text: b, required: false, selected: false }); added++; }
    });
    ss('sc_profile', P);
    overlay.classList.add('hidden');
    renderExpList();
    toast(added + ' bullet' + (added > 1 ? 's' : '') + ' ajouté' + (added > 1 ? 's' : ''));
  }
}

function closeBulletPicker() { document.getElementById('bullet-picker-overlay').classList.add('hidden'); }

// ── EDUCATION ──────────────────────────────────────────────
function renderEduList() {
  const el = document.getElementById('edu-list');
  if (!P.education.length) {
    el.innerHTML = `<div class="empty" style="padding:30px"><div class="empty-ic"><i data-lucide="graduation-cap" style="width:32px;height:32px;color:var(--ink3)"></i></div><div class="empty-t">Aucune formation</div><div class="empty-s">Ajoute tes diplômes et formations</div></div>`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }
  el.innerHTML = P.education.map((e, i) => `
    <div class="ecard">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div style="font-size:14px;font-weight:700;color:var(--ink)">Formation ${i + 1}</div>
        <button class="btn-del" onclick="delEdu('${e.id}')">Supprimer</button>
      </div>
      <div class="g2">
        <div class="fg"><label class="lb">Diplôme / Formation</label><input class="inp" value="${esc(e.degree)}" placeholder="Master Supply Chain Management" oninput="updEdu('${e.id}','degree',this.value)"/></div>
        <div class="fg"><label class="lb">École / Université</label><input class="inp" value="${esc(e.school)}" placeholder="IAE Paris" oninput="updEdu('${e.id}','school',this.value)"/></div>
        <div class="fg"><label class="lb">Année(s)</label><input class="inp" value="${esc(e.year)}" placeholder="2018 – 2020" oninput="updEdu('${e.id}','year',this.value)"/></div>
        <div class="fg"><label class="lb">Mention</label><input class="inp" value="${esc(e.mention||'')}" placeholder="Mention Bien" oninput="updEdu('${e.id}','mention',this.value)"/></div>
      </div>
    </div>`).join('');
}

function addEdu() { P.education.push({ id: Date.now().toString(), degree: '', school: '', year: '', mention: '' }); ss('sc_profile', P); renderEduList(); renderFormationDisplay(); }
function delEdu(id) { P.education = P.education.filter(e => e.id !== id); ss('sc_profile', P); renderEduList(); renderFormationDisplay(); }
function updEdu(id, key, val) { const e = P.education.find(x => x.id === id); if (e) { e[key] = val; ss('sc_profile', P); renderFormationDisplay(); } }

// ── LANGUAGES ──────────────────────────────────────────────
const LANG_LEVELS = ['Notions','Intermédiaire','Courant','Bilingue','Langue maternelle'];

function renderLangList() {
  const el = document.getElementById('lang-list');
  if (!P.languages.length) {
    el.innerHTML = '<div style="font-size:13.5px;color:var(--ink3);margin-bottom:12px">Aucune langue ajoutée.</div>';
    return;
  }
  el.innerHTML = P.languages.map(l => `
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;padding:12px;background:var(--bg);border-radius:var(--radius-sm);border:1px solid var(--border)">
      <input class="inp" value="${esc(l.name)}" placeholder="Anglais" style="flex:1" oninput="updLang('${l.id}','name',this.value)"/>
      <select class="inp" style="flex:1" onchange="updLang('${l.id}','level',this.value)">
        ${LANG_LEVELS.map(lv => `<option${lv === l.level ? ' selected' : ''}>${lv}</option>`).join('')}
      </select>
      <button class="btn-del" onclick="delLang('${l.id}')">×</button>
    </div>`).join('');
}

function addLang() { P.languages.push({ id: Date.now().toString(), name: '', level: 'Courant' }); ss('sc_profile', P); renderLangList(); }
function delLang(id) { P.languages = P.languages.filter(l => l.id !== id); ss('sc_profile', P); renderLangList(); }
function updLang(id, key, val) { const l = P.languages.find(x => x.id === id); if (l) { l[key] = val; ss('sc_profile', P); } }

// ── PHOTO ──────────────────────────────────────────────────
function handlePhotoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('Sélectionne une image (JPG, PNG...)'); return; }
  if (file.size > 3 * 1024 * 1024) { toast('Photo trop lourde — max 3 Mo'); return; }
  const reader = new FileReader();
  reader.onload = ev => {
    P.photo = ev.target.result;
    ss('sc_profile', P);
    renderPhotoPreview();
    toast('Photo enregistrée');
  };
  reader.readAsDataURL(file);
}

function removePhoto() {
  P.photo = '';
  ss('sc_profile', P);
  renderPhotoPreview();
  toast('Photo supprimée');
}

function renderPhotoPreview() {
  const img       = document.getElementById('photo-preview');
  const ph        = document.getElementById('photo-placeholder');
  const removeBtn = document.getElementById('photo-remove-btn');
  if (!img) return;
  if (P.photo) {
    img.src = P.photo;
    img.classList.remove('hidden');
    if (ph) ph.classList.add('hidden');
    if (removeBtn) removeBtn.classList.remove('hidden');
  } else {
    img.classList.add('hidden');
    if (ph) ph.classList.remove('hidden');
    if (removeBtn) removeBtn.classList.add('hidden');
  }
}
