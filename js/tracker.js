// ── TRACKER ────────────────────────────────────────────────
let _trackerFilter    = 'Tous';
let _pasteTimer       = null;
let _lastAnalysisResult = null;   // gardé pour addCand()

// ── DASHBOARD PASTE ────────────────────────────────────────
let _dashPasteTimer        = null;
let _dashLastAnalysisResult = null;

// ── FETCH INDEED VIA WORKER ────────────────────────────────
function _extractIndeedJobKey(url) {
  const m = url.match(/[?&](?:jk|vjk)=([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

async function _fetchIndeedJob(url) {
  const jk = _extractIndeedJobKey(url);
  if (!jk) throw new Error('ID du poste introuvable (paramètre jk= ou vjk=)');

  let origin = 'https://fr.indeed.com';
  try { origin = new URL(url).origin; } catch {}
  const targetUrl = `${origin}/viewjob?jk=${jk}`;

  const res = await fetch(`${_LI_WORKER}?url=${encodeURIComponent(targetUrl)}`);
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
  const html = await res.text();

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  let structured = null;
  doc.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
    try { const j = JSON.parse(s.textContent); if (j['@type'] === 'JobPosting') structured = j; } catch {}
  });

  // JSON-LD peut retourner des tableaux ou des objets — on force en string
  const toStr = v => !v ? '' : Array.isArray(v) ? v[0] || '' : String(v);

  const title    = toStr(structured?.title)
                 || doc.querySelector('[data-testid="jobsearch-JobInfoHeader-title"], h1.jobsearch-JobInfoHeader-title, h1')?.textContent?.trim() || '';
  const company  = toStr(structured?.hiringOrganization?.name)
                 || doc.querySelector('[data-testid="inlineHeader-companyName"], .jobsearch-InlineCompanyRating a')?.textContent?.trim() || '';
  const location = toStr(structured?.jobLocation?.[0]?.address?.addressLocality)
                 || doc.querySelector('[data-testid="job-location"]')?.textContent?.trim() || '';
  const contract = toStr(Array.isArray(structured?.employmentType) ? structured.employmentType[0] : structured?.employmentType)
                 || doc.querySelector('[data-testid="job-type-informations"] li')?.textContent?.trim() || '';
  const salaryVal = structured?.baseSalary?.value?.value;
  const salary   = salaryVal
                 ? `${salaryVal} ${structured.baseSalary.currency || '€'}`
                 : doc.querySelector('[data-testid="attribute_snippet_testid"]')?.textContent?.trim() || '';

  const rawDesc  = structured?.description
                 || doc.querySelector('#jobDescriptionText, .jobsearch-jobDescriptionText')?.innerHTML || '';
  const tmp = document.createElement('div');
  tmp.innerHTML = rawDesc;
  tmp.querySelectorAll('button').forEach(el => el.remove());
  tmp.querySelectorAll('br').forEach(el => el.replaceWith('\n'));
  tmp.querySelectorAll('p, li, div, h1, h2, h3, h4').forEach(el => { if (el.nextSibling) el.after('\n'); });
  const descText = (tmp.textContent || '').replace(/\n{3,}/g, '\n\n').trim();

  return { title, company, location, contract, salary, descText, source: 'indeed', url: targetUrl };
}

// ── FETCH LINKEDIN VIA WORKER ──────────────────────────────
const _LI_WORKER = 'https://broad-term-79e4.djoudi-neel.workers.dev';

function _extractLinkedInJobId(url) {
  const patterns = [/currentJobId=(\d+)/, /\/jobs\/view\/(\d+)/, /\/jobs\/(\d+)/];
  for (const p of patterns) { const m = url.match(p); if (m) return m[1]; }
  return null;
}

async function _fetchLinkedInJob(url) {
  const jobId = _extractLinkedInJobId(url);
  if (!jobId) throw new Error('ID du poste introuvable dans ce lien');

  const targetUrl = `https://www.linkedin.com/jobs/view/${jobId}`;
  const res = await fetch(`${_LI_WORKER}?url=${encodeURIComponent(targetUrl)}`);
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
  const html = await res.text();

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // JSON-LD (le plus fiable)
  let structured = null;
  doc.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
    try { const j = JSON.parse(s.textContent); if (j['@type'] === 'JobPosting') structured = j; } catch {}
  });

  const toStr = v => !v ? '' : Array.isArray(v) ? v[0] || '' : String(v);

  const title    = toStr(structured?.title)
                 || doc.querySelector('h1')?.textContent?.trim() || '';
  const company  = toStr(structured?.hiringOrganization?.name)
                 || doc.querySelector('.topcard__org-name-link,.company-name')?.textContent?.trim() || '';
  const location = toStr(structured?.jobLocation?.[0]?.address?.addressLocality)
                 || doc.querySelector('.topcard__flavor--bullet,.job-location')?.textContent?.trim() || '';
  const contract = toStr(Array.isArray(structured?.employmentType) ? structured.employmentType[0] : structured?.employmentType);

  // Description → on priorise le HTML DOM (mise en forme conservée) sur le JSON-LD (texte brut)
  const domDescEl = doc.querySelector('.show-more-less-html__markup')
                 || doc.querySelector('.description__text')
                 || doc.querySelector('[class*="description"]');

  const tmp = document.createElement('div');
  if (domDescEl) {
    tmp.innerHTML = domDescEl.innerHTML;
  } else if (structured?.description) {
    tmp.innerHTML = structured.description;
  }
  tmp.querySelectorAll('button, .show-more-less-button').forEach(el => el.remove());
  // Conversion HTML → texte propre avec sauts de ligne (innerText ne marche pas hors DOM)
  tmp.querySelectorAll('br').forEach(el => el.replaceWith('\n'));
  tmp.querySelectorAll('p, li, div, h1, h2, h3, h4').forEach(el => {
    if (el.nextSibling) el.after('\n');
  });
  const descText = (tmp.textContent || '').replace(/\n{3,}/g, '\n\n').trim();

  return { title, company, location, contract, descText, jobId, source: 'linkedin', url: targetUrl };
}

// ── DÉTECTION SOURCE OFFRE ─────────────────────────────────
function _detectJobSource(text) {
  const t = text.slice(0, 1200).toLowerCase();
  if (
    t.includes('candidature simplifiée') ||
    t.includes('personnes que vous pouvez contacter') ||
    t.includes('essayer premium') ||
    t.includes('membres de votre réseau') ||
    t.includes('linkedin')
  ) return 'linkedin';
  if (
    t.includes('détails de l\'emploi') ||
    t.includes('type de poste') ||
    t.includes('trajet estimé') ||
    t.includes('correspondance entre ce poste') ||
    t.includes('indeed')
  ) return 'indeed';
  return null; // source inconnue / texte brut
}

function _showSourceBadge(source) {
  const el = document.getElementById('dash-source-badge');
  if (!el) return;
  if (!source) { el.innerHTML = ''; return; }
  const conf = {
    linkedin: { bg: '#0a66c2', label: 'LinkedIn détecté' },
    indeed:   { bg: '#2164f3', label: 'Indeed détecté'   },
  }[source];
  el.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px;background:${conf.bg};color:white;border-radius:100px;padding:2px 9px;font-size:10.5px;font-weight:700">✓ ${conf.label}</span>`;
}

function scheduleDashPasteAnalysis() {
  clearTimeout(_dashPasteTimer);
  // Délai 300ms : laisse le navigateur écrire la valeur collée dans le textarea
  _dashPasteTimer = setTimeout(() => {
    const ta = document.getElementById('dash-paste-text');
    if (!ta) return;
    const val = ta.value.trim();
    if (!val) return;

    // URL LinkedIn → fetch automatique
    if (/^https?:\/\/(www\.)?linkedin\.com\/jobs\//i.test(val)) {
      _showSourceBadge('linkedin');
      _runJobFetch(val, 'linkedin');
      return;
    }

    // URL Indeed → fetch automatique
    if (/^https?:\/\/([a-z]+\.)?indeed\.com\//i.test(val) && _extractIndeedJobKey(val)) {
      _showSourceBadge('indeed');
      _runJobFetch(val, 'indeed');
      return;
    }

    // Texte collé : détection source + analyse normale
    _showSourceBadge(_detectJobSource(val));
    if (val.length >= 30) runDashPasteAnalysis();
  }, 300);
}

// Stocke le job fetché pour l'analyse différée
let _liLastJob = null;

async function _runJobFetch(url, source) {
  const status  = document.getElementById('dash-paste-status');
  const preview = document.getElementById('dash-linkedin-preview');
  const label   = source === 'indeed' ? 'Indeed' : 'LinkedIn';

  status.style.color = 'var(--ink3)';
  status.innerHTML = `<span class="sp" style="width:12px;height:12px;display:inline-block;margin-right:6px;vertical-align:-2px"></span>Récupération ${label}…`;
  if (preview) preview.style.display = 'none';

  try {
    const job = source === 'indeed'
      ? await _fetchIndeedJob(url)
      : await _fetchLinkedInJob(url);
    _liLastJob = job;

    if (!job.descText || job.descText.length < 50) {
      throw new Error('Description vide — LinkedIn a peut-être bloqué la requête');
    }

    // Stocke la description pour addCandFromDash()
    const ta = document.getElementById('dash-paste-text');
    if (ta) ta.dataset.desc = job.descText;

    // Pré-remplit poste + entreprise
    const posteEl = document.getElementById('dash-poste');
    const coEl    = document.getElementById('dash-co');
    if (posteEl && job.title)   posteEl.value = cleanJobTitle(job.title);
    if (coEl    && job.company) coEl.value    = job.company;

    // Affiche la fiche formatée
    document.getElementById('li-prev-title').textContent   = job.title   || '—';
    document.getElementById('li-prev-company').textContent = job.company || '—';
    document.getElementById('li-prev-location').textContent = job.location ? '📍 ' + job.location : '';
    const descEl = document.getElementById('li-prev-desc');
    descEl.textContent = job.descText;
    // reset état réduit à chaque nouvelle offre
    descEl.style.maxHeight = '52px';
    const fadeEl = document.getElementById('li-prev-fade');
    const togEl  = document.getElementById('li-prev-toggle');
    if (fadeEl) fadeEl.style.display = 'block';
    if (togEl)  { togEl.textContent = '▼ Voir plus'; togEl.style.display = 'inline'; }

    const prevStatus = document.getElementById('li-prev-status');
    if (prevStatus) prevStatus.textContent = '';

    const badgesEl = document.getElementById('li-prev-badges');
    badgesEl.innerHTML = '';
    if (job.contract) badgesEl.innerHTML += `<span style="background:#dcfce7;color:#166534;border-radius:100px;padding:2px 10px;font-size:11px;font-weight:600">${esc(job.contract)}</span>`;
    if (job.salary)   badgesEl.innerHTML += `<span style="background:#f3e8ff;color:#7c3aed;border-radius:100px;padding:2px 10px;font-size:11px;font-weight:600">${esc(job.salary)}</span>`;

    preview.style.display = 'block';
    status.style.color = 'var(--teal-d)';
    status.innerHTML = `<strong>✓</strong> ${esc([job.title, job.company].filter(Boolean).join(' · '))}`;

  } catch(e) {
    status.style.color = 'var(--red)';
    status.textContent = '⚠ ' + (e.message || 'Récupération échouée');
  }
}


async function runDashPasteAnalysis() {
  const ta     = document.getElementById('dash-paste-text');
  const status = document.getElementById('dash-paste-status');
  const text   = ta.value.trim();
  if (text.length < 30) return;

  _dashLastAnalysisResult = null;
  ta.dataset.desc = text;

  // Un seul appel IA — doAnalyzeCore remplit aussi poste/entreprise
  if (!P.firstName) {
    status.style.color = 'var(--ink3)';
    status.textContent = '⚠ Complète ton profil d\'abord pour lancer l\'analyse';
    return;
  }

  status.style.color = 'var(--ink3)';
  status.innerHTML = '<span class="sp" style="width:12px;height:12px;display:inline-block;margin-right:6px;vertical-align:-2px"></span>Analyse en cours...';

  const analysisEl = document.getElementById('dash-analysis-result');
  analysisEl.classList.remove('hidden');
  analysisEl.innerHTML = `
    <div style="border-top:1px solid var(--teal-border);margin:14px 0 12px"></div>
    <div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:10px;display:flex;align-items:center;gap:7px">
      <span class="sp" style="width:13px;height:13px;flex-shrink:0"></span>Analyse IA en cours...
    </div>`;
  try {
    _dashLastAnalysisResult = await doAnalyzeCore(text, analysisEl);
    const r = _dashLastAnalysisResult;
    // Affiche le résumé dans la status bar
    const parts = [r.poste, r.entreprise, r.location, r.contractType, r.salary].filter(Boolean);
    status.style.color = 'var(--teal-d)';
    status.innerHTML = `<strong>✓</strong> ${esc(parts.join(' · '))}`;
    const hdr = analysisEl.querySelector('.tracker-analysis-hdr');
    if (hdr) hdr.remove();
  } catch(e) {
    status.style.color = 'var(--red)';
    status.textContent = '⚠ ' + (e.message || 'Analyse échouée');
    analysisEl.innerHTML += `<div style="color:var(--red);font-size:13px;padding:4px 0">⚠ ${e.message || 'Analyse échouée — l\'annonce reste enregistrée sans score.'}</div>`;
  }
}

function addCandFromDash() {
  const co    = document.getElementById('dash-co').value.trim();
  const poste = document.getElementById('dash-poste').value.trim();
  if (!co || !poste) { toast('Remplis le poste et l\'entreprise'); return; }
  const cands  = ls('sc_cands', []);
  const pasteEl = document.getElementById('dash-paste-text');
  // Récupère les métadonnées du job fetché (LinkedIn/Indeed) si disponibles
  const jobMeta = _liLastJob || {};
  cands.push({
    id: Date.now().toString(),
    company: co, poste,
    date:           document.getElementById('dash-date').value,
    status:         '',
    notes:          '',
    indeedUrl:      '',
    jobDescription: pasteEl?.dataset.desc || '',
    jobLocation:    jobMeta.location  || '',
    jobContract:    jobMeta.contract  || '',
    jobSalary:      jobMeta.salary    || '',
    jobUrl:         jobMeta.url       || '',
    jobSource:      jobMeta.source    || '',
    score:          null,
    analysis:       null
  });
  _liLastJob = null; // reset après enregistrement
  ss('sc_cands', cands);
  pasteEl.value = '';
  delete pasteEl.dataset.desc;
  document.getElementById('dash-poste').value  = '';
  document.getElementById('dash-co').value     = '';
  document.getElementById('dash-paste-status').textContent = '';
  const analysisEl = document.getElementById('dash-analysis-result');
  if (analysisEl) { analysisEl.innerHTML = ''; analysisEl.classList.add('hidden'); }
  _dashLastAnalysisResult = null;
  refreshDash();
  refreshBadges();
  toast('Candidature ajoutée ✓');
}

function renderTracker() {
  const cands = ls('sc_cands', []);

  // Stats bar
  document.getElementById('tracker-stats').innerHTML = STATS.map(s => {
    const [col,, border] = STAT_COLORS[s] || ['var(--ink3)', 'var(--bg)', 'var(--border)'];
    return `<div class="stat" style="border-color:${border}"><div class="stat-n" style="color:${col}">${cands.filter(c => c.status === s).length}</div><div class="stat-l">${s}</div></div>`;
  }).join('');

  // Filter buttons
  const filters = ['Tous', ...STATS];
  document.getElementById('tracker-filters').innerHTML = filters.map(f =>
    `<span class="tfilter${_trackerFilter === f ? ' on' : ''}" onclick="setTrackerFilter('${f}')">${f}</span>`
  ).join('');

  const visible = _trackerFilter === 'Tous' ? cands : cands.filter(c => c.status === _trackerFilter);

  if (!visible.length) {
    document.getElementById('tracker-table').innerHTML = `<div class="empty" style="padding:38px"><div class="empty-ic">◫</div><div class="empty-t">${cands.length ? 'Aucune candidature pour ce filtre' : 'Aucune candidature'}</div><div class="empty-s">${cands.length ? '' : 'Ajoute ta première candidature pour commencer le suivi'}</div></div>`;
    return;
  }

  const _fmtDate = (d) => {
    if (!d) return '';
    const p = d.split('-');
    if (p.length !== 3) return d;
    return p[2] + '-' + p[1] + '-' + p[0].slice(2);
  };

  let _prevDate = '';
  const rowsHtml = visible.map(c => {
    const [col, bg, border] = STAT_COLORS[c.status] || ['var(--ink3)', 'var(--bg)', 'var(--border)'];
    const tdBg = `background:${bg}`;

    // Score badge
    const sc = c.analysis?.score_global ?? c.score;
    let scoreBadge = '<span style="opacity:.35;font-size:12px">—</span>';
    if (sc !== null && sc !== undefined) {
      const sc_col = sc >= 70 ? 'var(--teal)' : sc >= 50 ? '#D97706' : 'var(--red)';
      const sc_bg  = sc >= 70 ? 'var(--teal-bg)' : sc >= 50 ? '#FFFBEB' : 'var(--red-bg)';
      const sc_bd  = sc >= 70 ? 'var(--teal-border)' : sc >= 50 ? '#FDE68A' : 'var(--red-border)';
      const hasAnalysis = !!c.analysis;
      scoreBadge = `<span
        style="display:inline-block;padding:3px 10px;border-radius:100px;font-size:12px;font-weight:700;color:${sc_col};background:${sc_bg};border:1.5px solid ${sc_bd};${hasAnalysis ? 'cursor:pointer' : ''}"
        ${hasAnalysis ? `onclick="openAnalysisModal('${c.id}')" title="Voir l'analyse complète"` : ''}
      >${sc}%${hasAnalysis ? ' ↗' : ''}</span>`;
    }

    const indeedLink = c.indeedUrl
      ? `<a href="${esc(c.indeedUrl)}" target="_blank" rel="noopener" style="font-size:10.5px;color:#2164f3;text-decoration:none;font-weight:600">↗ Annonce</a>`
      : '';

    let sep = '';
    if (_prevDate && c.date !== _prevDate) {
      sep = `<tr><td colspan="6" style="padding:0;height:3px;background:var(--border);border:none"></td></tr>`;
    }
    _prevDate = c.date;

    return sep + `<tr data-cand-id="${c.id}">
      <td style="${tdBg}">
        <div style="font-weight:700;color:var(--ink);font-size:13px">${esc(c.poste)}</div>
        <div style="color:var(--ink3);font-size:12px;margin-top:1px">${esc(c.company)}${indeedLink ? ' · ' + indeedLink : ''}</div>
      </td>
      <td style="${tdBg}">${scoreBadge}</td>
      <td style="${tdBg};color:var(--ink3);font-size:12.5px">${_fmtDate(c.date)}</td>
      <td style="${tdBg}">${renderStatusLetters(c.id, c.status, 'updCand')}</td>
      <td style="${tdBg}" class="notes-cell" onclick="openNoteModal('${esc(c.company)}','${esc(c.poste)}',\`${(c.notes||'').replace(/`/g,"'")}\`)" title="Cliquer pour voir">${esc(c.notes) || '<span style="opacity:.4">—</span>'}</td>
      <td style="${tdBg};white-space:nowrap">${c.analysis ? `
        <button onclick="loadCVForCand('${c.id}')" style="background:none;border:1.5px solid var(--teal-border);cursor:pointer;color:var(--teal-d);font-size:11px;font-weight:700;padding:3px 8px;border-radius:100px;margin-right:3px" title="Voir le CV adapté à cette offre">CV</button><button onclick="loadCVForCand('${c.id}', true)" style="background:none;border:1.5px solid var(--border);cursor:pointer;color:var(--ink3);font-size:11px;font-weight:600;padding:3px 8px;border-radius:100px;margin-right:3px" title="Télécharger PDF">⬇ PDF</button>` : ''}<button onclick="openInterviewForCand('${c.id}')" style="background:none;border:1.5px solid #e9d5ff;cursor:pointer;color:#7c3aed;font-size:11px;font-weight:700;padding:3px 8px;border-radius:100px;margin-right:3px" title="Simuler l'entretien pour ce poste">🎤 Entretien</button><button onclick="delCand('${c.id}')" style="background:none;border:none;cursor:pointer;color:var(--ink3);font-size:18px;line-height:1;padding:2px 6px;border-radius:4px" onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--ink3)'">×</button></td>
    </tr>`;
  }).join('');

  document.getElementById('tracker-table').innerHTML = `
    <table class="tbl">
      <thead><tr>
        <th>Poste · Entreprise</th><th>Score</th><th>Date</th><th>Statut</th><th>Notes</th><th></th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;
}

function setTrackerFilter(f) { _trackerFilter = f; renderTracker(); }

function toggleAddForm() { document.getElementById('add-form').classList.toggle('hidden'); }

function addCand() {
  const co    = document.getElementById('f-co').value.trim();
  const poste = document.getElementById('f-poste').value.trim();
  if (!co || !poste) { toast('Remplis l\'entreprise et le poste'); return; }
  const cands = ls('sc_cands', []);
  const indeedUrlEl = document.getElementById('f-indeed-url');
  const pasteEl     = document.getElementById('f-paste-text');
  cands.push({
    id: Date.now().toString(),
    company: co, poste,
    date:           document.getElementById('f-date').value,
    status:         document.getElementById('f-status').value,
    notes:          document.getElementById('f-notes').value.trim(),
    indeedUrl:      indeedUrlEl?.value.trim() || '',
    jobDescription: pasteEl?.dataset.desc || '',
    score:          null,   // Score uniquement après comparaison manuelle
    analysis:       null    // Analyse uniquement après comparaison manuelle
  });
  ss('sc_cands', cands);
  document.getElementById('f-co').value    = '';
  document.getElementById('f-poste').value = '';
  document.getElementById('f-notes').value = '';
  if (indeedUrlEl) indeedUrlEl.value = '';
  if (pasteEl) { pasteEl.value = ''; delete pasteEl.dataset.desc; }
  document.getElementById('f-paste-status').textContent = '';
  const analysisEl = document.getElementById('tracker-analysis-result');
  if (analysisEl) { analysisEl.innerHTML = ''; analysisEl.classList.add('hidden'); }
  _lastAnalysisResult = null;
  document.getElementById('add-form').classList.add('hidden');
  renderTracker();
  refreshBadges();
  toast('Candidature ajoutée');
}

// ── PASTE ANALYSIS ─────────────────────────────────────────

// Appelé sur l'événement paste — attend 600ms que le texte soit collé
function schedulePasteAnalysis() {
  clearTimeout(_pasteTimer);
  _pasteTimer = setTimeout(runPasteAnalysis, 600);
}

async function runPasteAnalysis() {
  const ta     = document.getElementById('f-paste-text');
  const status = document.getElementById('f-paste-status');
  const text   = ta.value.trim();
  if (text.length < 30) return;

  _lastAnalysisResult = null;
  status.style.color = 'var(--ink3)';
  status.innerHTML   = '<span class="sp" style="width:12px;height:12px;display:inline-block;margin-right:6px;vertical-align:-2px"></span>Extraction des infos...';

  // ── Étape 1 : extraction rapide titre / entreprise ──
  try {
    const raw = await callGroq(
      `Extrais les infos de cette annonce.\n\nANNONCE:\n${text.substring(0,4000)}\n\nRéponds UNIQUEMENT en JSON:\n{"title":"","company":"","location":"","salary":"","contractType":""}`,
      { maxTokens: 200, temperature: 0 }
    );
    const p = safeParseJSON(raw);
    if (p.title)   document.getElementById('f-poste').value = cleanJobTitle(p.title);
    if (p.company) document.getElementById('f-co').value    = p.company;

    const parts = [p.title, p.company, p.location, p.contractType, p.salary].filter(Boolean);
    status.style.color = 'var(--teal-d)';
    status.innerHTML   = `<strong>✓</strong> ${esc(parts.join(' · '))}`;
  } catch {
    status.style.color = 'var(--red)';
    status.textContent = '⚠ Erreur d\'extraction — vérifie ta clé API';
    return;
  }

  ta.dataset.desc = text;

  // ── Étape 2 : analyse IA complète (score, mots-clés, bullets, lettre) ──
  if (!P.firstName) return;   // profil vide → pas d'analyse

  const analysisEl = document.getElementById('tracker-analysis-result');
  analysisEl.classList.remove('hidden');
  analysisEl.innerHTML = `
    <div style="border-top:1px solid var(--teal-border);margin:14px 0 12px"></div>
    <div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:10px;display:flex;align-items:center;gap:7px">
      <span class="sp" style="width:13px;height:13px;flex-shrink:0"></span>
      Analyse IA en cours...
    </div>`;

  try {
    _lastAnalysisResult = await doAnalyzeCore(text, analysisEl);
    // Remplacer le titre du bloc analyse
    const hdr = analysisEl.querySelector('.tracker-analysis-hdr');
    if (hdr) hdr.remove();
  } catch(e) {
    analysisEl.innerHTML += `<div style="color:var(--red);font-size:13px;padding:4px 0">⚠ ${e.message || 'Analyse échouée — l\'annonce reste enregistrée sans score.'}</div>`;
  }
}

// ── CHARGER LE CV POUR UNE CANDIDATURE ─────────────────────
function loadCVForCand(candId, andPrint = false) {
  const c = ls('sc_cands', []).find(x => x.id === candId);
  if (!c) return;

  // Injecter le poste ciblé
  const target = c.analysis?.poste || c.poste;
  _cvTarget = target;
  localStorage.setItem('sc_cv_target', _cvTarget);

  // Injecter les compétences matchées
  if (c.analysis) {
    _matchedSkills = [
      ...(c.analysis.keywords_present || []),
      ...(c.analysis.must_have        || []),
      ...(c.analysis.nice_to_have     || [])
    ].filter(Boolean);
    localStorage.setItem('sc_matched_skills', JSON.stringify(_matchedSkills));
  }

  closeAnalysisModal();

  if (andPrint) {
    // Rendre le CV en arrière-plan puis imprimer
    renderCV();
    setTimeout(() => printCV(), 250);
  } else {
    goTo('cv');
  }
}

// ── MODAL ANALYSE ──────────────────────────────────────────
function openAnalysisModal(candId) {
  const cands = ls('sc_cands', []);
  const c = cands.find(x => x.id === candId);
  if (!c?.analysis) return;

  const overlay = document.getElementById('analysis-modal-overlay');
  const body    = document.getElementById('analysis-modal-body');
  document.getElementById('analysis-modal-title').textContent = c.poste + ' — ' + c.company;

  // Boutons d'action en haut du modal
  body.innerHTML = `
    <div style="display:flex;gap:9px;margin-bottom:16px;flex-wrap:wrap">
      <button class="btn btn-p" onclick="loadCVForCand('${candId}')" style="font-size:13px">
        <i data-lucide="file-text" style="width:14px;height:14px;vertical-align:-2px;margin-right:5px"></i>Voir le CV adapté
      </button>
      <button class="btn btn-g" onclick="loadCVForCand('${candId}', true)" style="font-size:13px">
        <i data-lucide="download" style="width:14px;height:14px;vertical-align:-2px;margin-right:5px"></i>Télécharger PDF
      </button>
    </div>
    <div id="analysis-modal-result"></div>`;

  overlay.classList.remove('hidden');
  renderAnalyzeResult(c.analysis, { errors: [], warnings: [] }, document.getElementById('analysis-modal-result'));
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeAnalysisModal() {
  document.getElementById('analysis-modal-overlay').classList.add('hidden');
}

function delCand(id) {
  if (!confirm('Supprimer cette candidature ?')) return;
  ss('sc_cands', ls('sc_cands', []).filter(x => x.id !== id));
  renderTracker();
  refreshBadges();
  if (typeof refreshDash === 'function') refreshDash();
  toast('Candidature supprimée');
}

function updCand(id, k, v) {
  const cands = ls('sc_cands', []);
  const item  = cands.find(x => x.id === id);
  if (item) { item[k] = v; ss('sc_cands', cands); }
  // Only re-render stats, not the whole table, to keep the select focused
  const c2 = ls('sc_cands', []);
  document.getElementById('tracker-stats').innerHTML = STATS.map(s => {
    const [col,, border] = STAT_COLORS[s] || ['var(--ink3)', 'var(--bg)', 'var(--border)'];
    return `<div class="stat" style="border-color:${border}"><div class="stat-n" style="color:${col}">${c2.filter(x => x.status === s).length}</div><div class="stat-l">${s}</div></div>`;
  }).join('');
  if (k === 'status') {
    const [, bg] = STAT_COLORS[v] || ['var(--ink3)', 'var(--bg)', 'var(--border)'];
    const tr = document.querySelector(`#tracker-table tr[data-cand-id="${id}"]`);
    if (tr) tr.querySelectorAll('td').forEach(td => td.style.background = bg);
  }
  refreshBadges();
}

