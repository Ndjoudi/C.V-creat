// ── PROFILE FORM ───────────────────────────────────────────
const FIELD_MAP = {
  fn:'firstName', ln:'lastName', email:'email', phone:'phone',
  loc:'location', linkedin:'linkedin', title:'title',
  yexp:'yearsExp', mobility:'mobility', summary:'summary',
  permis:'permis', disponibilite:'disponibilite', hobbies:'hobbies'
};

function loadProfileToForm() {
  Object.entries(FIELD_MAP).forEach(([k, v]) => {
    const el = document.getElementById('p-' + k);
    if (el) el.value = P[v] || '';
  });
  initWordCounter();
  renderPhotoPreview();
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

// ── WORD COUNTER (summary) ─────────────────────────────────
function initWordCounter() {
  const ta = document.getElementById('p-summary');
  const counter = document.getElementById('summary-counter');
  if (!ta || !counter) return;
  function update() {
    const words = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
    counter.textContent = words + ' / 80 mots';
    counter.className = 'word-counter' + (words > 80 ? ' over' : words > 65 ? ' warn' : '');
  }
  ta.addEventListener('input', update);
  update();
}

// ── CHIPS ──────────────────────────────────────────────────
function renderChips() {
  renderChipGroup('chips-subs',  SUBS,  'subdomains');
  renderChipGroup('chips-tools', TOOLS, 'tools');
  renderChipGroup('chips-certs', CERTS, 'certifs');
  renderChipGroup('chips-sects', SECTS, 'sectors');
  renderCustomChips();
  updateSBProfile();
}

function renderChipGroup(elId, opts, key) {
  document.getElementById(elId).innerHTML = opts.map(o =>
    `<span class="chip${P[key].includes(o) ? ' sel' : ''}" onclick="toggleChip('${key}','${o}',this)">${o}</span>`
  ).join('');
}

function toggleChip(key, val, el) {
  if (P[key].includes(val)) P[key] = P[key].filter(x => x !== val);
  else P[key].push(val);
  el.classList.toggle('sel');
  ss('sc_profile', P);
}

function addCustomSkill() {
  document.getElementById('custom-skill-form').classList.toggle('hidden');
  document.getElementById('custom-skill-inp').focus();
}

function saveCustomSkill() {
  const val = document.getElementById('custom-skill-inp').value.trim();
  if (!val) return;
  if (!P.customSkills.includes(val)) P.customSkills.push(val);
  ss('sc_profile', P);
  renderCustomChips();
  document.getElementById('custom-skill-inp').value = '';
  document.getElementById('custom-skill-form').classList.add('hidden');
}

function renderCustomChips() {
  const el = document.getElementById('chips-custom');
  if (!P.customSkills.length) {
    el.innerHTML = '<span style="font-size:12.5px;color:var(--ink3)">Aucune compétence personnalisée</span>';
    return;
  }
  el.innerHTML = P.customSkills.map(s =>
    `<span class="chip sel" style="cursor:default">${s} <span onclick="removeCustomSkill('${esc(s)}')" style="margin-left:4px;opacity:.6;cursor:pointer">×</span></span>`
  ).join('');
}

function removeCustomSkill(val) {
  P.customSkills = P.customSkills.filter(x => x !== val);
  ss('sc_profile', P);
  renderCustomChips();
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
      '<div class="exp-section">' +
        '<div class="exp-section-hd">' +
          '<div><div class="exp-section-label">Fiche de poste</div>' +
          '<div class="exp-section-sub">Périmètre du contrat · missions réelles</div></div>' +
          '<button class="btn-ai" onclick="openModal(\'exp\',\'' + e.id + '\')"><i data-lucide="sparkles" style="width:13px;height:13px;vertical-align:-2px;margin-right:4px"></i>Générer avec l\'IA</button>' +
        '</div>' +
        '<textarea class="inp" rows="3" placeholder="• Périmètre attendu&#10;• Missions réelles effectuées&#10;• Réalisations chiffrées" oninput="updExp(\'' + e.id + '\',\'description\',this.value)">' + esc(e.description) + '</textarea>' +
      '</div>' +
      '<details class="exp-details">' +
        '<summary class="exp-details-summary"><i data-lucide="notebook-pen" style="width:14px;height:14px"></i>Souvenirs de semaine</summary>' +
        '<div style="margin-top:10px">' +
          '<div style="font-size:11.5px;color:var(--ink3);margin-bottom:8px;line-height:1.6;background:var(--bg);border-radius:8px;padding:9px 12px;border:1px solid var(--border)">Je balaye la semaine de travail en notant les actions, interactions et apprentissages — à transformer ensuite en bullet points CV.</div>' +
          '<textarea class="inp" rows="4" placeholder="Semaine du 15 jan : réunion S&OP, analyse stock mort 450 refs..." oninput="updExp(\'' + e.id + '\',\'souvenirs\',this.value)">' + esc(e.souvenirs||'') + '</textarea>' +
        '</div>' +
      '</details>' +
      '<details class="exp-details">' +
        '<summary class="exp-details-summary"><i data-lucide="search" style="width:14px;height:14px"></i>Fiche métier</summary>' +
        '<div style="margin-top:10px">' +
          '<div style="font-size:11.5px;color:var(--ink3);margin-bottom:8px;line-height:1.6;background:var(--bg);border-radius:8px;padding:9px 12px;border:1px solid var(--border)">Recherche <strong>« ' + esc(e.title||'ton poste') + ' — fiche métier »</strong> sur Google, ROME ou LinkedIn, puis colle ici les infos utiles.</div>' +
          '<textarea class="inp" rows="3" placeholder="Compétences attendues, formations recommandées, évolutions de carrière..." oninput="updExp(\'' + e.id + '\',\'fichemetier\',this.value)">' + esc(e.fichemetier||'') + '</textarea>' +
        '</div>' +
      '</details>' +
    '</div>';
  }).join('');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function addExp() {
  P.experiences.push({
    id: Date.now().toString(),
    contractType: '', title: '', company: '',
    duration: '', sector: '', location: '',
    description: '', souvenirs: '', fichemetier: ''
  });
  ss('sc_profile', P);
  renderExpList();
}
function delExp(id) { P.experiences = P.experiences.filter(e => e.id !== id); ss('sc_profile', P); renderExpList(); }
function updExp(id, key, val) { const e = P.experiences.find(x => x.id === id); if (e) { e[key] = val; ss('sc_profile', P); } }

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

function addEdu() { P.education.push({ id: Date.now().toString(), degree: '', school: '', year: '', mention: '' }); ss('sc_profile', P); renderEduList(); }
function delEdu(id) { P.education = P.education.filter(e => e.id !== id); ss('sc_profile', P); renderEduList(); }
function updEdu(id, key, val) { const e = P.education.find(x => x.id === id); if (e) { e[key] = val; ss('sc_profile', P); } }

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