function updCandAndRefresh(id, k, v) {
  updCand(id, k, v);
  refreshDash();
}

function updCandAndRefreshSplit(id, k, v) {
  updCand(id, k, v);
  refreshDash();
  // Met à jour les lettres dans le header de la split view
  const statusEl = document.getElementById('split-status-letters');
  if (statusEl) {
    const cands = ls('sc_cands', []);
    const c = cands.find(x => x.id === id);
    if (c) {
      statusEl.innerHTML = renderStatusLetters(c.id, c.status, 'updCandAndRefreshSplit');
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  }
}

// ── NOTE MODAL ─────────────────────────────────────────────
function openNoteModal(company, poste, notes) {
  if (!notes) return;
  document.getElementById('note-modal-title').textContent = company + ' — ' + poste;
  document.getElementById('note-modal-content').textContent = notes;
  document.getElementById('note-modal-overlay').classList.remove('hidden');
}
function closeNoteModal() {
  const el = document.getElementById('note-modal-overlay');
  if (el) el.classList.add('hidden');
}

// ── SPLIT VIEW ─────────────────────────────────────────────

// Extraction structurée de l'annonce via Groq
async function _fetchJobInfo(jobText) {
  try {
    const raw = await callGroq(
      `Extrais les informations structurées de cette annonce d'emploi.\nPour "descriptionText" : retourne UNIQUEMENT le texte des missions/responsabilités/profil recherché, sans répéter le titre, la société, le salaire, le lieu, le contrat ou les avantages déjà extraits. Max 1500 caractères.\n\nANNONCE:\n${jobText.substring(0,4000)}\n\nRéponds UNIQUEMENT en JSON valide:\n{"title":"","company":"","location":"","salary":"","contractType":"","remote":"","benefits":[],"rating":"","descriptionText":""}`,
      { maxTokens: 800, temperature: 0 }
    );
    return safeParseJSON(raw);
  } catch { return {}; }
}

// Trajet depuis Créteil via Nominatim + OSRM
async function _getCommuteFromCreteil(location) {
  if (!location) return null;
  try {
    const geoRes  = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location + ', France')}&format=json&limit=1`, { headers:{'User-Agent':'SupplyCopilot/1.0','Accept-Language':'fr'} });
    const geoData = await geoRes.json();
    if (!geoData.length) return null;
    const toLat = parseFloat(geoData[0].lat), toLng = parseFloat(geoData[0].lon);
    const fromLat = 48.7773, fromLng = 2.4558; // Créteil centre
    const osrmRes  = await fetch(`https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=false`);
    const osrmData = await osrmRes.json();
    if (osrmData.code !== 'Ok') return null;
    const min = Math.round(osrmData.routes[0].duration / 60);
    const km  = Math.round(osrmData.routes[0].distance / 100) / 10;
    const mapsBase = `https://www.google.com/maps/dir/Créteil,94000,France/${encodeURIComponent(location + ', France')}`;
    return { min, km, mapsBase };
  } catch { return null; }
}

// ── STRIP HEADER INDEED/LINKEDIN POUR L'AFFICHAGE ──────────
// Retire les métadonnées du début (titre, salaire, lieu, CDI...) et le footer
// Utilisé uniquement pour l'affichage — PAS pour l'IA
function _stripJobHeader(rawText) {
  const lines = rawText.split('\n');

  const boilerplate = [
    // ── Indeed ──
    /^\s*détails de l.emploi\s*$/i,
    /^\s*trajet estimé\s*$/i,
    /^\s*job address\s*$/i,
    /^\s*type de poste\s*$/i,
    /^\s*correspondance entre ce poste et votre profil\.?\s*$/i,
    /^\s*extraits de la description (complète|complete) du poste\s*$/i,
    /^\s*(salaire|lieu|horaires|formation|langues|permis|avantages?)\s*$/i,
    /^\s*rémunération\s*:.*$/i,
    /^\s*salaire\s*:.*$/i,
    /^\s*(postuler|enregistrer|signaler|partager)\s*$/i,
    /^\s*\d[\d\s,\.]*\s*€.*$/i,
    /^\s*(cdi|cdd|intérim|interim|stage|alternance|temps plein|temps partiel|freelance)\s*$/i,
    /^\s*(présentiel|sur site|télétravail|teletravail|hybride)\s*$/i,
    /^\s*\+\s*\d+\s*avantages?\s*$/i,
    /^\s*(il y a \d+|aujourd.hui|today)[\s·,]*/i,
    /^\s*plus de \d+\s*candidats?\s*$/i,
    /^\s*\d+\s*(avis|offres?|emplois?)\s*$/i,
    /^\s*[⭐★•·\-–—]+\s*$/,
    /^\s*\d+\s*minutes?\s+depuis\s+/i,
    // ── LinkedIn ──
    /^\s*candidature simplifiée\s*$/i,
    /^\s*voir plus d.options\s*$/i,
    /^\s*aucune info disponible.*$/i,
    /^\s*essayer premium.*$/i,
    /^\s*accédez à des informations exclusives.*$/i,
    /^\s*découvrez comment vous vous positionnez.*$/i,
    /^\s*personnes que vous pouvez contacter\s*$/i,
    /^\s*tout afficher\s*$/i,
    /^\s*[a-zÀ-ÿ]+ et d.autres membres de votre réseau\s*$/i,
    /^\s*enregistrer .{0,60} chez .{0,60}$/i,
    /^\s*(sur site|on.?site)\s*$/i,
  ];

  const startMarkers = [
    /^(description du poste|description de poste|à propos du poste|à propos de l.offre|le poste\b)/i,
    /^(vos missions?|missions? principales?|nous recherchons|votre mission|votre rôle)/i,
    /^(contexte\b|présentation du poste|rattaché|au sein de|dans le cadre de)/i,
    /^(qui sommes.nous|about the role|job description)/i,
    /^j.ai l.immense plaisir/i,
    /^raconter /i,
    /^nous recherchons (les talents|un|une)/i,
  ];

  let startIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const t = lines[i].trim();
    if (!t) { startIdx = i + 1; continue; }
    if (startMarkers.some(p => p.test(t))) { startIdx = i + 1; break; }
    if (boilerplate.some(p => p.test(t))) { startIdx = i + 1; continue; }
    // Ligne courte dans les 25 premières → probable boilerplate Indeed
    if (i < 25 && t.length <= 60) { startIdx = i + 1; continue; }
    startIdx = i; break;
  }

  // Coupe le footer
  const footer = /^\s*(avantages?|postuler|postulez|enregistrer|signaler|partager|extraits de la description|correspondance entre ce poste|pourquoi nous rejoindre|requirements|exigences|show more|show less|voir moins|voir plus)\s*$/i;
  const body = lines.slice(startIdx);
  let endIdx = body.length;
  for (let i = 0; i < body.length; i++) {
    if (footer.test(body[i].trim())) { endIdx = i; break; }
  }
  return body.slice(0, endIdx).join('\n').trim();
}

// ── NETTOYAGE TEXTE POUR L'IA ──────────────────────────────
// Pipeline v=68 :
//   1. _stripJobHeader()  → retire le header Indeed (titre, salaire, lieu…)
//   2. Coupe avant "avantages / postuler / nous offrons"
//   3. slice(0, 4000)     → tronque si trop long
// → envoie uniquement : Description + Vos missions + Profil
function _cleanOfferForAI(rawText) {
  // Étape 1 : retire le header Indeed
  const stripped = _stripJobHeader(rawText);

  // Étape 2 : coupe le footer (avantages, postuler, etc.)
  const footers = /^\s*(avantages?|postuler|postulez|pour postuler|comment postuler|envoyer (votre|ma) candidature|nous offrons|pourquoi nous rejoindre|partager|enregistrer|signaler|extraits de la description|correspondance entre ce poste)\s*$/i;
  const lines = stripped.split('\n');
  const kept = [];
  for (const line of lines) {
    if (footers.test(line.trim())) break;
    kept.push(line);
  }

  return kept.join('\n').trim().slice(0, 4000);
}



// ── RE-RENDER CV PANNEAU DROIT (après update mots-clés) ────
// Applique les overrides per-offre avant le rendu si disponibles
let _pSnapshot = null;

function _getCVOverrides(candId) {
  const c = ls('sc_cands', []).find(x => x.id === candId);
  return c?.cv_overrides ? JSON.parse(JSON.stringify(c.cv_overrides)) : {};
}

function _saveCVOverrides(candId, overrides) {
  const cands = ls('sc_cands', []);
  const idx = cands.findIndex(x => x.id === candId);
  if (idx === -1) return;
  cands[idx].cv_overrides = overrides;
  ss('sc_cands', cands);
}

function _applyOverridesToP(overrides) {
  if (!overrides || !Object.keys(overrides).length) return false;
  // Snapshot profond de l'état courant
  _pSnapshot = {
    summaryTarget:   P.summaryTarget,
    experiences:     JSON.parse(JSON.stringify(P.experiences)),
    _cvTarget:       _cvTarget,
    domainesProfile: P.domainesProfile
  };
  // Titre du poste
  if (overrides.title) {
    _cvTarget = overrides.title;
    localStorage.setItem('sc_cv_target', _cvTarget);
  }
  // Résumé personnalisé
  if (overrides.summaryTarget !== undefined) {
    P.summaryTarget = overrides.summaryTarget;
  }
  // Phrase d'accroche adaptée à l'offre
  if (overrides.domainesProfile !== undefined) {
    P.domainesProfile = overrides.domainesProfile;
  }
  // Expériences : masquées + overrides de contenu
  if (overrides.hiddenExpIndices?.length || overrides.expOverrides) {
    P.experiences = P.experiences
      .map((e, origIdx) => ({ ...e, _origIdx: origIdx }))
      .filter(e => !(overrides.hiddenExpIndices || []).includes(e._origIdx))
      .map(e => {
        const ov = overrides.expOverrides?.[e._origIdx];
        if (!ov) return e;
        const bullets = ov.overrideAllBullets !== undefined
          ? ov.overrideAllBullets.map(t => ({ text: t, selected: true, required: false }))
          : (e.bullets || []);
        return {
          ...e,
          description: ov.description !== undefined ? ov.description : e.description,
          bullets
        };
      });
  }
  return true;
}

function _restoreP() {
  if (!_pSnapshot) return;
  P.summaryTarget   = _pSnapshot.summaryTarget;
  P.experiences     = _pSnapshot.experiences;
  _cvTarget         = _pSnapshot._cvTarget;
  P.domainesProfile = _pSnapshot.domainesProfile;
  localStorage.setItem('sc_cv_target', _cvTarget);
  _pSnapshot = null;
}

function _refreshSplitCV() {
  if (typeof renderCV !== 'function') return;
  // Applique les overrides si une offre est ouverte
  const candId   = window._splitCandId;
  const overrides = candId ? _getCVOverrides(candId) : null;
  const applied   = overrides && Object.keys(overrides).length ? _applyOverridesToP(overrides) : false;

  renderCV();
  if (applied) _restoreP();

  const cvDoc      = document.getElementById('cv-doc');
  const rightPanel = document.getElementById('split-right-panel');
  if (!cvDoc || !rightPanel) return;
  const cloneHtml = cvDoc.outerHTML.replace(/\bid="cv-doc"[^>]*/, 'id="cv-doc-split"');
  rightPanel.innerHTML = `<div style="box-shadow:0 6px 32px rgba(0,0,0,.13);border-radius:6px;overflow:hidden">${cloneHtml}</div>`;

  if (applied) renderCV(); // Restaure le cv-doc principal (sans overrides)

  // Strip les spans statiques (renderBulletHtml) avant de reposer les interactifs
  if (candId) setTimeout(() => {
    const split = document.getElementById('cv-doc-split');
    if (split) {
      split.querySelectorAll('span[data-cv-em]').forEach(s => s.replaceWith(document.createTextNode(s.textContent)));
    }
    _applyEmphases(candId);
  }, 0);
}

// ── MISE EN AVANT MANUELLE (sélection texte → badge ou souligné) ──────
// Initialise la détection de sélection sur le panneau CV droit.
// Utilise la délégation sur #split-right-panel (persiste entre re-renders).
function _setupEmphasisSelection() {
  const rightPanel = document.getElementById('split-right-panel');
  if (!rightPanel || rightPanel._emphasisReady) return;
  rightPanel._emphasisReady = true;

  rightPanel.addEventListener('mouseup', () => {
    // Petite pause pour laisser le navigateur finaliser la sélection
    setTimeout(() => {
      const sel = window.getSelection();
      const text = (sel?.toString() || '').trim();

      // Retire le toolbar si sélection trop courte (min 5 chars pour éviter les clics accidentels)
      if (!text || text.length < 5) {
        document.getElementById('emphasis-toolbar')?.remove();
        return;
      }

      // Vérifie que la sélection est bien dans #cv-doc-split
      const cvSplit = document.getElementById('cv-doc-split');
      if (!cvSplit) return;
      const range = sel.getRangeAt(0);
      if (!cvSplit.contains(range.commonAncestorContainer)) return;

      _showEmphasisToolbar(text, range);
    }, 30);
  });
}

// Affiche la barre flottante de mise en avant
function _showEmphasisToolbar(text, range) {
  document.getElementById('emphasis-toolbar')?.remove();

  // Détecte dans quelle expérience la sélection a été faite (pour scope limité)
  const anchor = range.commonAncestorContainer;
  const closestExp = (anchor.nodeType === 3 ? anchor.parentElement : anchor)
    ?.closest?.('.cv-exp[data-exp-idx]');
  const expIdx = closestExp ? parseInt(closestExp.dataset.expIdx) : null;

  const rect = range.getBoundingClientRect();
  const toolbar = document.createElement('div');
  toolbar.id = 'emphasis-toolbar';
  toolbar.style.cssText = [
    `position:fixed;z-index:1400`,
    `top:${Math.max(rect.top - 50, 8)}px`,
    `left:${rect.left + rect.width / 2}px`,
    `transform:translateX(-50%)`,
    `background:white;border:1.5px solid #6366f1;border-radius:10px`,
    `padding:6px 10px;box-shadow:0 6px 24px rgba(99,102,241,.22)`,
    `display:flex;align-items:center;gap:7px;white-space:nowrap`
  ].join(';');

  toolbar.innerHTML = `
    <span style="font-size:11px;color:#6b7280;font-weight:700">Mettre en avant :</span>
    <button data-em="pill"
      style="background:#ede9fe;color:#5b21b6;border:1px solid #ddd6fe;border-radius:100px;padding:3px 11px;font-size:12px;font-weight:700;cursor:pointer">
      💊 Badge
    </button>
    <button data-em="underline"
      style="background:none;border:none;color:#111;font-size:12.5px;font-weight:800;border-bottom:2.5px solid #6366f1;padding:2px 4px 1px;cursor:pointer;line-height:1.2">
      <u style="text-decoration:none">A</u>̲ Souligné
    </button>
    <button data-em="hl"
      style="background:#FEF08A;color:#1D1D1F;border:1px solid #FACC15;border-radius:5px;padding:3px 11px;font-size:12px;font-weight:700;cursor:pointer">
      🟡 Texte
    </button>
    <button data-em="hlnum"
      style="background:#BBF7D0;color:#14532D;border:1px solid #4ADE80;border-radius:5px;padding:3px 11px;font-size:12px;font-weight:700;cursor:pointer">
      🟢 Chiffre
    </button>
    <span style="color:#d1d5db;font-size:16px;line-height:1">|</span>
    <button data-em="remove"
      style="background:none;border:none;color:#9ca3af;font-size:11px;cursor:pointer;padding:2px 4px;font-weight:600"
      title="Retirer la mise en avant sur ce texte">✕</button>`;

  document.body.appendChild(toolbar);

  // Fermeture au clic en dehors du toolbar
  const _closeOnOutside = e => {
    if (!toolbar.contains(e.target)) { toolbar.remove(); document.removeEventListener('mousedown', _closeOnOutside); }
  };
  setTimeout(() => document.addEventListener('mousedown', _closeOnOutside), 50);

  // Clic sur une option
  toolbar.querySelectorAll('button[data-em]').forEach(btn => {
    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      const type = btn.dataset.em;
      const candId = window._splitCandId;
      if (!candId) return;

      const overrides = _getCVOverrides(candId);
      if (!overrides.emphases) overrides.emphases = [];

      if (!P.emphases) P.emphases = [];
      if (type === 'remove') {
        P.emphases = P.emphases.filter(em => em.text.toLowerCase() !== text.toLowerCase());
      } else {
        P.emphases = P.emphases.filter(em => em.text.toLowerCase() !== text.toLowerCase());
        P.emphases.push({ text, type, expIdx });
      }
      ss('sc_profile', P);
      toolbar.remove();
      window.getSelection()?.removeAllRanges();
      _refreshSplitCV();
      if (typeof renderCV === 'function') renderCV();
    });
  });

  // Ferme si clic ailleurs
  const closeHandler = e => {
    if (!toolbar.contains(e.target)) {
      toolbar.remove();
      document.removeEventListener('mousedown', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', closeHandler), 80);
}

// Applique les emphases sauvegardées sur #cv-doc-split
// Chaque emphase est scopée à son expérience d'origine (em.expIdx)
function _applyEmphases(candId) {
  const emphases = P.emphases || [];
  const cvSplit  = document.getElementById('cv-doc-split');
  if (!cvSplit || !emphases.length) return;

  emphases.forEach(em => {
    let target = cvSplit;
    if (em.expIdx !== null && em.expIdx !== undefined) {
      target = cvSplit.querySelector(`.cv-exp[data-exp-idx="${em.expIdx}"]`) || cvSplit;
    }
    _wrapPhrase(target, em.text, em.type, candId);
  });
}

// Entoure toutes les occurrences d'une phrase dans un container
function _wrapPhrase(container, phrase, type, candId) {
  if (!phrase) return;
  const phraseLow = phrase.toLowerCase();

  // Styles visuels — en mode ATS : surlignage jaune (texte) / vert (chiffres), pas de cases
  const _ats = (P.cvTemplate === 'ats');
  const hlYellow = 'background:#FEF08A;color:#1D1D1F;padding:0 3px;border-radius:2px;font-weight:700;cursor:pointer';
  const hlGreen  = 'background:#BBF7D0;color:#14532D;padding:0 3px;border-radius:2px;font-weight:700;cursor:pointer';
  // Couleur auto (legacy) selon présence d'un chiffre
  const atsAuto  = /\d/.test(phrase) ? hlGreen : hlYellow;
  const pillStyle       = _ats
    ? atsAuto
    : 'background:#ede9fe;color:#5b21b6;border-radius:100px;padding:1px 9px;font-weight:700;font-size:.92em;border:1px solid #ddd6fe;cursor:pointer';
  const underlineStyle  = _ats
    ? atsAuto
    : 'font-weight:800;border-bottom:2.5px solid #6366f1;padding-bottom:1px;cursor:pointer';
  // Types ATS explicites (choisis dans le toolbar)
  const styleForType = t =>
    t === 'hl'    ? hlYellow :
    t === 'hlnum' ? hlGreen  :
    t === 'pill'  ? pillStyle : underlineStyle;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: n => {
      // Ignore les textes déjà dans un span d'emphase
      if (n.parentElement?.dataset?.emphasis) return NodeFilter.FILTER_REJECT;
      return n.textContent.toLowerCase().includes(phraseLow)
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    }
  });

  const nodes = [];
  let node;
  while ((node = walker.nextNode())) nodes.push(node);

  nodes.forEach(textNode => {
    const content = textNode.textContent;
    const idx     = content.toLowerCase().indexOf(phraseLow);
    if (idx === -1) return;

    const before = content.slice(0, idx);
    const match  = content.slice(idx, idx + phrase.length);
    const after  = content.slice(idx + phrase.length);

    const span = document.createElement('span');
    span.dataset.emphasis = type;
    span.textContent      = match;
    span.title            = '✕ Clic pour retirer';
    span.style.cssText    = styleForType(type);
    span.onclick = e => {
      e.stopPropagation();
      // 1. Suppression immédiate du span dans le DOM (feedback visuel instantané)
      const frag = document.createTextNode(span.textContent);
      span.parentNode?.replaceChild(frag, span);
      // 2. Met à jour les overrides sauvegardés
      const ov = _getCVOverrides(candId);
      // Supprime du profil global (source unique de vérité)
      if (!P.emphases) P.emphases = [];
      P.emphases = P.emphases.filter(em => em.text.toLowerCase() !== phrase.toLowerCase());
      ss('sc_profile', P);
      // Re-render les deux vues
      setTimeout(() => { _refreshSplitCV(); if (typeof renderCV === 'function') renderCV(); }, 0);
    };

    const parent = textNode.parentNode;
    if (before) parent.insertBefore(document.createTextNode(before), textNode);
    parent.insertBefore(span, textNode);
    if (after)  parent.insertBefore(document.createTextNode(after), textNode);
    parent.removeChild(textNode);
  });
}

// ── ÉDITION DU CV PER-OFFRE ─────────────────────────────────
function toggleCVEditMode() {
  const cvSplit = document.getElementById('cv-doc-split');
  if (!cvSplit) return;
  if (cvSplit.dataset.editing === 'true') {
    _saveCVEditsFromDOM(window._splitCandId);
  } else {
    _enterCVEditMode();
  }
}

function _enterCVEditMode() {
  const cvSplit = document.getElementById('cv-doc-split');
  if (!cvSplit) return;
  cvSplit.dataset.editing = 'true';

  // Bouton → "Enregistrer"
  const btn = document.getElementById('cv-edit-btn');
  if (btn) {
    btn.textContent = '✓ Enregistrer';
    btn.style.background = '#16a34a';
    btn.style.color = 'white';
    btn.style.borderColor = '#16a34a';
  }

  // Bannière d'info
  const banner = document.createElement('div');
  banner.id = 'cv-edit-banner';
  banner.style.cssText = 'background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:8px;padding:8px 14px;font-size:12px;color:#1d4ed8;margin-bottom:10px;font-weight:600;width:100%;max-width:680px;box-sizing:border-box';
  banner.textContent = '✏️ Mode édition — cliquez sur les textes pour les modifier, masquez ou ajoutez des missions';
  cvSplit.parentElement.insertBefore(banner, cvSplit.parentElement.querySelector('#split-right-panel'));

  // ── Titre ──
  const titleEl = cvSplit.querySelector('.cv-title-text');
  if (titleEl) {
    titleEl.contentEditable = 'true';
    titleEl.style.cssText += ';outline:2px solid #6366f1;border-radius:3px;padding:1px 4px;min-width:40px';
  }

  // ── Résumé ──
  const summaryEl = cvSplit.querySelector('.cv-summary-text');
  if (summaryEl) {
    summaryEl.contentEditable = 'true';
    summaryEl.style.cssText += ';outline:2px solid #6366f1;border-radius:4px;padding:4px;min-height:32px';
  }

  // ── Expériences ──
  cvSplit.querySelectorAll('.cv-exp[data-exp-idx]').forEach(exp => {
    exp.style.position = 'relative';

    // Bouton "Masquer ce poste"
    const hideBtn = document.createElement('button');
    hideBtn.innerHTML = '× Masquer';
    hideBtn.style.cssText = 'position:absolute;top:6px;right:6px;background:#fee2e2;border:none;border-radius:6px;color:#dc2626;font-size:11px;padding:3px 9px;cursor:pointer;font-weight:700;z-index:5';
    hideBtn.onclick = () => { exp.style.display = 'none'; exp.dataset.hidden = 'true'; };
    exp.appendChild(hideBtn);

    // Description modifiable
    const descEl = exp.querySelector('.cv-edesc');
    if (descEl) {
      descEl.contentEditable = 'true';
      descEl.style.cssText += ';outline:2px dashed #6366f1;border-radius:4px;padding:3px;min-height:24px';
    }

    // Bullets éditables + handle drag + bouton supprimer
    exp.querySelectorAll('.cv-bullet-item').forEach(item => {
      const textSpan = item.querySelector('span:not(.cv-bullet-dot)');
      if (textSpan) {
        textSpan.classList.add('cv-bullet-text');
        textSpan.contentEditable = 'true';
        textSpan.style.cssText += ';outline:1px dashed #6366f1;border-radius:3px;padding:0 2px';
      }
      // Handle drag
      const handle = document.createElement('span');
      handle.textContent = '⠿';
      handle.style.cssText = 'cursor:grab;color:#94a3b8;font-size:14px;padding:0 5px 0 0;flex-shrink:0;user-select:none;line-height:1';
      handle.title = 'Glisser pour réordonner';
      item.insertBefore(handle, item.firstChild);
      // Bouton supprimer
      const rm = document.createElement('button');
      rm.textContent = '×';
      rm.style.cssText = 'background:none;border:none;color:#dc2626;cursor:pointer;font-weight:700;font-size:14px;padding:0 0 0 5px;line-height:1;vertical-align:middle;flex-shrink:0';
      rm.onclick = e => { e.stopPropagation(); item.remove(); };
      item.style.display = 'flex';
      item.style.alignItems = 'baseline';
      item.appendChild(rm);
    });
    // Activer le drag sort sur chaque liste de bullets
    exp.querySelectorAll('.cv-bullets').forEach(ul => _initBulletDragSort(ul));

    // Bouton "＋ Ajouter une mission"
    const addBtn = document.createElement('button');
    addBtn.innerHTML = '＋ Ajouter une mission';
    addBtn.dataset.addMission = 'true';
    addBtn.style.cssText = 'margin-top:8px;background:none;border:1.5px dashed #6366f1;border-radius:6px;color:#6366f1;font-size:11.5px;padding:4px 12px;cursor:pointer;font-weight:600;display:block;width:100%';
    addBtn.onclick = e => { e.stopPropagation(); _showBulletPicker(exp, addBtn); };
    exp.appendChild(addBtn);
  });

  // ── Compétences et Outils — suppression en mode édition ──
  const labelToKey = { 'Domaines':'subdomains', 'Outils SC':'tools', 'Bureautique':'informatique', 'Certifications':'certifs', 'Autres':'customSkills' };
  cvSplit.querySelectorAll('.cv-skill-row').forEach(row => {
    const labelEl = row.querySelector('.cv-skill-key');
    // Lit uniquement le premier nœud texte (ignore le bouton "+" enfant)
    const label   = labelEl ? [...labelEl.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim() : '';
    const key     = labelToKey[label];
    if (!key) return;

    row.querySelectorAll('.cv-skill-tag').forEach(tag => {
      const val = tag.textContent.replace('✓','').trim();
      tag.style.paddingRight = '4px';
      const x = document.createElement('span');
      x.textContent = '×';
      x.style.cssText = 'margin-left:4px;color:#dc2626;cursor:pointer;font-weight:700;font-size:11px;opacity:.7;vertical-align:1px';
      x.title = 'Supprimer';
      x.onclick = e => {
        e.stopPropagation();
        P[key] = (P[key] || []).filter(s => s !== val);
        ss('sc_profile', P);
        tag.remove();
      };
      tag.appendChild(x);
    });
  });

  // Bouton "Réinitialiser"
  const resetBtn = document.createElement('button');
  resetBtn.id = 'cv-edit-reset-btn';
  resetBtn.textContent = '↺ Réinitialiser toutes les modifications';
  resetBtn.style.cssText = 'margin-top:14px;background:none;border:1.5px solid var(--border);border-radius:7px;color:var(--ink3);font-size:11.5px;padding:5px 14px;cursor:pointer;font-weight:600;width:100%;max-width:680px';
  resetBtn.onclick = () => _resetCVOverrides(window._splitCandId);
  const rightPanelParent = document.getElementById('split-right-panel').parentElement;
  rightPanelParent.appendChild(resetBtn);
}

// ── PICKER "AJOUTER UNE MISSION" ────────────────────────────
// Groupé par poste · missions déjà ajoutées marquées · toggle add/remove
function _showBulletPicker(expEl, triggerBtn) {
  document.getElementById('cv-bullet-picker')?.remove();

  // Textes déjà présents dans ce bloc expérience (pour cocher)
  const currentTexts = new Set();
  expEl.querySelectorAll('.cv-bullet-item').forEach(item => {
    const s = item.querySelector('span:not(.cv-bullet-dot)');
    if (s) currentTexts.add(s.textContent.trim().toLowerCase());
  });

  // Construit les groupes par poste
  const groups = [];
  (P.experiences || []).forEach(e => {
    const bullets = [];
    const seen = new Set();
    const addBullet = t => {
      t = t.trim();
      if (t.length > 5 && !seen.has(t)) { bullets.push(t); seen.add(t); }
    };
    (e.bullets || []).forEach(b => addBullet(b.text || ''));
    (e.description || '').split('\n')
      .map(l => l.replace(/^[•\-\*▪▸→>\s]+/, '').trim())
      .filter(l => l.length > 8)
      .forEach(addBullet);
    if (bullets.length) groups.push({ title: e.title || 'Expérience', bullets });
  });

  // HTML des groupes
  let globalIdx = 0;
  const allBullets = []; // index plat pour retrouver le texte au clic
  const listHtml = groups.length ? groups.map(g => {
    const rowsHtml = g.bullets.map(txt => {
      const active = currentTexts.has(txt.toLowerCase());
      const i = globalIdx++;
      allBullets.push(txt);
      return `<div class="bp-opt" data-i="${i}" data-active="${active}"
        style="padding:7px 34px 7px 13px;font-size:12.5px;cursor:pointer;line-height:1.4;
               border-bottom:1px solid #f9fafb;position:relative;
               color:${active ? '#6b7280' : '#1f2937'}">
        <span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);
                     font-size:13px;color:${active ? '#16a34a' : '#d1d5db'}">
          ${active ? '✓' : '＋'}
        </span>
        ${esc(txt)}
      </div>`;
    }).join('');
    return `
      <div class="bp-group">
        <div style="padding:5px 13px 4px;font-size:10px;font-weight:800;text-transform:uppercase;
                    letter-spacing:.07em;color:#6366f1;background:#f5f3ff;
                    border-bottom:1px solid #ede9fe;border-top:1px solid #ede9fe;
                    position:sticky;top:0;z-index:1">
          ${esc(g.title)}
        </div>
        ${rowsHtml}
      </div>`;
  }).join('') : `<div style="padding:12px 14px;font-size:12px;color:#9ca3af;font-style:italic">
    Aucun bullet dans le profil — saisis directement ci-dessous
  </div>`;

  // ── Picker DOM ──
  const picker = document.createElement('div');
  picker.id = 'cv-bullet-picker';
  picker.style.cssText = [
    'position:absolute;z-index:200;left:0;right:0;top:calc(100% + 6px)',
    'background:white;border:1.5px solid #6366f1;border-radius:10px',
    'box-shadow:0 8px 36px rgba(99,102,241,.18);overflow:hidden'
  ].join(';');

  picker.innerHTML = `
    <div style="padding:7px 10px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:6px">
      <span style="font-size:13px;opacity:.6">🔍</span>
      <input id="bp-input" type="text" placeholder="Filtrer les missions…"
        style="flex:1;border:none;outline:none;font-size:12.5px;color:#111;background:transparent" autocomplete="off">
    </div>
    <div id="bp-list" style="max-height:240px;overflow-y:auto">${listHtml}</div>
    <div style="padding:7px 10px;border-top:1px solid #e5e7eb;background:#fafafa;display:flex;gap:6px">
      <input id="bp-custom" type="text" placeholder="Saisir une mission personnalisée…"
        style="flex:1;border:1.5px solid #e5e7eb;border-radius:6px;padding:5px 9px;font-size:12.5px;outline:none">
      <button id="bp-add"
        style="background:#6366f1;color:white;border:none;border-radius:6px;padding:5px 13px;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap">
        ＋ Ajouter
      </button>
    </div>`;

  expEl.insertBefore(picker, triggerBtn);

  const input  = picker.querySelector('#bp-input');
  const list   = picker.querySelector('#bp-list');
  const custom = picker.querySelector('#bp-custom');
  const addBtn = picker.querySelector('#bp-add');

  setTimeout(() => input.focus(), 0);

  // Filtre live
  input.addEventListener('input', () => {
    const q = input.value.toLowerCase();
    list.querySelectorAll('.bp-opt').forEach(opt => {
      opt.style.display = opt.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
    // Masque les headers de groupe si tous leurs enfants sont cachés
    list.querySelectorAll('.bp-group').forEach(grp => {
      const visible = [...grp.querySelectorAll('.bp-opt')].some(o => o.style.display !== 'none');
      grp.style.display = visible ? '' : 'none';
    });
  });

  // Hover
  list.addEventListener('mouseover', e => {
    const o = e.target.closest('.bp-opt');
    if (o && o.dataset.active !== 'true') o.style.background = '#f5f3ff';
  });
  list.addEventListener('mouseout', e => {
    const o = e.target.closest('.bp-opt');
    if (o) o.style.background = '';
  });

  // Clic : ajoute ou retire selon état
  list.addEventListener('mousedown', e => {
    const opt = e.target.closest('.bp-opt');
    if (!opt) return;
    e.preventDefault();
    const txt    = allBullets[parseInt(opt.dataset.i)];
    const active = opt.dataset.active === 'true';

    if (active) {
      // Retire le bullet du DOM
      expEl.querySelectorAll('.cv-bullet-item').forEach(item => {
        const s = item.querySelector('span:not(.cv-bullet-dot)');
        if (s && s.textContent.trim().toLowerCase() === txt.toLowerCase()) item.remove();
      });
    } else {
      _commitEditBullet(expEl, txt);
    }
    picker.remove();
  });

  // Champ custom
  const commitCustom = () => {
    const txt = custom.value.trim() || input.value.trim();
    if (txt) { _commitEditBullet(expEl, txt); picker.remove(); }
  };
  addBtn.addEventListener('mousedown', e => { e.preventDefault(); commitCustom(); });
  custom.addEventListener('keydown', e => { if (e.key === 'Enter') commitCustom(); });
  input.addEventListener('keydown',  e => { if (e.key === 'Enter') commitCustom(); if (e.key === 'Escape') picker.remove(); });

  // Clic en dehors → ferme
  const outsideHandler = e => {
    if (!picker.contains(e.target) && e.target !== triggerBtn) {
      picker.remove();
      document.removeEventListener('mousedown', outsideHandler);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', outsideHandler), 100);
}

// Ajoute un bullet au DOM de l'expérience (éditable + bouton ×)
function _initBulletDragSort(ul) {
  if (!ul) return;
  // N'initialise que les items pas encore traités (évite cloneNode qui casse les onclick)
  ul.querySelectorAll('.cv-bullet-item').forEach(li => {
    if (li.dataset.dragInit) return;
    li.dataset.dragInit = '1';

    const handle = li.querySelector('span[style*="grab"]');
    if (handle) {
      handle.addEventListener('mousedown', () => { li.draggable = true; });
      handle.addEventListener('mouseup',   () => { li.draggable = false; });
    }

    li.addEventListener('dragstart', e => {
      ul._dragSrc = li;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', '');
      setTimeout(() => { li.style.opacity = '0.4'; }, 0);
    });

    li.addEventListener('dragend', () => {
      li.style.opacity = '';
      li.draggable = false;
      ul.querySelectorAll('.cv-bullet-item').forEach(el => {
        el.style.borderTop = '';
        el.style.borderBottom = '';
      });
    });

    li.addEventListener('dragover', e => {
      e.preventDefault();
      if (!ul._dragSrc || li === ul._dragSrc) return;
      ul.querySelectorAll('.cv-bullet-item').forEach(el => {
        el.style.borderTop = '';
        el.style.borderBottom = '';
      });
      const rect = li.getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) {
        li.style.borderTop = '2px solid #6366f1';
      } else {
        li.style.borderBottom = '2px solid #6366f1';
      }
    });

    li.addEventListener('drop', e => {
      e.preventDefault();
      if (!ul._dragSrc || li === ul._dragSrc) return;
      const rect = li.getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) {
        ul.insertBefore(ul._dragSrc, li);
      } else {
        ul.insertBefore(ul._dragSrc, li.nextSibling);
      }
    });
  });
}

function _commitEditBullet(expEl, text) {
  let ul = expEl.querySelector('.cv-bullets');
  if (!ul) {
    ul = document.createElement('ul');
    ul.className = 'cv-bullets';
    const addBtn = expEl.querySelector('button[data-add-mission]');
    expEl.insertBefore(ul, addBtn || null);
  }
  const li = document.createElement('li');
  li.className = 'cv-bullet-item';
  li.dataset.new = 'true';
  li.style.display = 'flex';
  li.style.alignItems = 'baseline';

  const handle = document.createElement('span');
  handle.textContent = '⠿';
  handle.style.cssText = 'cursor:grab;color:#94a3b8;font-size:14px;padding:0 5px 0 0;flex-shrink:0;user-select:none;line-height:1';

  const dot = document.createElement('span');
  dot.className = 'cv-bullet-dot';
  dot.textContent = '▸';

  const textSpan = document.createElement('span');
  textSpan.className = 'cv-bullet-text';
  textSpan.contentEditable = 'true';
  textSpan.style.cssText = 'outline:1px dashed #6366f1;border-radius:3px;padding:0 2px;flex:1';
  textSpan.textContent = text;

  const rm = document.createElement('button');
  rm.textContent = '×';
  rm.style.cssText = 'background:none;border:none;color:#dc2626;cursor:pointer;font-weight:700;font-size:14px;padding:0 0 0 5px;line-height:1;vertical-align:middle;flex-shrink:0';
  rm.onclick = e => { e.stopPropagation(); li.remove(); };

  li.appendChild(handle);
  li.appendChild(dot);
  li.appendChild(textSpan);
  li.appendChild(rm);
  ul.appendChild(li);
  _initBulletDragSort(ul);
}

function _saveCVEditsFromDOM(candId) {
  const cvSplit = document.getElementById('cv-doc-split');
  if (!cvSplit) return;

  const overrides = _getCVOverrides(candId);

  // ── Titre ──
  const titleEl = cvSplit.querySelector('.cv-title-text');
  if (titleEl) {
    const t = titleEl.textContent.trim();
    if (t) overrides.title = t;
  }

  // ── Résumé ──
  const summaryEl = cvSplit.querySelector('.cv-summary-text');
  if (summaryEl) overrides.summaryTarget = summaryEl.textContent.trim();

  // ── Expériences ──
  const hiddenExpIndices = [];
  const expOverrides = overrides.expOverrides || {};

  cvSplit.querySelectorAll('.cv-exp[data-exp-idx]').forEach(exp => {
    const origIdx = parseInt(exp.dataset.expIdx);

    if (exp.dataset.hidden === 'true' || exp.style.display === 'none') {
      hiddenExpIndices.push(origIdx);
      return;
    }

    const ov = expOverrides[origIdx] || {};

    // Description (si mode texte)
    const descEl = exp.querySelector('.cv-edesc');
    if (descEl) ov.description = descEl.textContent.trim();

    // Bullets : sauvegarde de TOUS les bullets visibles (set complet)
    const bulletTexts = [];
    exp.querySelectorAll('.cv-bullet-item').forEach(item => {
      const textSpan = item.querySelector('.cv-bullet-text') || item.querySelector('span:not(.cv-bullet-dot):not([style*="grab"])');
      if (!textSpan) return;
      const txt = textSpan.textContent.trim();
      if (txt && txt !== 'Saisir la mission...') bulletTexts.push(txt);
    });

    // Vérifie si le set a changé vs l'original
    const origBulletTexts = (P.experiences[origIdx]?.bullets || [])
      .filter(b => b.required || b.selected)
      .map(b => b.text || '');
    if (JSON.stringify(bulletTexts) !== JSON.stringify(origBulletTexts)) {
      ov.overrideAllBullets = bulletTexts;
    } else {
      delete ov.overrideAllBullets;
    }

    if (Object.keys(ov).length) expOverrides[origIdx] = ov;
    else delete expOverrides[origIdx];
  });

  overrides.hiddenExpIndices = hiddenExpIndices;
  if (Object.keys(expOverrides).length) overrides.expOverrides = expOverrides;
  else delete overrides.expOverrides;

  _saveCVOverrides(candId, overrides);
  _exitCVEditMode();
  _refreshSplitCV();
  toast('✓ Modifications enregistrées pour cette offre');
}

function _exitCVEditMode() {
  const btn = document.getElementById('cv-edit-btn');
  if (btn) {
    btn.textContent = '✏️ Modifier le CV';
    btn.style.background = 'none';
    btn.style.color = 'var(--ink3)';
    btn.style.borderColor = 'var(--border)';
  }
  document.getElementById('cv-edit-banner')?.remove();
  document.getElementById('cv-edit-reset-btn')?.remove();
  const cvSplit = document.getElementById('cv-doc-split');
  if (cvSplit) cvSplit.dataset.editing = 'false';
}

function _resetCVOverrides(candId) {
  if (!confirm('Réinitialiser toutes les modifications du CV pour cette offre ?')) return;
  _saveCVOverrides(candId, {});
  _exitCVEditMode();
  _refreshSplitCV();
  toast('CV réinitialisé');
}


// ── RENDU TEXTE OFFRE (headers détectés + paragraphes) ─────
function _formatOfferText(rawText) {
  if (!rawText) return '';
  const lines = rawText.replace(/\n{3,}/g, '\n\n').split('\n');
  let out = '';
  let para = [];
  const flush = () => {
    if (!para.length) return;
    out += `<p style="margin:0 0 10px;line-height:1.75;color:#374151;font-size:13px">${para.join('<br>')}</p>`;
    para = [];
  };
  for (const line of lines) {
    const plain = line.trim();
    if (!plain) { flush(); continue; }
    const isBullet = /^[•\-–—►▸*]\s/.test(plain);
    const isHeader = !isBullet && plain.length <= 60 && !/[.,;:?!]$/.test(plain) && !/^\d+[\.\)]/.test(plain);
    if (isHeader) {
      flush();
      const isBig = plain === plain.toUpperCase() || plain.length <= 35;
      out += isBig
        ? `<div style="font-weight:800;font-size:12px;color:#1e293b;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.06em;border-left:3px solid #6366f1;padding-left:8px">${esc(plain)}</div>`
        : `<div style="font-weight:700;font-size:13px;color:#1e293b;margin:14px 0 4px">${esc(plain)}</div>`;
    } else {
      para.push(isBullet ? `<span style="padding-left:4px">${esc(plain)}</span>` : esc(plain));
    }
  }
  flush();
  return out;
}

// ── DÉCODAGE IA DE L'OFFRE (analyse de l'offre seule) ──────
async function _aiDecodeOffer(offerText, jobTitle, forceProvider) {
  // Nettoie le texte pour l'IA : coupe le footer, limite à 4000 chars
  const section = _cleanOfferForAI(offerText);
  if (!section) return { data: null, provider: null, model: null };

  console.log('[DECODE] section envoyée à l\'IA (200 premiers chars):', section.slice(0, 200));

  const titleLine = jobTitle ? `Poste : ${jobTitle}\n\n` : '';

  const prompt = `Analyse cette offre d'emploi et réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans texte avant ou après.

OFFRE:
${titleLine}${section}

Format JSON attendu :
{
  "contexte": "1-2 phrases sur l'entreprise et l'enjeu",
  "profil_recherche": [{"point": "copie exacte de la ligne", "tags": ["Tag1", "Tag2"]}],
  "missions": [{"point": "copie exacte de la ligne", "tags": ["Tag1", "Tag2"]}],
  "competences_cles": ["compétence1", "compétence2"],
  "keywords": ["mot-clé1", "mot-clé2"]
}

EXEMPLES CONCRETS (à imiter exactement) :

Mission "Analyser les besoins en approvisionnement en fonction des prévisions de vente et des stocks"
→ tags: ["Approvisionnement", "Prévision de vente", "Gestion de stock"]

Mission "Passer les commandes auprès des fournisseurs et en assurer le suivi"
→ tags: ["Commandes fournisseurs", "Suivi"]

Mission "Optimiser les niveaux de stock afin d'éviter ruptures et surstocks"
→ tags: ["Optimisation stock", "Anti-rupture"]

Mission "Négocier les délais et conditions d'achat en lien avec le service achats"
→ tags: ["Négociation", "Achats"]

Mission "Suivre les indicateurs de performance (taux de service, rotation des stocks)"
→ tags: ["KPI", "Taux de service", "Rotation stock"]

Profil "Bac+2 en logistique ou commerce"
→ tags: ["Bac+2", "Logistique"]

Profil "Expérience de 2 ans minimum en approvisionnement"
→ tags: ["2 ans XP", "Approvisionnement"]

Règles :
- point : COPIE EXACTE mot pour mot du texte de l'offre. JAMAIS reformuler.
- tags : tableau de 1 à 3 mots/expressions courtes (1-3 mots chacun). PAS de phrases. PAS de verbes conjugués. JUSTE des noms ou expressions nominales.
- Une entrée par ligne dans l'offre. Ne saute rien, ne fusionne pas.
- JSON pur : pas de \`\`\`json, pas de commentaires.`;

  let text, provider, model;
  if (forceProvider === 'groq') {
    text = await _callGroqDirect(prompt, { maxTokens: 4000, temperature: 0 });
    provider = 'Groq'; model = 'llama-3.3-70b';
  } else if (forceProvider === 'gemini') {
    text = await callGemini(prompt, { maxTokens: 4000, temperature: 0 });
    provider = 'Gemini'; model = 'gemini-2.5-flash';
  } else {
    ({ text, provider, model } = await callAIAuto(prompt, { maxTokens: 4000, temperature: 0 }));
  }
  console.log('[DECODE] réponse IA brute:', text.slice(0, 600));

  let data;
  try { data = safeParseJSON(text); } catch(e) { console.error('[DECODE] parse error:', e); data = null; }
  console.log('[DECODE] data parsé:', JSON.stringify(data)?.slice(0, 400));

  if (!data?.profil_recherche && !data?.missions && !data?.contexte) return { data: null, provider, model };
  return { data, provider, model };
}

// ── RENDU HTML DU PANEL DÉCODAGE ───────────────────────────
function _renderDecodePanelHtml(data, isLoading, provider, model, offerText) {
  const candId  = window._splitCandId;
  const cand    = candId ? ls('sc_cands', []).find(x => x.id === candId) : null;
  const descText = offerText ? _stripJobHeader(offerText) : '';

  let html = '';

  // ── PARTIE 1 : texte de l'offre (toujours en haut) ───────
  if (descText) {
    const showBtn = !data && !isLoading;
    html += `
    <div style="border:1.5px solid #bfdbfe;border-radius:10px;overflow:hidden;margin-bottom:18px">
      <div style="background:#eff6ff;padding:11px 14px;display:flex;align-items:center;gap:10px">
        <span style="font-size:18px;flex-shrink:0">🏢</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;color:#1e293b">${esc(cand?.poste || '')}</div>
          <div style="font-size:12px;color:#0a66c2;font-weight:600">${esc(cand?.company || '')}</div>
        </div>
      </div>
      <div style="padding:14px 16px;max-height:400px;overflow-y:auto;border-top:1px solid #bfdbfe">
        <div style="font-size:12.5px;color:#334155;line-height:1.75;white-space:pre-line">${esc(descText)}</div>
      </div>
    </div>`;
  } else if (!data && !isLoading) {
    return `<div style="background:#fef9c3;border:1.5px solid #fde68a;border-radius:10px;padding:14px 16px;font-size:12.5px;color:#92400e">
      ⚠ Aucun texte d'offre — ajoute cette candidature depuis le tableau de bord avec un lien LinkedIn ou Indeed.
    </div>`;
  }

  // ── PARTIE 2 : spinner pendant le décodage ────────────────
  if (isLoading) {
    html += `<div style="display:flex;align-items:center;gap:10px;padding:14px 0;color:var(--ink3);font-size:13px">
      <span class="sp" style="width:14px;height:14px;flex-shrink:0"></span>Décodage IA en cours…
    </div>`;
    return html;
  }

  if (!data) return html; // texte affiché, pas encore analysé

  // ── PARTIE 3 : résultats IA — en dessous du texte ─────────
  const providerBadge = provider ? (() => {
    const isGemini = provider === 'Gemini';
    const dot = isGemini ? '#8b5cf6' : '#f97316';
    const bgC = isGemini ? '#f5f3ff' : '#fff7ed';
    const bdC = isGemini ? '#ddd6fe' : '#fed7aa';
    const label = isGemini ? `🟣 Gemini · ${model||'2.5 Flash'}` : `🟠 Groq · ${model||'Llama 3.3'}`;
    return `<span style="background:${bgC};color:${dot};border:1px solid ${bdC};border-radius:100px;padding:2px 9px;font-size:10.5px;font-weight:700">${label}</span>`;
  })() : '';

  html += `<div style="border-top:2px solid var(--border);padding-top:14px">`;

  // ── Helpers ──────────────────────────────────────────────
  const renderTextLines = (lines) => {
    let out = '';
    let para = [];
    const flush = () => {
      if (!para.length) return;
      out += `<p style="margin:0 0 9px;line-height:1.75;color:#374151;font-size:13px">${para.join('<br>')}</p>`;
      para = [];
    };
    for (const line of lines) {
      const plain = line.trim();
      if (!plain) { flush(); continue; }
      const isBullet = /^[•\-–—►▸*]\s/.test(plain);
      const isHeader = !isBullet && plain.length <= 60 && !/[.,;:?!]$/.test(plain) && !/^\d+[\.\)]/.test(plain);
      if (isHeader) {
        flush();
        const isBig = plain === plain.toUpperCase() || plain.length <= 35;
        out += isBig
          ? `<div style="font-weight:800;font-size:12px;color:#1e293b;margin:16px 0 5px;text-transform:uppercase;letter-spacing:.06em;border-left:3px solid #6366f1;padding-left:8px">${esc(plain)}</div>`
          : `<div style="font-weight:700;font-size:13px;color:#1e293b;margin:12px 0 4px">${esc(plain)}</div>`;
        continue;
      }
      para.push(isBullet ? `<span style="padding-left:4px">${esc(plain)}</span>` : esc(plain));
    }
    flush();
    return out;
  };

  // Rend le bloc "Missions décodées" — sans m.point (texte original déjà visible au-dessus)
  const renderMissionsBlock = (items) => {
    if (!items?.length) return '';
    let b = `<div style="margin:10px 0 16px;padding:9px 13px;background:#fafaff;border:1px solid #e0e7ff;border-radius:8px">
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:#6366f1;margin-bottom:7px">Compétences requises — missions</div>
      <div style="display:flex;flex-direction:column;gap:5px">`;
    items.forEach((m, i) => {
      const tags = m.tags || (m.attente ? [m.attente] : []);
      if (!tags.length) return;
      b += `<div style="display:flex;align-items:flex-start;gap:7px">
        <span style="flex-shrink:0;font-size:10px;font-weight:800;color:#6366f1;background:#e0e7ff;border-radius:100px;padding:1px 6px;margin-top:2px">${i + 1}</span>
        <div style="display:flex;flex-wrap:wrap;gap:4px">
          ${tags.map(t => `<span style="background:#eff1ff;color:#4f46e5;border:1px solid #c7d2fe;border-radius:100px;padding:2px 8px;font-size:11.5px;font-weight:600">${esc(t)}</span>`).join('')}
        </div>
      </div>`;
    });
    return b + `</div></div>`;
  };

  // Rend le bloc "Profil recherché décodé" — sans p.point
  const renderProfilBlock = (items) => {
    if (!items?.length) return '';
    let b = `<div style="margin:10px 0 16px;padding:9px 13px;background:#fef7ff;border:1px solid #f0d4ff;border-radius:8px">
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:#a855f7;margin-bottom:7px">Compétences requises — profil</div>
      <div style="display:flex;flex-direction:column;gap:5px">`;
    items.forEach((p, i) => {
      const tags = p.tags || (p.attente ? [p.attente] : []);
      if (!tags.length) return;
      b += `<div style="display:flex;align-items:flex-start;gap:7px">
        <span style="flex-shrink:0;font-size:10px;font-weight:800;color:#a855f7;background:#f3e8ff;border-radius:100px;padding:1px 6px;margin-top:2px">${i + 1}</span>
        <div style="display:flex;flex-wrap:wrap;gap:4px">
          ${tags.map(t => `<span style="background:#fdf4ff;color:#7c3aed;border:1px solid #e9d5ff;border-radius:100px;padding:2px 8px;font-size:11.5px;font-weight:600">${esc(t)}</span>`).join('')}
        </div>
      </div>`;
    });
    return b + `</div></div>`;
  };

  // ── Phrase profil à compléter ─────────────────────────────
  const _phrasePoste = window._splitCandId
    ? (ls('sc_cands',[]).find(x => x.id === window._splitCandId)?.poste || '')
    : '';
  html += `
  <div style="border-top:1.5px solid var(--border);margin-top:10px;padding-top:10px">
    <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:#6366f1;margin-bottom:7px">Phrase profil</div>
    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12.5px;color:var(--ink)">
      <span style="white-space:nowrap">Fort de 5 ans en logistique e-commerce,</span>
      <input id="phrase-competences" type="text"
        placeholder="tes compétences clés…"
        style="border:none;border-bottom:1.5px dashed #94a3b8;outline:none;background:transparent;font-size:12.5px;color:var(--ink);width:200px;padding:1px 4px"/>
      <span style="white-space:nowrap">, je vise un poste de</span>
      <strong id="phrase-poste-display" style="color:#2563eb">${esc(_phrasePoste)}</strong>
      <span>.</span>
      <button onclick="
        const comp = document.getElementById('phrase-competences').value.trim();
        const post = document.getElementById('phrase-poste-display').textContent.trim();
        const phrase = 'Fort de 5 ans en logistique e-commerce, ' + comp + ', je vise un poste de ' + post + '.';
        navigator.clipboard.writeText(phrase);
        this.textContent='✓ Copié !';this.style.background='#16a34a';
        setTimeout(()=>{this.textContent='Copier';this.style.background='#0ea5e9'},1600)"
        style="background:#0ea5e9;color:white;border:none;border-radius:6px;padding:4px 11px;font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap;margin-left:4px">
        Copier
      </button>
    </div>
  </div>`;

  html += `</div>`; // ferme la partie 3

  return html;
}


// ── AJOUTER SEULEMENT LES COMPÉTENCES COCHÉES ─────────────
window._addSelectedSkills = function() {
  const checked = [...document.querySelectorAll('#split-decode-panel input[data-skill]:checked')]
    .map(el => el.dataset.skill).filter(Boolean);
  if (!checked.length) {
    const t = document.createElement('div');
    t.textContent = 'Coche au moins une compétence';
    t.style.cssText = 'position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:#1e293b;color:white;padding:8px 18px;border-radius:100px;font-size:13px;font-weight:600;z-index:9999';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
    return;
  }
  window._addSkillsToProfile(checked);
};

// ── AJOUTER COMPÉTENCES AU PROFIL (→ customSkills "Autres") ─
window._addSkillsToProfile = function(skills) {
  if (!Array.isArray(skills) || !skills.length) return;
  if (!P.customSkills) P.customSkills = [];
  const existing = P.customSkills.map(s => s.toLowerCase());
  const added = [];
  for (const s of skills) {
    if (!existing.includes(s.toLowerCase())) {
      P.customSkills.push(s);
      added.push(s);
      existing.push(s.toLowerCase());
    }
  }
  ss('sc_profile', P);
  if (typeof renderCV === 'function') { renderCV(); _syncSplitCV(); }
  // Rafraîchit le panel décodage pour mettre à jour les ✓
  const panel = document.getElementById('split-decode-panel');
  if (panel && window._splitCandId) {
    const c   = ls('sc_cands', []).find(x => x.id === window._splitCandId);
    const raw = c?.analysis?.ai_decode || null;
    const prov = c?.analysis?.ai_decode_provider || null;
    const rt  = (c?.jobDescription || '').replace(/&nbsp;/g,' ').replace(/[ \t]{3,}/g,' ').trim();
    if (raw) panel.innerHTML = _renderDecodePanelHtml(raw, false, prov, null, rt);
  }
  // Toast
  const toast = document.createElement('div');
  toast.textContent = added.length
    ? `✓ ${added.length} compétence${added.length > 1 ? 's' : ''} ajoutée${added.length > 1 ? 's' : ''} dans "Autres"`
    : '✓ Déjà dans le profil';
  toast.style.cssText = 'position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:#1e293b;color:white;padding:8px 18px;border-radius:100px;font-size:13px;font-weight:600;z-index:9999;opacity:1;transition:opacity .4s';
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 400); }, 2200);
};

// Retry décodage depuis le bouton dans le panel d'erreur
window._reattachJobDesc = async function(candId) {
  const val    = (document.getElementById('reattach-paste')?.value || '').trim();
  const status = document.getElementById('reattach-status');
  if (!val) return;

  if (status) status.textContent = 'En cours…';

  try {
    let descText = '';

    if (/^https?:\/\/(www\.)?linkedin\.com\/jobs\//i.test(val)) {
      const job = await _fetchLinkedInJob(val);
      descText = job.descText;
    } else if (/^https?:\/\/([a-z]+\.)?indeed\.com\//i.test(val) && _extractIndeedJobKey(val)) {
      const job = await _fetchIndeedJob(val);
      descText = job.descText;
    } else {
      descText = val; // texte brut collé directement
    }

    if (!descText || descText.length < 30) throw new Error('Texte trop court ou vide');

    // Sauvegarde dans la candidature
    const cands = ls('sc_cands', []);
    const idx = cands.findIndex(x => x.id === candId);
    if (idx !== -1) { cands[idx].jobDescription = descText; ss('sc_cands', cands); }

    // Recharge le split view
    openSplitView(candId);
  } catch(e) {
    if (status) { status.style.color = 'var(--red)'; status.textContent = '⚠ ' + e.message; }
  }
};

window._retryDecode = function(candId, forceProvider) {
  const c = ls('sc_cands', []).find(x => x.id === candId);
  if (!c) return;
  // Efface le cache (ancien ou échoué)
  const cands = ls('sc_cands', []);
  const idx = cands.findIndex(x => x.id === candId);
  if (idx !== -1) {
    if (!cands[idx].analysis) cands[idx].analysis = {};
    cands[idx].analysis.ai_decode = null;
    cands[idx].analysis.ai_decode_provider = null;
    ss('sc_cands', cands);
  }

  const panel = document.getElementById('split-decode-panel');
  if (panel) panel.innerHTML = _renderDecodePanelHtml(null, true);

  const rawText     = (c.jobDescription||'').replace(/&nbsp;/g,' ').replace(/[ \t]{3,}/g,' ').trim();

  _aiDecodeOffer(rawText, c.poste, forceProvider).then(({ data, provider, model }) => {
    const cands2 = ls('sc_cands', []);
    const idx2   = cands2.findIndex(x => x.id === candId);
    if (idx2 !== -1) {
      if (!cands2[idx2].analysis) cands2[idx2].analysis = {};
      cands2[idx2].analysis.ai_decode = data;
      cands2[idx2].analysis.ai_decode_provider = provider;
      ss('sc_cands', cands2);
    }
    const rt = (ls('sc_cands', []).find(x => x.id === candId)?.jobDescription || '').replace(/&nbsp;/g,' ').trim();
    if (panel) panel.innerHTML = _renderDecodePanelHtml(data, false, provider, model, rt);
  }).catch(err => {
    console.error('_retryDecode error:', err);
    if (panel) panel.innerHTML = `
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 14px">
        <div style="font-size:12.5px;font-weight:700;color:#dc2626;margin-bottom:4px">⚠ Décodage IA échoué</div>
        <div style="font-size:12px;color:#b91c1c;line-height:1.5;margin-bottom:10px">${esc(err?.message || String(err))}</div>
        <div style="display:flex;gap:6px">
          <button onclick="window._retryDecode('${candId}','groq')"
            style="background:#fff7ed;color:#c2410c;border:1.5px solid #fed7aa;border-radius:6px;padding:5px 13px;font-size:12px;font-weight:700;cursor:pointer">
            🟠 Groq</button>
          <button onclick="window._retryDecode('${candId}','gemini')"
            style="background:#f5f3ff;color:#7c3aed;border:1.5px solid #ddd6fe;border-radius:6px;padding:5px 13px;font-size:12px;font-weight:700;cursor:pointer">
            🟣 Gemini</button>
        </div>
      </div>`;
  });
};

// ── RENDU INITIAL DU BLOC ANALYSE (cache ou picker) ─────────
function _renderAIAnalysisBlock(candId, cachedData) {
  const header = `
    <div style="background:var(--bg);padding:10px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--ink3)">Analyse IA</div>
      <div style="display:flex;gap:6px">
        <button onclick="launchCareerOpsAnalysis('${candId}','groq')"
          style="padding:5px 14px;background:#f6f3ff;color:#5b21b6;border:1.5px solid #c4b5fd;border-radius:7px;cursor:pointer;font-size:12px;font-weight:700">⚡ Groq</button>
        <button onclick="launchCareerOpsAnalysis('${candId}','gemini')"
          style="padding:5px 14px;background:#f0fdf4;color:#166534;border:1.5px solid #86efac;border-radius:7px;cursor:pointer;font-size:12px;font-weight:700">✦ Gemini</button>
      </div>
    </div>`;

  if (!cachedData) {
    return `<div style="border:1.5px solid var(--border);border-radius:12px;overflow:hidden">
      ${header}
      <div style="padding:14px 16px;font-size:12.5px;color:var(--ink3);text-align:center">
        Choisis un modèle pour analyser ta compatibilité avec cette offre
      </div>
    </div>`;
  }

  // Résultats en cache — on les réaffiche directement
  const resultsDiv = document.createElement('div');
  resultsDiv.style.cssText = 'padding:16px 18px';
  // On retourne un placeholder et on le remplit après insertion dans le DOM
  const uid = 'ai-cached-' + candId;
  setTimeout(() => {
    const el = document.getElementById(uid);
    if (el) _renderCareerOpsResult(cachedData, candId, null, el);
  }, 0);

  return `<div style="border:1.5px solid var(--border);border-radius:12px;overflow:hidden">
    ${header}
    <div id="${uid}" style="padding:16px 18px"></div>
  </div>`;
}

// ── BUILD CV TEXT pour le prompt IA ────────────────────────
function _buildCVText() {
  const lines = [];
  if (P.title)    lines.push(`Titre : ${P.title}`);
  if (P.yearsExp) lines.push(`Expérience : ${P.yearsExp} ans`);
  if (P.summary)  lines.push(`\nRésumé : ${P.summary}`);

  if (P.experiences?.length) {
    lines.push('\nEXPÉRIENCES :');
    P.experiences.forEach(e => {
      lines.push(`• ${e.title || ''} chez ${e.company || ''} (${e.duration || ''})`);
      if (e.description) lines.push(`  ${e.description}`);
      (e.bullets || []).forEach(b => { if (b.text) lines.push(`  – ${b.text}`); });
    });
  }

  const skills = [
    ...(P.technicalSkills||[]), ...(P.softSkills||[]),
    ...(P.tools||[]),           ...(P.subdomains||[]),
    ...(P.customSkills||[])
  ].filter(Boolean);
  if (skills.length) lines.push(`\nCompétences : ${skills.join(', ')}`);

  if (P.education?.length) {
    lines.push('\nFormation :');
    P.education.forEach(e => lines.push(`• ${e.degree || ''} — ${e.school || ''} (${e.year || ''})`));
  }
  return lines.join('\n');
}

// ── ANALYSE IA CAREER-OPS STYLE ─────────────────────────────
async function launchCareerOpsAnalysis(candId, provider) {
  const c = ls('sc_cands', []).find(x => x.id === candId);
  if (!c) return;
  const offerText = (c.jobDescription || '').replace(/&nbsp;/g, ' ').replace(/[ \t]{3,}/g, ' ').trim();
  if (!offerText) { toast('Aucun texte d\'offre enregistré'); return; }

  const block = document.getElementById('split-ai-analysis');
  if (!block) return;

  block.innerHTML = `
    <div style="border:1.5px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:24px">
      ${_analysisHeader(candId, provider)}
      <div id="split-ai-results" style="padding:16px 18px">
        <div class="ldg"><div class="sp"></div>
          <span style="font-size:13px;color:var(--ink3)">
            ${provider === 'groq' ? '⚡ Groq' : '✦ Gemini'} analyse l'offre et ton CV…
          </span>
        </div>
      </div>
    </div>`;

  const cvText   = _buildCVText();
  const resultsEl = document.getElementById('split-ai-results');

  const prompt = `Tu es un expert RH supply chain. Analyse cette offre pour ce candidat. Réponds UNIQUEMENT en JSON valide, sans markdown, sans commentaires.

CV DU CANDIDAT :
${cvText}

OFFRE D'EMPLOI :
${offerText.slice(0, 3000)}

Réponds avec ce JSON exact :
{
  "poste": "titre du poste détecté",
  "entreprise": "nom entreprise",
  "seniorite": "Junior|Confirmé|Senior|Manager",
  "remote": "Remote|Hybride|Présentiel|Non précisé",
  "tldr": "1 phrase résumant le poste et ce qu'ils cherchent (max 20 mots)",
  "score": 1-5,
  "points_forts": ["max 3 forces du candidat pour CE poste, phrase courte qui cite le CV"],
  "match": [
    {"exigence": "texte exact de l'exigence de l'offre", "ligne_cv": "ligne exacte du CV qui couvre ça, vide si absent", "niveau": "ok|partial|gap"}
  ],
  "lacunes": [
    {"lacune": "ce qui manque", "bloqueur": true, "mitigation": "comment compenser en 1 phrase courte"}
  ],
  "competences_cles": ["5-8 compétences clés de l'offre NON présentes dans les compétences du CV — à ajouter au profil"],
  "keywords": ["10-15 mots-clés ATS importants de l'offre"],
  "recommandations_cv": ["max 3 modifications concrètes à faire sur le CV pour cette offre"]
}

RÈGLES :
- "match" : max 8 exigences, les plus importantes de l'offre
- "lacunes" : uniquement les vraies absences (pas ce qui est partiellement couvert)
- "ligne_cv" : cite mot pour mot une ligne du CV ci-dessus, ou laisse vide
- "competences_cles" : uniquement celles ABSENTES du CV, pertinentes pour ce poste
- "recommandations_cv" : actions concrètes ("Ajouter X dans le résumé", "Mentionner Y dans l'expérience Z")`;

  try {
    const callFn = provider === 'gemini' ? callGemini : callGroq;
    const raw    = await callFn(prompt, { maxTokens: 1800, temperature: 0.1 });
    const data   = safeParseJSON(raw);
    if (!data || !data.score) throw new Error('Réponse invalide');
    _renderCareerOpsResult(data, candId, provider, resultsEl);

    // Sauvegarder dans la candidature
    const cands = ls('sc_cands', []);
    const idx   = cands.findIndex(x => x.id === candId);
    if (idx !== -1) {
      if (!cands[idx].analysis) cands[idx].analysis = {};
      cands[idx].analysis.career_ops = data;
      cands[idx].analysis.poste      = cleanJobTitle(data.poste) || cands[idx].analysis.poste;
      cands[idx].analysis.entreprise = data.entreprise || cands[idx].analysis.entreprise;
      ss('sc_cands', cands);
    }
  } catch(e) {
    resultsEl.innerHTML = `
      <div style="color:var(--red);font-size:13px;padding:4px 0">⚠ ${esc(e.message || 'Erreur — vérifie ta clé API')}</div>`;
  }
}

function _analysisHeader(candId, activeProvider) {
  return `
    <div style="background:var(--bg);padding:10px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--ink3)">Analyse IA</div>
      <div style="display:flex;gap:6px">
        <button onclick="launchCareerOpsAnalysis('${candId}','groq')"
          style="padding:4px 12px;background:${activeProvider==='groq'?'#5b21b6':'#f6f3ff'};color:${activeProvider==='groq'?'#fff':'#5b21b6'};border:1.5px solid #c4b5fd;border-radius:7px;cursor:pointer;font-size:11.5px;font-weight:700">⚡ Groq</button>
        <button onclick="launchCareerOpsAnalysis('${candId}','gemini')"
          style="padding:4px 12px;background:${activeProvider==='gemini'?'#166534':'#f0fdf4'};color:${activeProvider==='gemini'?'#fff':'#166534'};border:1.5px solid #86efac;border-radius:7px;cursor:pointer;font-size:11.5px;font-weight:700">✦ Gemini</button>
      </div>
    </div>`;
}

function _renderCareerOpsResult(d, candId, provider, el) {
  // Score → couleur
  const sc  = Math.round((d.score / 5) * 100);
  const col = sc >= 70 ? 'var(--teal)' : sc >= 50 ? '#D97706' : 'var(--red)';
  const lbl = sc >= 70 ? 'Bonne compatibilité' : sc >= 50 ? 'Compatibilité moyenne' : 'Faible compatibilité';

  // TL;DR + meta
  const metaHtml = `
    <div style="margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
        <span style="font-size:24px;font-weight:900;color:${col}">${d.score}/5</span>
        <span style="padding:3px 10px;background:${sc>=70?'var(--teal-bg)':sc>=50?'#FFFBEB':'var(--red-bg)'};color:${col};border:1.5px solid ${col};border-radius:100px;font-size:11.5px;font-weight:700">${lbl}</span>
        ${d.seniorite ? `<span style="padding:3px 9px;background:#F3E8FF;color:#7C3AED;border:1px solid #DDD6FE;border-radius:100px;font-size:11px;font-weight:600">${esc(d.seniorite)}</span>` : ''}
        ${d.remote ? `<span style="padding:3px 9px;background:#F0F9FF;color:#0369A1;border:1px solid #BAE6FD;border-radius:100px;font-size:11px;font-weight:600">${esc(d.remote)}</span>` : ''}
      </div>
      ${d.tldr ? `<div style="font-size:12.5px;color:var(--ink2);line-height:1.6;font-style:italic;padding:8px 12px;background:var(--bg);border-radius:8px;border-left:3px solid var(--border)">${esc(d.tldr)}</div>` : ''}
    </div>`;

  // Points forts
  const fortsHtml = (d.points_forts||[]).length ? `
    <div style="margin-bottom:14px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--teal);margin-bottom:6px">✦ Tes points forts</div>
      ${(d.points_forts||[]).map(f => `
        <div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid var(--border2);font-size:12.5px;color:var(--ink);align-items:flex-start">
          <span style="color:var(--teal);flex-shrink:0;font-weight:700;margin-top:1px">✓</span>${esc(f)}
        </div>`).join('')}
    </div>` : '';

  // Match tableau
  const matchHtml = (d.match||[]).length ? `
    <div style="margin-bottom:14px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--ink3);margin-bottom:6px">Exigences de l'offre</div>
      ${(d.match||[]).map(m => {
        const ic = m.niveau==='ok' ? '✓' : m.niveau==='partial' ? '◑' : '✗';
        const mc = m.niveau==='ok' ? 'var(--teal)' : m.niveau==='partial' ? '#D97706' : 'var(--red)';
        const mb = m.niveau==='ok' ? 'var(--teal-bg)' : m.niveau==='partial' ? '#FFFBEB' : 'var(--red-bg)';
        return `<div style="display:flex;gap:9px;padding:7px 0;border-bottom:1px solid var(--border2);align-items:flex-start">
          <span style="color:${mc};font-weight:900;flex-shrink:0;font-size:13px;margin-top:1px">${ic}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:12.5px;font-weight:600;color:var(--ink)">${esc(m.exigence)}</div>
            ${m.ligne_cv ? `<div style="font-size:11.5px;color:var(--ink3);margin-top:2px">→ ${esc(m.ligne_cv)}</div>` : ''}
          </div>
          <span style="flex-shrink:0;padding:2px 7px;border-radius:100px;font-size:10px;font-weight:700;color:${mc};background:${mb};border:1px solid ${mc};white-space:nowrap">${
            m.niveau==='ok'?'Couvert':m.niveau==='partial'?'Partiel':'Gap'}</span>
        </div>`;
      }).join('')}
    </div>` : '';

  // Lacunes
  const lacunesHtml = (d.lacunes||[]).length ? `
    <div style="margin-bottom:14px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--red);margin-bottom:6px">Lacunes</div>
      ${(d.lacunes||[]).map(l => `
        <div style="padding:8px 10px;background:${l.bloqueur?'var(--red-bg)':'#FFFBEB'};border:1px solid ${l.bloqueur?'var(--red-border)':'#FDE68A'};border-radius:8px;margin-bottom:6px">
          <div style="display:flex;align-items:center;gap:7px;margin-bottom:4px">
            ${l.bloqueur ? `<span style="font-size:9.5px;font-weight:700;color:#fff;background:var(--red);padding:1px 6px;border-radius:3px">BLOQUANT</span>` : `<span style="font-size:9.5px;font-weight:700;color:#92400E;background:#FDE68A;padding:1px 6px;border-radius:3px">NICE TO HAVE</span>`}
            <span style="font-size:12.5px;font-weight:600;color:var(--ink)">${esc(l.lacune)}</span>
          </div>
          ${l.mitigation ? `<div style="font-size:11.5px;color:var(--ink3);font-style:italic">💡 ${esc(l.mitigation)}</div>` : ''}
        </div>`).join('')}
    </div>` : '';

  // Recommandations CV
  const recoHtml = (d.recommandations_cv||[]).length ? `
    <div>
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#7C3AED;margin-bottom:6px">Actions sur le CV</div>
      ${(d.recommandations_cv||[]).map(r => `
        <div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid var(--border2);font-size:12.5px;color:var(--ink2)">
          <span style="color:#7C3AED;flex-shrink:0;font-weight:700">→</span>${esc(r)}
        </div>`).join('')}
    </div>` : '';

  // À mettre en avant (checkboxes pour ajouter au profil)
  const existing = (P.customSkills || []).map(s => s.toLowerCase());
  const amettre = (d.competences_cles || []);
  const amettreHtml = amettre.length ? `
    <div style="margin-bottom:14px;padding-top:12px;border-top:1.5px solid var(--border)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#6366f1">À ajouter au profil</div>
        <button onclick="window._addSelectedSkillsFromAnalysis()"
          style="background:#6366f1;color:white;border:none;border-radius:6px;padding:3px 12px;font-size:11px;font-weight:700;cursor:pointer">➕ Ajouter la sélection</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${amettre.map(c => {
          const alreadyIn = existing.includes(c.toLowerCase());
          if (alreadyIn) return `<span style="display:inline-flex;align-items:center;padding:4px 10px;border-radius:100px;font-size:12px;font-weight:600;background:#f0fdf4;color:#16a34a;border:1.5px solid #bbf7d0">${esc(c)}</span>`;
          return `<label style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:100px;font-size:12px;font-weight:600;background:#f5f3ff;color:#4f46e5;border:1.5px solid #c7d2fe;cursor:pointer">
            <input type="checkbox" data-skill="${esc(c)}" style="width:12px;height:12px;accent-color:#6366f1;cursor:pointer;flex-shrink:0"/>
            ${esc(c)}
          </label>`;
        }).join('')}
      </div>
    </div>` : '';

  // Mots-clés ATS
  const kwHtml = (d.keywords||[]).length ? `
    <div style="padding-top:10px;border-top:1.5px solid var(--border)">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#1d4ed8;margin-bottom:7px">Mots-clés ATS</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px">
        ${(d.keywords||[]).map(k => `<span style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:100px;padding:2px 9px;font-size:11.5px;font-weight:600">${esc(k)}</span>`).join('')}
      </div>
    </div>` : '';

  el.innerHTML = metaHtml + fortsHtml + matchHtml + lacunesHtml + recoHtml + amettreHtml + kwHtml;

  // Enregistre la fonction d'ajout dans window pour les checkboxes
  window._addSelectedSkillsFromAnalysis = () => {
    const checks = el.querySelectorAll('input[data-skill]:checked');
    if (!checks.length) { toast('Sélectionne au moins une compétence'); return; }
    if (!P.customSkills) P.customSkills = [];
    let added = 0;
    checks.forEach(cb => {
      const val = cb.dataset.skill;
      if (!P.customSkills.map(s=>s.toLowerCase()).includes(val.toLowerCase())) {
        P.customSkills.push(val); added++;
      }
    });
    ss('sc_profile', P);
    renderCV();
    if (typeof _syncSplitCV === 'function') _syncSplitCV();
    // Mettre à jour les labels → ✓ pour les compétences ajoutées
    el.querySelectorAll('input[data-skill]:checked').forEach(cb => {
      const label = cb.closest('label');
      if (label) {
        label.outerHTML = `<span style="display:inline-flex;align-items:center;padding:4px 10px;border-radius:100px;font-size:12px;font-weight:600;background:#f0fdf4;color:#16a34a;border:1.5px solid #bbf7d0">${esc(cb.dataset.skill)}</span>`;
      }
    });
    toast(added + ' compétence' + (added>1?'s':'') + ' ajoutée' + (added>1?'s':'') + ' au profil');
  };
}

// ── CALCULATEUR SALAIRE NET FR ──────────────────────────────────────────────

function _detectSalary(text) {
  if (!text) return null;
  const t = text.replace(/[  ]/g, ' ');

  // Fourchette K€ : "40 à 50K€" / "40-50K"
  const rFK = t.match(/(\d{2,3})\s*[kK]?\s*(?:€|EUR)?\s*(?:à|-)\s*(\d{2,3})\s*[kK]\s*(?:€|EUR)/i);
  if (rFK) {
    const avg = (parseInt(rFK[1]) + parseInt(rFK[2])) / 2 * 1000;
    return { brut_annuel: avg, raw: `~${rFK[1]}-${rFK[2]}K€ brut/an` };
  }

  // Fourchette littérale : "entre 40 000 et 50 000€"
  const rFE = t.match(/entre\s*([\d\s]{4,9})\s*(?:€|EUR)?\s*(?:et|à)\s*([\d\s]{4,9})\s*(?:€|EUR)/i);
  if (rFE) {
    const v1 = parseInt(rFE[1].replace(/\s/g, ''));
    const v2 = parseInt(rFE[2].replace(/\s/g, ''));
    if (v1 > 1000 && v2 > 1000) {
      const avg = (v1 + v2) / 2;
      return { brut_annuel: avg, raw: `~${Math.round(avg / 1000)}K€ brut/an` };
    }
  }

  // Montant K€ seul : "45K€", "45 k€ brut"
  const rK = t.match(/(\d{2,3})\s*[kK]\s*(?:€|EUR)/i);
  if (rK) {
    const v = parseInt(rK[1]) * 1000;
    return { brut_annuel: v, raw: `${rK[1]}K€ brut/an` };
  }

  // Montant annuel en € : "45 000 € / an"
  const rAnn = t.match(/([\d][\d\s]{3,7})\s*(?:€|EUR)\s*(?:brut\s*)?(?:\/\s*an|par\s*an|annuels?)/i);
  if (rAnn) {
    const v = parseInt(rAnn[1].replace(/\s/g, ''));
    if (v > 10000) return { brut_annuel: v, raw: `${v.toLocaleString('fr-FR')}€ brut/an` };
  }

  // Mensuel en € : "3 500 € / mois"
  const rMois = t.match(/([\d][\d\s]{2,6})\s*(?:€|EUR)\s*(?:brut\s*)?(?:\/\s*mois|par\s*mois|mensuel)/i);
  if (rMois) {
    const v = parseInt(rMois[1].replace(/\s/g, ''));
    if (v > 1000 && v < 30000) return { brut_annuel: v * 12, raw: `${v.toLocaleString('fr-FR')}€/mois brut` };
  }

  return null;
}

function _calcSalaryFR(brutAnnuel) {
  const CHARGES = 0.22; // cotisations salariales moyennes cadre
  const netAnnuel = Math.round(brutAnnuel * (1 - CHARGES));

  // Abattement 10% (min 472€, max 13 522€)
  const abattement = Math.min(Math.max(netAnnuel * 0.10, 472), 13522);
  const imposable  = netAnnuel - abattement;

  // Barème IR 2026 (revenus 2025) — 1 part, célibataire
  const tranches = [
    { max: 11600,   taux: 0    },
    { max: 29579,   taux: 0.11 },
    { max: 84577,   taux: 0.30 },
    { max: 181917,  taux: 0.41 },
    { max: Infinity, taux: 0.45 },
  ];
  let ir = 0, prev = 0;
  for (const { max, taux } of tranches) {
    const slice = Math.min(imposable, max) - prev;
    if (slice <= 0) break;
    ir += slice * taux;
    prev = max;
  }
  ir = Math.round(ir);

  const tauxMoyen = netAnnuel > 0 ? (ir / netAnnuel * 100) : 0;
  return {
    brut_mensuel:        Math.round(brutAnnuel / 12),
    net_mensuel:         Math.round(netAnnuel / 12),
    net_annuel:          netAnnuel,
    charges_pct:         Math.round(CHARGES * 100),
    ir_taux_moyen:       Math.round(tauxMoyen * 10) / 10,
    net_apres_ir_mensuel: Math.round((netAnnuel - ir) / 12),
  };
}

function _salaryResultHtml(calc) {
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:10px">
      <div style="background:var(--bg2);border-radius:7px;padding:7px 10px;text-align:center">
        <div style="font-size:9.5px;color:var(--ink3);margin-bottom:3px;font-weight:600;letter-spacing:.04em">NET / MOIS</div>
        <div style="font-size:16px;font-weight:800;color:var(--ink)">${calc.net_mensuel.toLocaleString('fr-FR')} €</div>
        <div style="font-size:9.5px;color:var(--ink3);margin-top:1px">après cotisations (−${calc.charges_pct}%)</div>
      </div>
      <div style="background:#fffbeb;border-radius:7px;padding:7px 10px;text-align:center">
        <div style="font-size:9.5px;color:#92400e;margin-bottom:3px;font-weight:600;letter-spacing:.04em">IMPÔT</div>
        <div style="font-size:16px;font-weight:800;color:#d97706">${calc.ir_taux_moyen}%</div>
        <div style="font-size:9.5px;color:#92400e;margin-top:1px">taux moyen IR</div>
      </div>
      <div style="background:#f0fdf4;border-radius:7px;padding:7px 10px;text-align:center">
        <div style="font-size:9.5px;color:#166534;margin-bottom:3px;font-weight:600;letter-spacing:.04em">EN POCHE</div>
        <div style="font-size:16px;font-weight:800;color:#16a34a">${calc.net_apres_ir_mensuel.toLocaleString('fr-FR')} €</div>
        <div style="font-size:9.5px;color:#166534;margin-top:1px">/mois net d'impôt</div>
      </div>
    </div>
    <div style="font-size:10px;color:var(--ink3);margin-top:6px;text-align:center">
      Estimations — Cadre, célibataire, 1 part fiscale · Barème IR 2026 (revenus 2025)
    </div>`;
}

function _renderSalaryBlock(offerText, candId) {
  const detected = _detectSalary(offerText);
  const cands    = ls('sc_cands', []);
  const c        = (cands.find(x => x.id === candId)) || {};
  const savedK   = c.salary_brut_k || null;

  const brutAnnuel = savedK ? savedK * 1000 : (detected ? detected.brut_annuel : null);
  const calc       = brutAnnuel ? _calcSalaryFR(brutAnnuel) : null;
  const inputVal   = brutAnnuel ? Math.round(brutAnnuel / 1000) : '';
  const placeholder = detected ? Math.round(detected.brut_annuel / 1000) : '45';

  return `
    <div style="border:1.5px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:20px">
      <div style="background:var(--bg2);padding:8px 12px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:7px">
        <span style="font-size:13px">💰</span>
        <span style="font-size:12px;font-weight:700;color:var(--ink)">Salaire net estimé</span>
        ${detected && !savedK ? `<span style="font-size:10.5px;color:var(--ink3);margin-left:auto;font-style:italic">Détecté : ${detected.raw}</span>` : ''}
      </div>
      <div style="padding:10px 14px">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:12px;color:var(--ink3);white-space:nowrap">Brut annuel :</span>
          <input id="salary-input-${candId}" type="number" value="${inputVal}" placeholder="${placeholder}"
            min="10" max="500" step="1"
            style="width:64px;padding:4px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;background:var(--bg);color:var(--ink);text-align:center"
            onkeydown="if(event.key==='Enter') window._recalcSalary('${candId}')"
          />
          <span style="font-size:12.5px;color:var(--ink)">K€</span>
          <button onclick="window._recalcSalary('${candId}')"
            style="background:#6366f1;color:white;border:none;border-radius:6px;padding:5px 14px;font-size:12px;font-weight:600;cursor:pointer;transition:opacity .15s"
            onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">
            Calculer
          </button>
        </div>
        <div id="salary-result-${candId}">${calc ? _salaryResultHtml(calc) : `<div style="font-size:12px;color:var(--ink3);margin-top:10px;text-align:center;padding:8px 0">Entre un salaire brut annuel pour voir ton net</div>`}</div>
        ${_renderMarketSalaryBlock(candId, c.market_salary || null)}
      </div>
    </div>`;
}

window._recalcSalary = function(candId) {
  const input = document.getElementById('salary-input-' + candId);
  if (!input) return;
  const kval = parseFloat(input.value);
  if (!kval || kval < 10 || kval > 500) { toast('⚠ Entre un montant entre 10K et 500K€'); return; }

  const cands = ls('sc_cands', []);
  const idx   = cands.findIndex(x => x.id === candId);
  if (idx !== -1) { cands[idx].salary_brut_k = kval; ss('sc_cands', cands); }

  const calc = _calcSalaryFR(kval * 1000);
  const el   = document.getElementById('salary-result-' + candId);
  if (el) el.innerHTML = _salaryResultHtml(calc);
};

// ── LETTRE DE MOTIVATION & RÉPONSES FORMULAIRE ──────────────────────────────

function _renderCoverLetterBlock(candId, cached) {
  const hasGroq   = !!(localStorage.getItem('sc_key'));
  const hasGemini = !!(localStorage.getItem('sc_gemini_key'));

  const header = `
    <div style="background:var(--bg2);padding:8px 12px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:7px;flex-wrap:wrap">
      <span style="font-size:13px">✉️</span>
      <span style="font-size:12px;font-weight:700;color:var(--ink)">Lettre de motivation</span>
      <div style="display:flex;gap:5px;margin-left:auto">
        ${hasGroq   ? `<button id="lm-ai-groq" onclick="window._lmSetProvider('groq')"
          style="padding:2px 9px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;border:1.5px solid var(--border);background:var(--bg);color:var(--ink2)">⚡ Groq</button>` : ''}
        ${hasGemini ? `<button id="lm-ai-gemini" onclick="window._lmSetProvider('gemini')"
          style="padding:2px 9px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;border:1.5px solid var(--border);background:var(--bg);color:var(--ink2)">✦ Gemini</button>` : ''}
        <button onclick="window._genCoverLetter('${candId}')"
          style="background:#0891b2;color:white;border:none;border-radius:6px;padding:3px 12px;font-size:11.5px;font-weight:700;cursor:pointer">
          Générer
        </button>
      </div>
    </div>`;

  if (!cached) {
    return `<div style="border:1.5px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:20px">
      ${header}
      <div style="padding:14px 16px;font-size:12px;color:var(--ink3);text-align:center">
        Génère ta lettre de motivation + réponses aux questions fréquentes des formulaires
      </div>
    </div>`;
  }

  const uid = 'lm-cached-' + candId;
  setTimeout(() => {
    const el = document.getElementById(uid);
    if (el) el.innerHTML = _renderCoverLetterResult(cached);
  }, 0);

  return `<div style="border:1.5px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:20px">
    ${header}
    <div id="${uid}" style="padding:14px 16px"></div>
  </div>`;
}

function _renderCoverLetterResult(d) {
  const tabs = [
    { id:'lettre',   label:'✉️ Lettre' },
    { id:'formules', label:'📋 Formulaire' },
  ];

  const tabBar = `<div style="display:flex;gap:0;border-bottom:1.5px solid var(--border);margin-bottom:14px">
    ${tabs.map((t,i) => `<button onclick="window._lmTab('${t.id}')"
      id="lm-tab-${t.id}"
      style="padding:6px 14px;font-size:11.5px;font-weight:600;border:none;background:none;cursor:pointer;color:${i===0?'#0891b2':'var(--ink3)'};border-bottom:${i===0?'2.5px solid #0891b2':'2.5px solid transparent'}">
      ${t.label}
    </button>`).join('')}
  </div>`;

  // ── Lettre ──
  const lettreHtml = `
    <div style="position:relative">
      <div id="lm-letter-text" contenteditable="true"
        style="font-size:12.5px;line-height:1.75;color:var(--ink);white-space:pre-wrap;background:var(--bg2);border-radius:8px;padding:14px 16px;border:1px solid var(--border);outline:none;cursor:text;transition:border-color .15s"
        onfocus="this.style.borderColor='#0891b2'"
        onblur="this.style.borderColor='var(--border)';window._saveLMEdit('${d._candId||''}','lettre',this.innerText)"
        >${esc(d.lettre||'')}</div>
      <div style="display:flex;gap:7px;margin-top:8px">
        <button onclick="window._copyLM('lm-letter-text')"
          style="background:#0891b2;color:white;border:none;border-radius:6px;padding:4px 14px;font-size:11.5px;font-weight:600;cursor:pointer;flex:1">
          📋 Copier la lettre
        </button>
        <button onclick="window._downloadLMPdf('${d._candId||''}')"
          style="background:#0f172a;color:white;border:none;border-radius:6px;padding:4px 14px;font-size:11.5px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px">
          ⬇ PDF
        </button>
        <button onclick="window._genCoverLetter('${d._candId||''}')"
          style="background:none;border:1.5px solid #0891b2;color:#0891b2;border-radius:6px;padding:4px 10px;font-size:11.5px;font-weight:600;cursor:pointer">
          ↺
        </button>
      </div>
    </div>`;

  // ── Réponses formulaire ──
  const formItems = [
    { key:'pourquoi_poste',     label:'Pourquoi ce poste ?' },
    { key:'pourquoi_entreprise',label:'Pourquoi cette entreprise ?' },
    { key:'pitch_60s',          label:'Parlez-nous de vous (60s)' },
    { key:'pretentions',        label:'Prétentions salariales' },
    { key:'disponibilite',      label:'Disponibilité' },
  ];

  const formulaireHtml = formItems.map(item => {
    const val = (d.formulaire||{})[item.key];
    if (!val) return '';
    return `<div style="margin-bottom:12px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#0891b2;margin-bottom:5px">${item.label}</div>
      <div style="position:relative">
        <div id="lm-form-${item.key}" contenteditable="true"
          style="font-size:12px;line-height:1.6;color:var(--ink);background:var(--bg2);border-radius:7px;padding:9px 11px;border:1px solid var(--border);white-space:pre-wrap;outline:none;cursor:text;transition:border-color .15s"
          onfocus="this.style.borderColor='#0891b2'"
          onblur="this.style.borderColor='var(--border)';window._saveLMEdit('${d._candId||''}','form.${item.key}',this.innerText)"
          >${esc(val)}</div>
        <button onclick="window._copyLM('lm-form-${item.key}')"
          style="position:absolute;top:6px;right:7px;background:none;border:1px solid var(--border);border-radius:5px;padding:2px 8px;font-size:10px;color:var(--ink3);cursor:pointer">
          copier
        </button>
      </div>
    </div>`;
  }).join('');

  return `
    ${tabBar}
    <div id="lm-panel-lettre">${lettreHtml}</div>
    <div id="lm-panel-formules" style="display:none">${formulaireHtml}</div>`;
}

// ── SAUVEGARDE ÉDITION LETTRE ────────────────────────────────
window._saveLMEdit = function(candId, field, value) {
  if (!candId) return;
  const cands = ls('sc_cands', []);
  const idx = cands.findIndex(x => x.id === candId);
  if (idx === -1 || !cands[idx].analysis?.cover_letter) return;
  const cl = cands[idx].analysis.cover_letter;
  if (field === 'lettre') {
    cl.lettre = value;
  } else if (field.startsWith('form.')) {
    const key = field.slice(5);
    if (!cl.formulaire) cl.formulaire = {};
    cl.formulaire[key] = value;
  }
  ss('sc_cands', cands);
};

// ── TÉLÉCHARGER LA LETTRE EN PDF ────────────────────────────
window._downloadLMPdf = function(candId) {
  const el = document.getElementById('lm-letter-text');
  if (!el || !el.textContent.trim()) { toast('Génère d\'abord la lettre'); return; }

  const text = el.textContent.trim();

  // Infos candidature pour le nom du fichier et l'en-tête
  const cands = ls('sc_cands', []);
  const c     = cands.find(x => x.id === candId) || {};
  const poste = c.poste   || '';
  const co    = c.company || '';

  // En-tête expéditeur depuis le profil
  const sender = [
    (P.firstName || '') + ' ' + (P.lastName || ''),
    P.email || '',
    P.phone || '',
    P.location || '',
  ].filter(Boolean).join('  ·  ');

  // Wrapper d'impression
  let wrapper = document.getElementById('cv-print-wrapper');
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.id = 'cv-print-wrapper';
    document.body.appendChild(wrapper);
  }

  wrapper.innerHTML = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;max-width:680px;margin:0 auto;padding:20mm 18mm;color:#1D1D1F;font-size:12pt;line-height:1.75">
      ${sender ? `<div style="font-size:9.5pt;color:#6E6E73;margin-bottom:28px;padding-bottom:12px;border-bottom:1px solid #E5E5EA">${sender}</div>` : ''}
      ${(poste || co) ? `<div style="font-size:9.5pt;color:#6E6E73;margin-bottom:24px"><strong style="color:#1D1D1F">${poste}</strong>${poste && co ? ' — ' : ''}${co}</div>` : ''}
      <div style="white-space:pre-wrap">${text}</div>
    </div>`;

  const originalTitle = document.title;
  const parts = [poste, co].filter(Boolean);
  if (parts.length) document.title = 'Lettre - ' + parts.join(' - ');

  setTimeout(() => {
    window.print();
    setTimeout(() => { document.title = originalTitle; }, 1000);
  }, 80);
};

window._lmProvider = localStorage.getItem('sc_key') ? 'groq' : 'gemini';
window._lmSetProvider = function(p) {
  window._lmProvider = p;
  ['groq','gemini'].forEach(id => {
    const b = document.getElementById('lm-ai-' + id);
    if (!b) return;
    const active = id === p;
    b.style.background  = active ? '#0891b2' : 'var(--bg)';
    b.style.color       = active ? 'white'   : 'var(--ink2)';
    b.style.borderColor = active ? '#0891b2' : 'var(--border)';
  });
};

window._lmTab = function(tab) {
  ['lettre','formules'].forEach(t => {
    const panel = document.getElementById('lm-panel-' + t);
    const btn   = document.getElementById('lm-tab-'   + t);
    if (!panel || !btn) return;
    const active = t === tab;
    panel.style.display    = active ? 'block' : 'none';
    btn.style.color        = active ? '#0891b2' : 'var(--ink3)';
    btn.style.borderBottom = active ? '2.5px solid #0891b2' : '2.5px solid transparent';
  });
};

// ── BLOC FICHE ENTREPRISE ───────────────────────────────────
function _renderCompanyBlock(candId, c) {
  const d = c.companyIntel || null;
  const company = esc(c.company || 'cette entreprise');

  const header = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--ink3);display:flex;align-items:center;gap:6px">
        🏢 Fiche Entreprise
      </div>
      <button onclick="window._genCompanyIntel('${candId}')"
        style="background:#1D1D1F;color:white;border:none;border-radius:7px;padding:5px 13px;font-size:11.5px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px">
        <span>🔍</span> ${d ? 'Actualiser' : 'Rechercher'}
      </button>
    </div>`;

  if (!d) {
    return header + `<div style="font-size:12px;color:var(--ink3);padding:14px;background:var(--bg);border-radius:10px;border:1px dashed var(--border);text-align:center;line-height:1.6">
      Clique sur <strong>🔍 Rechercher</strong> pour générer automatiquement<br>
      <span style="font-size:11px">secteur · concurrents · marché · actualité · enjeux</span>
    </div>`;
  }

  const row = (icon, label, val) => val ? `
    <div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid var(--border2)">
      <span style="font-size:13px;flex-shrink:0">${icon}</span>
      <div style="flex:1">
        <div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--ink3);margin-bottom:2px">${label}</div>
        <div style="font-size:12px;color:var(--ink);line-height:1.6">${esc(val)}</div>
      </div>
    </div>` : '';

  const tags = (icon, label, arr) => arr?.length ? `
    <div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid var(--border2)">
      <span style="font-size:13px;flex-shrink:0">${icon}</span>
      <div style="flex:1">
        <div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--ink3);margin-bottom:5px">${label}</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px">${arr.map(t =>
          `<span style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:2px 9px;font-size:11.5px;font-weight:600;color:var(--ink2)">${esc(t)}</span>`
        ).join('')}</div>
      </div>
    </div>` : '';

  return header + `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:0 12px 4px">
      ${row('🏭','Secteur & activité', d.secteur)}
      ${row('📊','Taille & chiffres clés', d.chiffres)}
      ${tags('⚔️','Concurrents directs', d.concurrents)}
      ${row('📈','Marché & tendances', d.marche)}
      ${row('📰','Actualité récente', d.actualite)}
      ${row('🎯','Enjeux stratégiques', d.enjeux)}
      ${row('💡','Angle pour se démarquer', d.angle)}
    </div>
    <div style="font-size:10px;color:var(--ink3);margin-top:6px;text-align:right">Basé sur les données IA — vérifier l'actualité récente</div>`;
}

window._genCompanyIntel = async function(candId) {
  const block = document.getElementById('split-company-notes-block');
  if (!block) return;

  const cands = ls('sc_cands', []);
  const idx   = cands.findIndex(x => x.id === candId);
  if (idx === -1) return;
  const c = cands[idx];

  block.innerHTML = `<div style="text-align:center;padding:20px;font-size:12px;color:var(--ink3)">
    <div class="sp" style="width:20px;height:20px;margin:0 auto 8px"></div>
    Recherche en cours sur ${esc(c.company||'l\'entreprise')}…
  </div>`;

  const offerSnippet = (c.offerText||c.rawText||'').slice(0,800);
  const prompt = `Tu es un expert en intelligence économique et recrutement. Génère une fiche entreprise complète et précise.

ENTREPRISE : ${c.company || 'inconnue'}
POSTE : ${c.poste || ''}
EXTRAIT OFFRE : ${offerSnippet}

Réponds UNIQUEMENT en JSON valide sans markdown :
{
  "secteur": "Secteur d'activité, modèle économique, positionnement marché (2-3 phrases)",
  "chiffres": "CA estimé, effectifs, année de création, implantations (si connus)",
  "concurrents": ["Concurrent 1", "Concurrent 2", "Concurrent 3", "Concurrent 4"],
  "marche": "Taille du marché, tendances actuelles, croissance, défis du secteur (2-3 phrases)",
  "actualite": "Derniers événements connus : levées de fonds, acquisitions, partenariats, expansions, difficultés (si connu)",
  "enjeux": "Principaux enjeux stratégiques de l'entreprise en lien avec ce poste (2 phrases)",
  "angle": "Comment se démarquer en entretien en montrant qu'on connaît ces enjeux (1 phrase actionnable)"
}`;

  try {
    const raw  = await callGroq(prompt, { maxTokens: 900, temperature: 0.3 });
    const data = safeParseJSON(raw);
    if (!data || !data.secteur) throw new Error('réponse invalide');

    cands[idx].companyIntel = data;
    ss('sc_cands', cands);

    block.innerHTML = _renderCompanyBlock(candId, cands[idx]);
  } catch(e) {
    block.innerHTML = `<div style="padding:12px;background:var(--red-bg);border-radius:8px;color:var(--red);font-size:12px">
      Erreur : ${esc(e.message)} — <button onclick="window._genCompanyIntel('${candId}')"
        style="background:none;border:none;color:var(--red);font-weight:700;cursor:pointer;text-decoration:underline">Réessayer</button>
    </div>`;
  }
};

// ── SAUVEGARDE NOTES ENTREPRISE (legacy) ───────────────────
window._saveCompanyNotes = function(candId, val) {
  if (!candId) return;
  const cands = ls('sc_cands', []);
  const idx   = cands.findIndex(x => x.id === candId);
  if (idx === -1) return;
  cands[idx].companyNotes = val;
  ss('sc_cands', cands);
};

window._copyLM = function(elId) {
  const txt = document.getElementById(elId)?.textContent || '';
  navigator.clipboard.writeText(txt).then(() => toast('📋 Copié !'));
};

window._genCoverLetter = async function(candId) {
  const block = document.getElementById('split-coverletter-block');
  if (!block) return;

  const contentEl = block.querySelector('[id^="lm-cached-"], div[style*="text-align:center"]');
  if (contentEl) contentEl.innerHTML = `<div style="text-align:center;padding:20px;font-size:12px;color:var(--ink3)">
    <div class="sp" style="width:20px;height:20px;margin:0 auto 8px"></div>Rédaction en cours...
  </div>`;

  const cands  = ls('sc_cands', []);
  const c      = cands.find(x => x.id === candId) || {};
  const a      = c.analysis || {};
  const cvText = _buildCVText();
  const offer  = (c.rawOffer || c.description || '').slice(0, 2000);
  const nom    = [P.firstName, P.lastName ? P.lastName.toUpperCase() : ''].filter(Boolean).join(' ') || '';
  const salK   = c.salary_brut_k ? c.salary_brut_k + 'K€ brut/an' : 'à définir selon le package';

  const prompt = `Tu es un expert en recrutement France. Génère une lettre de motivation + réponses formulaire.

PROFIL :
${cvText.slice(0, 1000)}
Nom : ${nom}

OFFRE :
Poste : ${c.poste || a.poste || ''}
Entreprise : ${c.entreprise || a.entreprise || ''}
${offer ? `Extrait :\n${offer.slice(0,800)}` : ''}
Points forts matchés : ${(a.points_forts||[]).slice(0,3).join(', ')}

Réponds UNIQUEMENT en JSON valide :
{
  "lettre": "lettre complète prête à envoyer (200-250 mots, ton confiant 'Je vous choisis' pas suppliant, intro accroche → match → preuve concrète du CV → CTA, PAS de 'passionné par' ni langue corporate, en français)",
  "formulaire": {
    "pourquoi_poste": "3-4 phrases spécifiques au poste (pas générique)",
    "pourquoi_entreprise": "2-3 phrases avec un élément concret sur l'entreprise",
    "pitch_60s": "pitch de 60 secondes parlé, naturel, basé sur le CV réel",
    "pretentions": "réponse courte et professionnelle incluant ${salK}",
    "disponibilite": "réponse courte (préavis typique 1-3 mois)"
  }
}`;

  try {
    const provider = window._lmProvider || 'groq';
    const text     = await (provider === 'gemini' ? callGemini : callGroq)(prompt, { maxTokens: 1800, temperature: 0.5 });
    const d        = safeParseJSON(text);
    if (!d || !d.lettre) throw new Error('Réponse invalide');

    d._candId = candId;

    // Sauvegarde
    const cands2 = ls('sc_cands', []);
    const idx2   = cands2.findIndex(x => x.id === candId);
    if (idx2 !== -1) {
      if (!cands2[idx2].analysis) cands2[idx2].analysis = {};
      cands2[idx2].analysis.cover_letter = d;
      ss('sc_cands', cands2);
    }

    if (contentEl) {
      contentEl.id = 'lm-cached-' + candId;
      contentEl.innerHTML = _renderCoverLetterResult(d);
    }
    toast('✓ Lettre générée !');
  } catch(err) {
    if (contentEl) contentEl.innerHTML = `<div style="color:#dc2626;font-size:12px;padding:12px">⚠ Erreur : ${esc(err.message||String(err))}</div>`;
  }
};

// ── PRÉPARATION ENTRETIEN — BLOC F ──────────────────────────────────────────

function _renderInterviewBlock(candId, cached) {
  const hasGroq   = !!(localStorage.getItem('sc_key'));
  const hasGemini = !!(localStorage.getItem('sc_gemini_key'));

  const header = `
    <div style="background:var(--bg2);padding:8px 12px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:7px;flex-wrap:wrap">
      <span style="font-size:13px">🎯</span>
      <span style="font-size:12px;font-weight:700;color:var(--ink)">Préparation entretien</span>
      <div style="display:flex;gap:5px;margin-left:auto">
        ${hasGroq   ? `<button id="itw-ai-groq" onclick="window._itwSetProvider('groq')"
          style="padding:2px 9px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;border:1.5px solid var(--border);background:var(--bg);color:var(--ink2)">⚡ Groq</button>` : ''}
        ${hasGemini ? `<button id="itw-ai-gemini" onclick="window._itwSetProvider('gemini')"
          style="padding:2px 9px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;border:1.5px solid var(--border);background:var(--bg);color:var(--ink2)">✦ Gemini</button>` : ''}
        <button onclick="window._launchInterviewPrep('${candId}')"
          style="background:#7c3aed;color:white;border:none;border-radius:6px;padding:3px 12px;font-size:11.5px;font-weight:700;cursor:pointer">
          Générer
        </button>
      </div>
    </div>`;

  if (!cached) {
    return `<div style="border:1.5px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:20px">
      ${header}
      <div style="padding:14px 16px;font-size:12px;color:var(--ink3);text-align:center">
        Génère ta préparation complète : stories STAR+R, questions probables, points de vigilance
      </div>
    </div>`;
  }

  const uid = 'itw-cached-' + candId;
  setTimeout(() => {
    const el = document.getElementById(uid);
    if (el) el.innerHTML = _renderInterviewResult(cached);
  }, 0);

  return `<div style="border:1.5px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:20px">
    ${header}
    <div id="${uid}" style="padding:14px 16px"></div>
  </div>`;
}

function _renderInterviewResult(d) {
  // ── 1. Tabs navigation ──
  const tabs = [
    { id:'stories',    label:'📖 Stories STAR+R' },
    { id:'questions',  label:'❓ Questions' },
    { id:'ask',        label:'💬 À poser' },
    { id:'vigilance',  label:'⚠ Vigilance' },
  ];

  const tabBar = `<div style="display:flex;gap:0;border-bottom:1.5px solid var(--border);margin-bottom:14px">
    ${tabs.map((t,i) => `<button onclick="window._itwTab('${t.id}')"
      id="itw-tab-${t.id}"
      style="padding:6px 12px;font-size:11.5px;font-weight:600;border:none;background:none;cursor:pointer;color:${i===0?'#7c3aed':'var(--ink3)'};border-bottom:${i===0?'2.5px solid #7c3aed':'2.5px solid transparent'};white-space:nowrap">
      ${t.label}
    </button>`).join('')}
  </div>`;

  // ── 2. Stories STAR+R ──
  const storiesHtml = (d.stories||[]).map((s,i) => `
    <div style="border:1.5px solid var(--border);border-radius:9px;overflow:hidden;margin-bottom:10px">
      <div style="background:#faf5ff;padding:7px 12px;display:flex;align-items:center;justify-content:space-between;cursor:pointer"
        onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
        <div>
          <span style="font-size:12px;font-weight:700;color:#6d28d9">${esc(s.titre||'')}</span>
          <span style="font-size:10.5px;color:#7c3aed;margin-left:8px;background:#ede9fe;padding:1px 7px;border-radius:100px">${esc(s.couvre||'')}</span>
        </div>
        <span style="font-size:11px;color:var(--ink3)">▾</span>
      </div>
      <div style="padding:10px 13px;font-size:12px;line-height:1.6;display:block">
        ${[
          ['S — Situation', s.S],
          ['T — Tâche',     s.T],
          ['A — Action',    s.A],
          ['R — Résultat',  s.R],
          ['✦ Réflexion',   s.reflexion],
        ].map(([lbl,val]) => val ? `<div style="margin-bottom:6px">
          <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#7c3aed">${lbl}</span>
          <div style="color:var(--ink);margin-top:2px">${esc(val)}</div>
        </div>` : '').join('')}
      </div>
    </div>`).join('') || '<div style="color:var(--ink3);font-size:12px">Aucune story générée</div>';

  // ── 3. Questions ──
  const qTypes = [
    { key:'recruteur',      label:'🔍 Recruteur / RH',    col:'#1d4ed8', bg:'#eff6ff' },
    { key:'hiring_manager', label:'👔 Hiring Manager',    col:'#7c3aed', bg:'#faf5ff' },
    { key:'technique',      label:'⚙ Technique / Métier', col:'#0f766e', bg:'#f0fdf4' },
  ];
  const questionsHtml = qTypes.map(qt => {
    const qs = (d.questions||{})[qt.key] || [];
    if (!qs.length) return '';
    return `<div style="margin-bottom:12px">
      <div style="font-size:10.5px;font-weight:700;padding:4px 9px;border-radius:6px;background:${qt.bg};color:${qt.col};display:inline-block;margin-bottom:7px">${qt.label}</div>
      ${qs.map(q => `<div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:6px;padding:7px 10px;background:var(--bg2);border-radius:7px;font-size:12px;color:var(--ink)">
        <span style="color:${qt.col};font-weight:700;flex-shrink:0">Q</span>
        <span style="line-height:1.5">${esc(q)}</span>
      </div>`).join('')}
    </div>`;
  }).join('');

  // ── 4. Questions à poser ──
  const askHtml = (d.questions_a_poser||[]).map(q => `
    <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:7px;padding:8px 10px;background:#f5f3ff;border-radius:7px;border-left:3px solid #7c3aed">
      <span style="font-size:12px;color:#7c3aed;font-weight:700;flex-shrink:0">→</span>
      <span style="font-size:12px;color:var(--ink);line-height:1.5">${esc(q)}</span>
    </div>`).join('') || '<div style="color:var(--ink3);font-size:12px">Aucune question générée</div>';

  // ── 5. Points de vigilance ──
  const vigilHtml = (d.points_vigilance||[]).map(p => `
    <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:7px;padding:8px 10px;background:#fef3c7;border-radius:7px;border-left:3px solid #f59e0b">
      <span style="font-size:12px;color:#b45309;font-weight:700;flex-shrink:0">⚠</span>
      <span style="font-size:12px;color:var(--ink);line-height:1.5">${esc(p)}</span>
    </div>`).join('') || '<div style="color:var(--ink3);font-size:12px">Aucun point identifié</div>';

  return `
    ${tabBar}
    <div id="itw-panel-stories"   style="display:block">${storiesHtml}</div>
    <div id="itw-panel-questions" style="display:none">${questionsHtml}</div>
    <div id="itw-panel-ask"       style="display:none">${askHtml}</div>
    <div id="itw-panel-vigilance" style="display:none">${vigilHtml}</div>`;
}

window._itwProvider = localStorage.getItem('sc_key') ? 'groq' : 'gemini';
window._itwSetProvider = function(p) {
  window._itwProvider = p;
  ['groq','gemini'].forEach(id => {
    const b = document.getElementById('itw-ai-' + id);
    if (!b) return;
    const active = id === p;
    b.style.background  = active ? '#7c3aed' : 'var(--bg)';
    b.style.color       = active ? 'white'   : 'var(--ink2)';
    b.style.borderColor = active ? '#7c3aed' : 'var(--border)';
  });
};

window._itwTab = function(tab) {
  ['stories','questions','ask','vigilance'].forEach(t => {
    const panel = document.getElementById('itw-panel-' + t);
    const btn   = document.getElementById('itw-tab-'   + t);
    if (!panel || !btn) return;
    const active = t === tab;
    panel.style.display    = active ? 'block' : 'none';
    btn.style.color        = active ? '#7c3aed'                  : 'var(--ink3)';
    btn.style.borderBottom = active ? '2.5px solid #7c3aed'      : '2.5px solid transparent';
  });
};

window._launchInterviewPrep = async function(candId) {
  const overlay = document.querySelector(`#itw-cached-${candId}, [id^="itw-cached-"]`);
  // Cherche le conteneur du bloc entretien
  const block = document.getElementById('split-interview-block');
  if (!block) return;

  // Met à jour le contenu du bloc avec spinner
  const inner = block.querySelector('[id^="itw-cached-"], div[style*="padding:14px"]');
  const spinTarget = inner || block.querySelector('div:last-child');
  if (spinTarget) spinTarget.innerHTML = `<div style="text-align:center;padding:20px;font-size:12px;color:var(--ink3)">
    <div class="sp" style="width:20px;height:20px;margin:0 auto 8px"></div>Analyse en cours — génération des stories STAR+R...
  </div>`;

  const cands = ls('sc_cands', []);
  const c     = cands.find(x => x.id === candId) || {};
  const a     = c.analysis || {};
  const cvText    = _buildCVText();
  const offerText = (c.rawOffer || c.description || '').slice(0, 2000);

  const prompt = `Tu es un coach carrière expert France. Génère une préparation d'entretien complète et personnalisée.

CV DU CANDIDAT :
${cvText.slice(0, 1200)}

OFFRE CIBLÉE :
Poste : ${c.poste || a.poste || ''}
Entreprise : ${c.entreprise || a.entreprise || ''}
Séniorité : ${a.seniorite || ''}
${offerText ? `Extrait offre :\n${offerText}` : ''}
${(a.lacunes||[]).length ? `Lacunes identifiées : ${a.lacunes.map(l=>l.competence||l).join(', ')}` : ''}

Réponds UNIQUEMENT en JSON valide :
{
  "stories": [
    {
      "titre": "titre court de la story",
      "couvre": "exigence de l'offre couverte",
      "S": "Situation en 1-2 phrases",
      "T": "Tâche / objectif en 1 phrase",
      "A": "Actions concrètes en 2-3 phrases",
      "R": "Résultat chiffré si possible",
      "reflexion": "Ce que j'en ai appris / ce que je ferais différemment (signal séniorité)"
    }
  ],
  "questions": {
    "recruteur": ["question 1", "question 2", "question 3"],
    "hiring_manager": ["question 1", "question 2", "question 3"],
    "technique": ["question 1", "question 2", "question 3"]
  },
  "questions_a_poser": [
    "question intelligente à poser à l'interviewer 1",
    "question intelligente à poser à l'interviewer 2",
    "question intelligente à poser à l'interviewer 3"
  ],
  "points_vigilance": [
    "lacune ou point difficile à préparer avec stratégie de réponse",
    "point 2"
  ]
}

Règles :
- 5 stories STAR+R minimum, chacune couvrant une exigence différente de l'offre
- Stories basées sur les VRAIES expériences du CV — pas inventées
- La Réflexion est obligatoire : c'est ce qui distingue un junior d'un senior
- Questions en français, réalistes pour le secteur supply chain
- Questions à poser : spécifiques à l'entreprise/poste, pas génériques
- Points de vigilance : honnêtes, avec suggestion de mitigation concrète`;

  try {
    const provider = window._itwProvider || 'groq';
    const text     = await (provider === 'gemini' ? callGemini : callGroq)(prompt, { maxTokens: 2500, temperature: 0.4 });
    const d        = safeParseJSON(text);
    if (!d || !d.stories) throw new Error('Réponse invalide de l\'IA');

    // Sauvegarde
    const cands2 = ls('sc_cands', []);
    const idx2   = cands2.findIndex(x => x.id === candId);
    if (idx2 !== -1) {
      if (!cands2[idx2].analysis) cands2[idx2].analysis = {};
      cands2[idx2].analysis.interview_prep = d;
      ss('sc_cands', cands2);
    }

    // Re-render le bloc complet
    const headerEl = block.querySelector('[style*="background:var(--bg2)"]');
    const contentEl = block.querySelector('[id^="itw-cached-"], div[style*="padding:14px"]');
    if (contentEl) {
      contentEl.id = 'itw-cached-' + candId;
      contentEl.innerHTML = _renderInterviewResult(d);
    }
    toast('✓ Préparation entretien générée !');
  } catch(err) {
    if (spinTarget) spinTarget.innerHTML = `<div style="color:#dc2626;font-size:12px;padding:12px">⚠ Erreur : ${esc(err.message||String(err))}</div>`;
  }
};

// ── SALAIRE MARCHÉ (Bloc D) ──────────────────────────────────────────────────

function _renderMarketSalaryBlock(candId, cached) {
  const hasGroq   = !!(localStorage.getItem('sc_key'));
  const hasGemini = !!(localStorage.getItem('sc_gemini_key'));

  const aiPicker = `
    <div style="display:flex;align-items:center;gap:5px;margin-bottom:7px">
      <span style="font-size:10.5px;color:var(--ink3);font-weight:600">IA :</span>
      ${hasGroq   ? `<button id="mkt-ai-groq" onclick="window._mktSetProvider('groq')"
        style="padding:2px 8px;border-radius:5px;font-size:10.5px;font-weight:700;cursor:pointer;border:1.5px solid var(--border);background:var(--bg);color:var(--ink2)">⚡ Groq</button>` : ''}
      ${hasGemini ? `<button id="mkt-ai-gemini" onclick="window._mktSetProvider('gemini')"
        style="padding:2px 8px;border-radius:5px;font-size:10.5px;font-weight:700;cursor:pointer;border:1.5px solid var(--border);background:var(--bg);color:var(--ink2)">✦ Gemini</button>` : ''}
      <button onclick="window._fetchMarketSalary('${candId}')"
        style="margin-left:auto;background:#0f766e;color:white;border:none;border-radius:6px;padding:3px 11px;font-size:11px;font-weight:700;cursor:pointer">
        📊 Analyser le marché
      </button>
    </div>`;

  let resultHtml = cached
    ? _renderMarketResult(cached, candId)
    : `<div style="font-size:11.5px;color:var(--ink3);text-align:center;padding:5px 0">Lance l'analyse pour voir la fourchette marché</div>`;

  return `
    <div style="border-top:1.5px dashed var(--border);margin-top:10px;padding-top:10px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#0f766e;margin-bottom:7px">📊 Salaire marché</div>
      ${aiPicker}
      <div id="market-result-${candId}">${resultHtml}</div>
    </div>`;
}

function _renderMarketResult(d, candId) {
  const offre = (() => {
    const c = ls('sc_cands', []).find(x => x.id === candId) || {};
    return c.salary_brut_k ? c.salary_brut_k * 1000 : null;
  })();

  // Positionnement de l'offre vs marché
  let posHtml = '';
  if (offre && d.median) {
    const pct = Math.round((offre - d.median) / d.median * 100);
    const { label, col, bg } =
      offre < d.fourchette_min * 0.95  ? { label:'⚠ Sous le marché',      col:'#dc2626', bg:'#fef2f2' } :
      offre > d.fourchette_max * 1.05  ? { label:'✦ Au-dessus du marché', col:'#7c3aed', bg:'#f5f3ff' } :
                                          { label:'✓ Dans la fourchette',  col:'#16a34a', bg:'#f0fdf4' };
    posHtml = `<div style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:100px;background:${bg};color:${col};font-size:11.5px;font-weight:700;margin-bottom:8px">
      ${label} (${pct > 0 ? '+' : ''}${pct}% vs médiane)
    </div>`;
  }

  // Barre visuelle min-médiane-max
  const min = d.fourchette_min || 0;
  const max = d.fourchette_max || 0;
  const med = d.median || (min + max) / 2;
  const medPct = max > min ? Math.round((med - min) / (max - min) * 100) : 50;
  const offrePct = (offre && max > min) ? Math.min(100, Math.max(0, Math.round((offre - min) / (max - min) * 100))) : null;

  const barHtml = max > 0 ? `
    <div style="margin:10px 0 6px">
      <div style="position:relative;height:8px;background:#e2e8f0;border-radius:100px">
        <div style="position:absolute;left:0;top:0;height:100%;width:100%;background:linear-gradient(90deg,#d1fae5,#6ee7b7,#34d399);border-radius:100px;opacity:.7"></div>
        <!-- Médiane -->
        <div style="position:absolute;top:-3px;height:14px;width:2px;background:#0f766e;border-radius:2px;left:${medPct}%"></div>
        ${offrePct !== null ? `<div title="Ton offre" style="position:absolute;top:-4px;width:10px;height:16px;background:#6366f1;border-radius:3px;left:calc(${offrePct}% - 5px)"></div>` : ''}
      </div>
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--ink3);margin-top:4px">
        <span>${Math.round(min/1000)}K€</span>
        <span style="color:#0f766e;font-weight:700">médiane ${Math.round(med/1000)}K€</span>
        <span>${Math.round(max/1000)}K€</span>
      </div>
    </div>` : '';

  // Légende
  const legendHtml = offrePct !== null ? `<div style="display:flex;gap:12px;font-size:10px;color:var(--ink3);margin-bottom:8px">
    <span><span style="display:inline-block;width:8px;height:8px;background:#0f766e;border-radius:2px;margin-right:3px"></span>Médiane marché</span>
    <span><span style="display:inline-block;width:8px;height:8px;background:#6366f1;border-radius:2px;margin-right:3px"></span>Ton offre</span>
  </div>` : '';

  // Notes françaises
  const notesHtml = (d.notes||[]).length ? `
    <div style="margin-top:7px;display:flex;flex-direction:column;gap:3px">
      ${d.notes.map(n => `<div style="font-size:11px;color:var(--ink2);line-height:1.4">• ${esc(n)}</div>`).join('')}
    </div>` : '';

  // Demande du poste
  const demandeCol = d.demande === 'forte' ? '#16a34a' : d.demande === 'moyenne' ? '#d97706' : '#dc2626';
  const demandHtml = d.demande ? `<span style="padding:2px 8px;border-radius:100px;font-size:10.5px;font-weight:600;background:${demandeCol}18;color:${demandeCol};border:1px solid ${demandeCol}44">Demande ${d.demande}</span>` : '';

  return `
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:7px;padding:8px 10px">
      <div style="display:flex;align-items:center;gap:5px;margin-bottom:5px;flex-wrap:wrap">
        <span style="font-size:11.5px;font-weight:700;color:#166534">${esc(d.poste_label||'')}</span>
        ${demandHtml}
        <button onclick="window._fetchMarketSalary('${candId}')" title="Relancer" style="margin-left:auto;background:none;border:none;color:#0f766e;cursor:pointer;font-size:12px;padding:0">↺</button>
      </div>
      ${posHtml}
      ${barHtml}
      ${legendHtml}
      ${notesHtml}
      <div style="font-size:9px;color:var(--ink3);margin-top:6px">Sources estimées : WTTJ, APEC, Glassdoor, Talent.io · Données IA</div>
    </div>`;
}

window._mktProvider = localStorage.getItem('sc_key') ? 'groq' : 'gemini';
window._mktSetProvider = function(provider) {
  window._mktProvider = provider;
  ['groq','gemini'].forEach(p => {
    const b = document.getElementById('mkt-ai-' + p);
    if (!b) return;
    const active = p === provider;
    b.style.background  = active ? '#0f766e' : 'var(--bg)';
    b.style.color       = active ? 'white'   : 'var(--ink2)';
    b.style.borderColor = active ? '#0f766e' : 'var(--border)';
  });
};

window._fetchMarketSalary = async function(candId) {
  const el = document.getElementById('market-result-' + candId);
  if (!el) return;
  el.innerHTML = `<div style="text-align:center;padding:12px;font-size:12px;color:var(--ink3)">
    <div class="sp" style="width:16px;height:16px;margin:0 auto 6px"></div>Recherche en cours...
  </div>`;

  const cands = ls('sc_cands', []);
  const c     = cands.find(x => x.id === candId) || {};
  const a     = c.analysis || {};
  const offer = (c.rawOffer || c.description || '').slice(0, 1500);

  const prompt = `Tu es un expert RH France. Analyse le marché salarial pour ce poste.

POSTE : ${c.poste || a.poste || ''}
ENTREPRISE : ${c.entreprise || a.entreprise || ''}
SECTEUR : ${a.domaine || ''}
SÉNIORITÉ : ${a.seniorite || ''}
EXTRAIT OFFRE : ${offer.slice(0, 800)}

Réponds UNIQUEMENT en JSON valide :
{
  "poste_label": "titre normalisé du poste",
  "fourchette_min": <entier en €>,
  "fourchette_max": <entier en €>,
  "median": <entier en €>,
  "demande": "forte|moyenne|faible",
  "notes": [
    "note courte sur 13e mois / variable / intéressement si courant dans ce secteur",
    "note sur convention collective applicable si pertinent (ex: SYNTEC, Métallurgie...)",
    "note sur CDI/CDD fréquence",
    "note sur télétravail / avantages courants"
  ]
}

Règles :
- Fourchette réaliste France 2025 (sources WTTJ, APEC, Glassdoor, Talent.io)
- Adapter à la région si mentionnée dans l'offre (Paris > province ~15%)
- Maximum 4 notes, concises (1 phrase chacune)
- Si pas assez d'info, donne quand même une estimation raisonnable`;

  try {
    const provider = window._mktProvider || 'groq';
    const text     = await (provider === 'gemini' ? callGemini : callGroq)(prompt, { maxTokens: 400, temperature: 0.3 });
    const d        = safeParseJSON(text);
    if (!d || !d.fourchette_min) throw new Error('Données incomplètes');

    // Persiste
    const cands2 = ls('sc_cands', []);
    const idx2   = cands2.findIndex(x => x.id === candId);
    if (idx2 !== -1) { cands2[idx2].market_salary = d; ss('sc_cands', cands2); }

    el.innerHTML = _renderMarketResult(d, candId);
  } catch(err) {
    el.innerHTML = `<div style="color:#dc2626;font-size:12px;padding:8px">⚠ ${esc(err.message||String(err))}</div>`;
  }
};

// ── LINKEDIN OUTREACH ───────────────────────────────────────────────────────

function _renderLinkedInBlock(candId, cached) {
  const types = [
    { id:'recruiter',   label:'Recruteur',       emoji:'🔍' },
    { id:'hiring_mgr',  label:'Hiring Manager',  emoji:'👔' },
    { id:'peer',        label:'Collègue',        emoji:'🤝' },
    { id:'interviewer', label:'Intervieweur',    emoji:'🎯' },
  ];

  const hasGroq   = !!(localStorage.getItem('sc_key') || '');
  const hasGemini = !!(localStorage.getItem('sc_gemini_key') || '');

  // Boutons IA (comme l'analyse career-ops)
  const aiButtons = `
    <div style="display:flex;gap:6px;margin-bottom:8px">
      ${hasGroq ? `<button id="li-ai-groq" onclick="window._liSetProvider('${candId}','groq')"
        style="padding:3px 10px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;border:1.5px solid var(--border);background:var(--bg);color:var(--ink2);transition:all .15s">
        ⚡ Groq</button>` : ''}
      ${hasGemini ? `<button id="li-ai-gemini" onclick="window._liSetProvider('${candId}','gemini')"
        style="padding:3px 10px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;border:1.5px solid var(--border);background:var(--bg);color:var(--ink2);transition:all .15s">
        ✦ Gemini</button>` : ''}
    </div>`;

  const btnRow = types.map(t => `
    <button onclick="window._genLinkedIn('${candId}','${t.id}')"
      id="li-btn-${t.id}"
      style="display:flex;align-items:center;gap:5px;padding:5px 11px;border:1.5px solid var(--border);border-radius:8px;background:var(--bg);color:var(--ink2);font-size:11.5px;font-weight:600;cursor:pointer;transition:all .15s"
      onmouseover="this.style.borderColor='#0077b5';this.style.color='#0077b5'"
      onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--ink2)'">
      ${t.emoji} ${t.label}
    </button>`).join('');

  let cachedHtml = '';
  if (cached) {
    cachedHtml = `<div id="li-result-${candId}">${_renderLinkedInResult(cached)}</div>`;
  } else {
    cachedHtml = `<div id="li-result-${candId}" style="font-size:12px;color:var(--ink3);text-align:center;padding:8px 0">
      Choisis le type de contact pour générer le message
    </div>`;
  }

  return `
    <div style="border:1.5px solid #0077b5;border-radius:12px;overflow:hidden;margin-bottom:20px">
      <div style="background:#EFF6FF;padding:8px 12px;border-bottom:1px solid #BFDBFE;display:flex;align-items:center;gap:7px">
        <span style="font-size:14px">💼</span>
        <span style="font-size:12px;font-weight:700;color:#1e40af">Message LinkedIn</span>
        <span style="font-size:10.5px;color:#3b82f6;margin-left:auto">max 300 caractères</span>
      </div>
      <div style="padding:10px 14px">
        ${aiButtons}
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">${btnRow}</div>
        ${cachedHtml}
      </div>
    </div>`;
}

function _renderLinkedInResult(data) {
  // data = { type, message, type_label }
  const charCount = (data.message||'').length;
  const over = charCount > 300;
  return `
    <div style="background:#F0F9FF;border:1.5px solid #BAE6FD;border-radius:8px;padding:10px 12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#0369a1">${esc(data.type_label||'')}</span>
        <span style="font-size:10.5px;font-weight:600;color:${over?'#dc2626':'#0369a1'}">${charCount}/300</span>
      </div>
      <div id="li-msg-text" style="font-size:12.5px;color:#0c4a6e;line-height:1.6;white-space:pre-wrap">${esc(data.message||'')}</div>
      <div style="display:flex;gap:7px;margin-top:8px">
        <button onclick="window._copyLinkedIn()"
          style="background:#0077b5;color:white;border:none;border-radius:6px;padding:4px 12px;font-size:11.5px;font-weight:600;cursor:pointer;flex:1">
          📋 Copier
        </button>
        <button onclick="window._regenLinkedIn()"
          style="background:none;border:1.5px solid #0077b5;color:#0077b5;border-radius:6px;padding:4px 10px;font-size:11.5px;font-weight:600;cursor:pointer">
          ↺
        </button>
      </div>
    </div>`;
}

// Provider LinkedIn (groq par défaut si dispo, sinon gemini)
window._liProvider = localStorage.getItem('sc_key') ? 'groq' : 'gemini';

window._liSetProvider = function(candId, provider) {
  window._liProvider = provider;
  // Highlight bouton actif
  ['groq','gemini'].forEach(p => {
    const b = document.getElementById('li-ai-' + p);
    if (!b) return;
    const active = p === provider;
    b.style.background   = active ? '#0077b5' : 'var(--bg)';
    b.style.color        = active ? 'white'   : 'var(--ink2)';
    b.style.borderColor  = active ? '#0077b5' : 'var(--border)';
  });
};

window._genLinkedIn = async function(candId, contactType) {
  const typeLabels = { recruiter:'Recruteur', hiring_mgr:'Hiring Manager', peer:'Collègue', interviewer:'Intervieweur' };
  const el = document.getElementById('li-result-' + candId);
  if (!el) return;

  // Highlight bouton contact actif
  document.querySelectorAll('[id^="li-btn-"]').forEach(b => {
    const active = b.id === 'li-btn-' + contactType;
    b.style.background  = active ? '#EFF6FF'      : 'var(--bg)';
    b.style.borderColor = active ? '#0077b5'      : 'var(--border)';
    b.style.color       = active ? '#0077b5'      : 'var(--ink2)';
  });
  el.innerHTML = `<div style="text-align:center;padding:14px;font-size:12px;color:var(--ink3)">
    <div class="sp" style="width:18px;height:18px;margin:0 auto 6px"></div>Génération en cours...
  </div>`;

  const cands = ls('sc_cands', []);
  const c = cands.find(x => x.id === candId) || {};
  const a = c.analysis || {};
  const cvText = _buildCVText();
  const offerSnippet = (c.rawOffer || c.description || '').slice(0, 1200);

  const frameworks = {
    recruiter:   `3 phrases max : 1) Fit direct (rôle, expérience clé, dispo) 2) Preuve chiffrée qui répond aux questions de screening avant qu'elles soient posées 3) CTA "Ravi de partager mon CV si ça correspond"`,
    hiring_mgr:  `3 phrases max : 1) Challenge spécifique de leur équipe extrait de l'offre 2) Ta meilleure réalisation chiffrée prouvant que tu as résolu des problèmes similaires 3) CTA curiosité sur leur approche — PAS de demande d'emploi directe`,
    peer:        `3 phrases max : 1) Référence sincère à leur poste/secteur 2) Ce que tu fais dans le même domaine (PAS un pitch d'emploi) 3) CTA conversation sur un sujet commun — Ne JAMAIS demander un emploi`,
    interviewer: `3 phrases légères : 1) Référence à leur parcours ou secteur 2) Lien léger avec ton expérience 3) "Hâte de notre échange" — Ton détendu, pas désespéré`,
  };

  const prompt = `Tu génères un message LinkedIn de prise de contact pour une candidature supply chain.

PROFIL (extrait CV) :
${cvText.slice(0, 800)}

OFFRE :
Poste : ${c.poste || a.poste || ''}
Entreprise : ${c.entreprise || a.entreprise || ''}
Extrait : ${offerSnippet}

TYPE DE CONTACT : ${typeLabels[contactType]}
FRAMEWORK : ${frameworks[contactType]}

RÈGLES ABSOLUES :
- Maximum 300 caractères
- En français
- Zéro langue corporate ("passionné par", "profil idéal", "n'hésitez pas")
- Concret, direct, humain

Réponds UNIQUEMENT avec le message, sans guillemets, sans intro.`;

  try {
    const provider = window._liProvider || 'groq';
    const callFn   = provider === 'gemini' ? callGemini : callGroq;
    const text     = await callFn(prompt, { maxTokens: 200, temperature: 0.7 });
    const msg      = (text || '').trim().replace(/^["«»]|["«»]$/g, '');

    // Sauvegarde par candidature
    const cands2 = ls('sc_cands', []);
    const idx2   = cands2.findIndex(x => x.id === candId);
    if (idx2 !== -1) {
      if (!cands2[idx2].linkedin_msgs) cands2[idx2].linkedin_msgs = {};
      cands2[idx2].linkedin_msgs[contactType] = { type: contactType, type_label: typeLabels[contactType], message: msg };
      ss('sc_cands', cands2);
    }

    window._lastLinkedInData = { candId, contactType };
    el.innerHTML = _renderLinkedInResult({ type: contactType, type_label: typeLabels[contactType], message: msg });
  } catch(err) {
    el.innerHTML = `<div style="color:#dc2626;font-size:12px;padding:8px">⚠ Erreur : ${esc(err.message||String(err))}</div>`;
  }
};

window._copyLinkedIn = function() {
  const txt = document.getElementById('li-msg-text')?.textContent || '';
  navigator.clipboard.writeText(txt).then(() => toast('📋 Message copié !'));
};

window._regenLinkedIn = function() {
  const d = window._lastLinkedInData;
  if (d) window._genLinkedIn(d.candId, d.contactType);
};

async function openSplitView(candId) {
  const c = ls('sc_cands', []).find(x => x.id === candId);
  if (!c) return;
  window._splitCandId = candId;

  // ── CV adapté — panneau droit (sync) ──
  const a = c.analysis || {};
  _cvTarget = a.poste || c.poste;
  localStorage.setItem('sc_cv_target', _cvTarget);
  // Base IA + sélections manuelles persistées par candidature
  const _aiBase = [...(a.keywords_present||[]),...(a.must_have||[]),...(a.nice_to_have||[])].filter(Boolean);
  const _manualAdded    = c.manual_matched_skills   || [];
  const _manualDeselect = c.manual_deselected_skills || [];
  _matchedSkills = [...new Set([..._aiBase, ..._manualAdded])];
  localStorage.setItem('sc_matched_skills', JSON.stringify(_matchedSkills));
  if (typeof _deselectedSkills !== 'undefined') {
    _deselectedSkills = [..._manualDeselect];
    _deselectedSkills.length
      ? localStorage.setItem('sc_deselected_skills', JSON.stringify(_deselectedSkills))
      : localStorage.removeItem('sc_deselected_skills');
  }

  // Applique les overrides per-offre pour le rendu initial
  const openOverrides = _getCVOverrides(candId);
  const openApplied   = Object.keys(openOverrides).length ? _applyOverridesToP(openOverrides) : false;
  renderCV();
  if (openApplied) _restoreP();
  const cvDoc = document.getElementById('cv-doc');
  document.getElementById('split-right-panel').innerHTML = cvDoc
    ? `<div style="box-shadow:0 6px 32px rgba(0,0,0,.13);border-radius:6px;overflow:hidden">${cvDoc.outerHTML.replace(/\bid="cv-doc"[^>]*/, 'id="cv-doc-split"')}</div>`
    : `<div style="color:var(--ink3);padding:24px;font-size:13px">CV non disponible — complète ton profil.</div>`;
  if (openApplied) renderCV(); // restaure cv-doc principal

  // ── Barre du haut ──
  document.getElementById('split-modal-title').textContent = c.poste + ' · ' + c.company;
  document.getElementById('split-modal-sub').textContent   = c.date || '';

  // ── Sélecteur de template ──
  if (typeof _updateSplitTplPicker === 'function') _updateSplitTplPicker(P.cvTemplate || 'classique');

  // ── Statut letters dans le header ──
  const statusEl = document.getElementById('split-status-letters');
  if (statusEl) {
    statusEl.innerHTML = renderStatusLetters(c.id, c.status, 'updCandAndRefreshSplit');
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  // Bouton "Voir l'annonce" avec badge source
  const jobLinkEl = document.getElementById('split-job-link');
  if (jobLinkEl) {
    if (c.jobUrl) {
      const srcConf = c.jobSource === 'linkedin'
        ? { bg: '#0a66c2', label: 'LinkedIn' }
        : c.jobSource === 'indeed'
        ? { bg: '#2164f3', label: 'Indeed' }
        : { bg: '#374151', label: 'Annonce' };
      jobLinkEl.innerHTML = `
        <a href="${esc(c.jobUrl)}" target="_blank" rel="noopener"
           style="display:inline-flex;align-items:center;gap:6px;background:${srcConf.bg};color:white;border:none;border-radius:8px;cursor:pointer;font-size:12.5px;padding:5px 14px;font-weight:600;text-decoration:none;white-space:nowrap">
          <span style="font-size:10px;background:rgba(255,255,255,.22);border-radius:4px;padding:1px 5px;font-weight:800">${srcConf.label}</span>
          Voir l'annonce ↗
        </a>`;
    } else {
      jobLinkEl.innerHTML = '';
    }
  }
  // ── Bouton LinkedIn ──
  const liBtn = document.getElementById('split-linkedin-btn');
  if (liBtn && c.company) {
    liBtn.style.display = 'inline-flex';
    window._openLinkedInContact = () => {
      const q = encodeURIComponent(c.company + ' recruteur OR talent acquisition OR RH OR responsable recrutement');
      window.open('https://www.linkedin.com/search/results/people/?keywords=' + q, '_blank');
    };
  } else if (liBtn) {
    liBtn.style.display = 'none';
  }

  // ── Panneau gauche ──
  const rawText     = (c.jobDescription||'').replace(/&nbsp;/g,' ').replace(/[ \t]{3,}/g,' ').trim();

  // Invalide le cache si c'est l'ancien format (utilisait "attentes" au lieu de "profil_recherche"
  // ou si les items n'ont pas de champ "attente" — nouveau format)
  const _isNewFormat = (d) => {
    if (!d) return false;
    if (d.attentes) return false; // ancien champ
    const items = (d.profil_recherche || d.missions || []);
    if (!items.length) return true;
    // Format actuel : doit avoir un tableau "tags"
    if (!Array.isArray(items[0].tags)) return false;
    return true;
  };
  const cachedRaw       = a.ai_decode || null;
  const cachedDecode    = _isNewFormat(cachedRaw) ? cachedRaw : null;
  const cachedProvider  = cachedDecode ? (a.ai_decode_provider || null) : null;
  // Pas de déclenchement auto — on affiche le texte d'abord, l'IA se lance sur clic
  const decodeLoading = false;

  document.getElementById('split-left-panel').innerHTML = `
    <div id="split-job-card" style="margin-bottom:20px">
      <div style="background:var(--bg);border:1.5px solid var(--border);border-radius:12px;padding:14px 16px;display:flex;align-items:center;gap:8px">
        <span class="sp" style="width:13px;height:13px;flex-shrink:0"></span>
        <span style="font-size:12.5px;color:var(--ink3)">Chargement des infos du poste et du trajet...</span>
      </div>
    </div>
    <div id="split-decode-panel" style="margin-bottom:20px">
      ${_renderDecodePanelHtml(cachedDecode, false, cachedProvider, null, rawText)}
    </div>
    <div id="split-ai-analysis" style="margin-bottom:20px">
      ${_renderAIAnalysisBlock(candId, a.career_ops || null)}
    </div>
    <div id="split-coverletter-block" style="margin-bottom:20px">
      ${_renderCoverLetterBlock(candId, a.cover_letter || null)}
    </div>
    <div id="split-linkedin-block" style="margin-bottom:20px">
      ${_renderLinkedInBlock(candId, (() => { const msgs = a.linkedin_msgs || c.linkedin_msgs; return msgs ? Object.values(msgs).slice(-1)[0] : null; })())}
    </div>
    <div id="split-salary-block" style="margin-bottom:20px">
      ${_renderSalaryBlock(rawText, candId)}
    </div>
    <div id="split-interview-block" style="margin-bottom:20px">
      ${_renderInterviewBlock(candId, a.interview_prep || null)}
    </div>

    <div id="split-company-notes-block" style="margin-bottom:8px">
      ${_renderCompanyBlock(candId, c)}
    </div>
`;

  // Déclenchement auto uniquement si déjà en cache (pas de spinner au chargement)
  if (false) {
    _aiDecodeOffer(rawText, c.poste).then(({ data, provider, model }) => {
      const cands2 = ls('sc_cands', []);
      const idx2   = cands2.findIndex(x => x.id === candId);
      if (idx2 !== -1) {
        if (!cands2[idx2].analysis) cands2[idx2].analysis = {};
        cands2[idx2].analysis.ai_decode = data;
        cands2[idx2].analysis.ai_decode_provider = provider;
        ss('sc_cands', cands2);
      }
      const panel = document.getElementById('split-decode-panel');
      if (panel) panel.innerHTML = _renderDecodePanelHtml(data, false, provider, model, rawText);
    }).catch(err => {
      console.error('_aiDecodeOffer error:', err);
      const panel = document.getElementById('split-decode-panel');
      if (!panel) return;
      const msg = err?.message || String(err);
      panel.innerHTML = `
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 14px">
          <div style="font-size:12.5px;font-weight:700;color:#dc2626;margin-bottom:4px">⚠ Décodage IA échoué</div>
          <div style="font-size:12px;color:#b91c1c;line-height:1.5;margin-bottom:10px">${esc(msg)}</div>
          <button onclick="window._retryDecode('${candId}')"
            style="background:#dc2626;color:white;border:none;border-radius:6px;padding:5px 13px;font-size:12px;font-weight:700;cursor:pointer">
            ↺ Réessayer
          </button>
        </div>`;
    });
  }

  // ── Emphases manuelles ──
  setTimeout(() => {
    _setupEmphasisSelection();
    // Strip les spans statiques de renderBulletHtml (data-cv-em) AVANT de
    // reposer les interactifs (data-emphasis) — évite le badge en double
    const _splitEl = document.getElementById('cv-doc-split');
    if (_splitEl) {
      _splitEl.querySelectorAll('span[data-cv-em]').forEach(s =>
        s.replaceWith(document.createTextNode(s.textContent))
      );
    }
    _applyEmphases(candId);
  }, 200);

  // ── Ouvrir le modal ──
  document.getElementById('split-modal-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // ── Données structurées — depuis l'analyse locale (0 API) ──
  let jobInfo = {
    title:        a.poste        || c.poste    || '',
    company:      a.entreprise   || c.company  || '',
    location:     a.location     || c.jobLocation  || '',
    salary:       a.salary       || c.jobSalary    || '',
    contractType: a.contractType || c.jobContract  || '',
    remote:       a.remote       || '',
    benefits:     a.benefits     || [],
    rating:       a.rating       || '',
  };
  // Fallback : si l'analyse n'a pas de données, on essaie l'extraction locale rapide
  if (!jobInfo.location && rawText) {
    const loc = extractJobInfoLocal ? extractJobInfoLocal(rawText) : {};
    if (loc.location)     jobInfo.location     = loc.location;
    if (loc.salary)       jobInfo.salary       = loc.salary;
    if (loc.contractType) jobInfo.contractType = loc.contractType;
    if (loc.remote)       jobInfo.remote       = loc.remote;
  }
  const commute = await _getCommuteFromCreteil(jobInfo.location);

  // ── Mini dashboard ──
  const card = document.getElementById('split-job-card');
  if (!card) return;

  const infoBlocks = [];
  if (jobInfo.salary)       infoBlocks.push({icon:'💰',label:'Salaire',val:jobInfo.salary});
  if (jobInfo.contractType) infoBlocks.push({icon:'📄',label:'Contrat',val:jobInfo.contractType});
  if (jobInfo.remote)       infoBlocks.push({icon:'🏠',label:'Télétravail',val:jobInfo.remote});

  const mapsBase = commute?.mapsBase || `https://www.google.com/maps/dir/Créteil,94000,France/${encodeURIComponent((jobInfo.location||c.company)+', France')}`;

  // Tout en une seule ligne compacte
  const commuteStr = commute
    ? `🚗 <strong>${commute.min} min</strong> · ${commute.km} km · <a href="${mapsBase}" target="_blank" rel="noopener" style="color:var(--teal-d);font-weight:600;text-decoration:none">🚇 transport →</a>`
    : `<a href="${mapsBase}" target="_blank" rel="noopener" style="color:var(--teal-d);font-weight:600;text-decoration:none">🗺️ Trajet →</a>`;

  const chips = [
    jobInfo.salary       && `<span style="background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;border-radius:6px;padding:2px 8px;font-size:11.5px;font-weight:600">💰 ${esc(jobInfo.salary)}</span>`,
    jobInfo.contractType && `<span style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:6px;padding:2px 8px;font-size:11.5px;font-weight:600">📄 ${esc(jobInfo.contractType)}</span>`,
    jobInfo.remote       && `<span style="background:#f5f3ff;color:#6d28d9;border:1px solid #ddd6fe;border-radius:6px;padding:2px 8px;font-size:11.5px;font-weight:600">🏠 ${esc(jobInfo.remote)}</span>`,
    jobInfo.location     && `<span style="background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;border-radius:6px;padding:2px 8px;font-size:11.5px;font-weight:600">📍 ${esc(jobInfo.location)}</span>`,
  ].filter(Boolean).join('');

  const benefitsHtml = (jobInfo.benefits?.length) ? `
    <div style="margin-top:6px;font-size:11px;color:var(--ink3)">✨ ${jobInfo.benefits.map(b=>esc(b)).join(' · ')}</div>` : '';

  card.innerHTML = `
    <div style="border:1.5px solid var(--border);border-radius:10px;padding:10px 14px">
      <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:5px">
        <span style="font-size:14px;font-weight:800;color:var(--ink)">${esc(c.poste)}</span>
        <span style="font-size:12px;color:var(--ink3);font-weight:600">${esc(c.company)}</span>
        ${jobInfo.rating ? `<span style="background:#fef3c7;color:#92400e;border-radius:100px;padding:1px 7px;font-size:11px;font-weight:700">★ ${esc(jobInfo.rating)}</span>` : ''}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:${commute||jobInfo.location?'6':'0'}px">${chips}</div>
      ${jobInfo.location ? `<div style="font-size:11.5px;color:var(--ink3)">${commuteStr}</div>` : ''}
      ${benefitsHtml}
    </div>`;
}


function closeSplitView() {
  document.getElementById('split-modal-overlay').classList.add('hidden');
  document.body.style.overflow = '';
}


// ── CSV EXPORT ─────────────────────────────────────────────
function exportCSV() {
  const cands = ls('sc_cands', []);
  if (!cands.length) { toast('Aucune candidature à exporter'); return; }
  const headers = ['Entreprise','Poste','Date','Statut','Notes'];
  const rows = cands.map(c => [c.company,c.poste,c.date,c.status,c.notes].map(v => `"${(v||'').replace(/"/g,'""')}"`).join(';'));
  const csv = [headers.join(';'), ...rows].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a'); a.href = url; a.download = 'candidatures-supply.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Export CSV téléchargé');
}

function toggleLiDesc() {
  const descEl  = document.getElementById('li-prev-desc');
  const fadeEl  = document.getElementById('li-prev-fade');
  const togEl   = document.getElementById('li-prev-toggle');
  const expanded = descEl.style.maxHeight === 'none' || parseInt(descEl.style.maxHeight) > 52;
  if (expanded) {
    descEl.style.maxHeight = '52px';
    if (fadeEl) fadeEl.style.display = 'block';
    togEl.textContent = '▼ Voir plus';
  } else {
    descEl.style.maxHeight = 'none';
    if (fadeEl) fadeEl.style.display = 'none';
    togEl.textContent = '▲ Réduire';
  }
}

// ── GÉNÉRATEUR MESSAGE LINKEDIN ────────────────────────────
