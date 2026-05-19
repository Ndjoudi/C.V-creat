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
    if (posteEl && job.title)   posteEl.value = job.title;
    if (coEl    && job.company) coEl.value    = job.company;

    // Affiche la fiche formatée
    document.getElementById('li-prev-title').textContent   = job.title   || '—';
    document.getElementById('li-prev-company').textContent = job.company || '—';
    document.getElementById('li-prev-location').textContent = job.location ? '📍 ' + job.location : '';
    document.getElementById('li-prev-desc').textContent    = job.descText;
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
    status:         'À traiter',
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

  document.getElementById('tracker-table').innerHTML = `
    <table class="tbl">
      <thead><tr>
        <th>Poste · Entreprise</th><th>Score</th><th>Date</th><th>Statut</th><th>Notes</th><th></th>
      </tr></thead>
      <tbody>${visible.map(c => {
        const [col, bg, border] = STAT_COLORS[c.status] || ['var(--ink3)', 'var(--bg)', 'var(--border)'];

        // Score badge — priorité à l'analyse la plus récente
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

        return `<tr>
          <td>
            <div style="font-weight:700;color:var(--ink);font-size:13px">${esc(c.poste)}</div>
            <div style="color:var(--ink3);font-size:12px;margin-top:1px">${esc(c.company)}${indeedLink ? ' · ' + indeedLink : ''}</div>
          </td>
          <td>${scoreBadge}</td>
          <td style="color:var(--ink3);font-size:12.5px">${c.date || ''}</td>
          <td><select style="background:${bg};border:1.5px solid ${border};border-radius:100px;color:${col};font-size:12px;font-weight:700;padding:3px 9px;cursor:pointer;outline:none" onchange="updCand('${c.id}','status',this.value)">${
            STATS.map(s => `<option${s === c.status ? ' selected' : ''}>${s}</option>`).join('')
          }</select></td>
          <td class="notes-cell" onclick="openNoteModal('${esc(c.company)}','${esc(c.poste)}',\`${(c.notes||'').replace(/`/g,"'")}\`)" title="Cliquer pour voir">${esc(c.notes) || '<span style="opacity:.4">—</span>'}</td>
          <td style="white-space:nowrap">${c.analysis ? `
            <button onclick="loadCVForCand('${c.id}')" style="background:none;border:1.5px solid var(--teal-border);cursor:pointer;color:var(--teal-d);font-size:11px;font-weight:700;padding:3px 8px;border-radius:100px;margin-right:3px" title="Voir le CV adapté à cette offre">CV</button><button onclick="loadCVForCand('${c.id}', true)" style="background:none;border:1.5px solid var(--border);cursor:pointer;color:var(--ink3);font-size:11px;font-weight:600;padding:3px 8px;border-radius:100px;margin-right:3px" title="Télécharger PDF">⬇ PDF</button>` : ''}<button onclick="openInterviewForCand('${c.id}')" style="background:none;border:1.5px solid #e9d5ff;cursor:pointer;color:#7c3aed;font-size:11px;font-weight:700;padding:3px 8px;border-radius:100px;margin-right:3px" title="Simuler l'entretien pour ce poste">🎤 Entretien</button><button onclick="delCand('${c.id}')" style="background:none;border:none;cursor:pointer;color:var(--ink3);font-size:18px;line-height:1;padding:2px 6px;border-radius:4px" onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--ink3)'">×</button></td>
        </tr>`;
      }).join('')}</tbody>
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
    if (p.title)   document.getElementById('f-poste').value = p.title;
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
  refreshBadges();
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

  // Ré-applique les emphases visuelles (badges/soulignements) après le re-render
  if (candId) setTimeout(() => _applyEmphases(candId), 0);
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

      // Retire le toolbar si sélection vide
      if (!text || text.length < 2) {
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
    <span style="color:#d1d5db;font-size:16px;line-height:1">|</span>
    <button data-em="remove"
      style="background:none;border:none;color:#9ca3af;font-size:11px;cursor:pointer;padding:2px 4px;font-weight:600"
      title="Retirer la mise en avant sur ce texte">✕</button>`;

  document.body.appendChild(toolbar);

  // Clic sur une option
  toolbar.querySelectorAll('button[data-em]').forEach(btn => {
    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      const type = btn.dataset.em;
      const candId = window._splitCandId;
      if (!candId) return;

      const overrides = _getCVOverrides(candId);
      if (!overrides.emphases) overrides.emphases = [];

      if (type === 'remove') {
        overrides.emphases = overrides.emphases.filter(em =>
          !(em.text.toLowerCase() === text.toLowerCase() &&
            (em.expIdx === expIdx || (em.expIdx == null && expIdx == null)))
        );
      } else {
        // Évite les doublons (même texte + même scope)
        overrides.emphases = overrides.emphases.filter(em =>
          !(em.text.toLowerCase() === text.toLowerCase() && em.expIdx === expIdx)
        );
        // expIdx = null → s'applique à toute la section où on a sélectionné
        overrides.emphases.push({ text, type, expIdx });
      }

      _saveCVOverrides(candId, overrides);
      toolbar.remove();
      window.getSelection()?.removeAllRanges();
      _applyEmphases(candId);
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
  const overrides = _getCVOverrides(candId);
  const emphases  = overrides.emphases || [];
  const cvSplit   = document.getElementById('cv-doc-split');
  if (!cvSplit || !emphases.length) return;

  emphases.forEach(em => {
    // Si l'emphase était dans une expérience précise → scope limité à ce bloc
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

  // Styles visuels
  const pillStyle       = 'background:#ede9fe;color:#5b21b6;border-radius:100px;padding:1px 9px;font-weight:700;font-size:.92em;border:1px solid #ddd6fe;cursor:pointer';
  const underlineStyle  = 'font-weight:800;border-bottom:2.5px solid #6366f1;padding-bottom:1px;cursor:pointer';

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
    span.style.cssText    = type === 'pill' ? pillStyle : underlineStyle;
    span.onclick = e => {
      e.stopPropagation();
      // 1. Suppression immédiate du span dans le DOM (feedback visuel instantané)
      const frag = document.createTextNode(span.textContent);
      span.parentNode?.replaceChild(frag, span);
      // 2. Met à jour les overrides sauvegardés
      const ov = _getCVOverrides(candId);
      ov.emphases = (ov.emphases || []).filter(em => em.text.toLowerCase() !== phrase.toLowerCase());
      _saveCVOverrides(candId, ov);
      // 3. Re-render complet pour synchroniser proprement
      setTimeout(() => _refreshSplitCV(), 0);
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

    // Bullets éditables + bouton supprimer
    exp.querySelectorAll('.cv-bullet-item').forEach(item => {
      const textSpan = item.querySelector('span:not(.cv-bullet-dot)');
      if (textSpan) {
        textSpan.contentEditable = 'true';
        textSpan.style.cssText += ';outline:1px dashed #6366f1;border-radius:3px;padding:0 2px';
      }
      const rm = document.createElement('button');
      rm.textContent = '×';
      rm.style.cssText = 'background:none;border:none;color:#dc2626;cursor:pointer;font-weight:700;font-size:14px;padding:0 0 0 5px;line-height:1;vertical-align:middle;flex-shrink:0';
      rm.onclick = e => { e.stopPropagation(); item.remove(); };
      item.style.display = 'flex';
      item.style.alignItems = 'baseline';
      item.appendChild(rm);
    });

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

  const dot = document.createElement('span');
  dot.className = 'cv-bullet-dot';
  dot.textContent = '▸';

  const textSpan = document.createElement('span');
  textSpan.contentEditable = 'true';
  textSpan.style.cssText = 'outline:1px dashed #6366f1;border-radius:3px;padding:0 2px;flex:1';
  textSpan.textContent = text;

  const rm = document.createElement('button');
  rm.textContent = '×';
  rm.style.cssText = 'background:none;border:none;color:#dc2626;cursor:pointer;font-weight:700;font-size:14px;padding:0 0 0 5px;line-height:1;vertical-align:middle;flex-shrink:0';
  rm.onclick = e => { e.stopPropagation(); li.remove(); };

  li.appendChild(dot);
  li.appendChild(textSpan);
  li.appendChild(rm);
  ul.appendChild(li);
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
      const textSpan = item.querySelector('span:not(.cv-bullet-dot)');
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
        ${showBtn ? `<div style="display:flex;gap:6px;flex-shrink:0">
          <button onclick="window._retryDecode('${candId}','groq')"
            style="background:#fff7ed;color:#c2410c;border:1.5px solid #fed7aa;border-radius:7px;padding:6px 13px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">
            🟠 Groq</button>
          <button onclick="window._retryDecode('${candId}','gemini')"
            style="background:#f5f3ff;color:#7c3aed;border:1.5px solid #ddd6fe;border-radius:7px;padding:6px 13px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">
            🟣 Gemini</button>
        </div>` : ''}
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

  html += `<div style="border-top:2px solid var(--border);padding-top:14px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div style="font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--ink3)">Analyse IA</div>
      <div style="display:flex;align-items:center;gap:6px">
        ${providerBadge}
        <button onclick="window._retryDecode(window._splitCandId,'groq')"
          style="background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;border-radius:6px;font-size:10.5px;padding:2px 8px;cursor:pointer;font-weight:700" title="Relancer avec Groq">🟠</button>
        <button onclick="window._retryDecode(window._splitCandId,'gemini')"
          style="background:#f5f3ff;color:#7c3aed;border:1px solid #ddd6fe;border-radius:6px;font-size:10.5px;padding:2px 8px;cursor:pointer;font-weight:700" title="Relancer avec Gemini">🟣</button>
      </div>
    </div>`;

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

  // Blocs décodés directement (le texte brut est déjà affiché au-dessus)
  html += renderMissionsBlock(data.missions);
  html += renderProfilBlock(data.profil_recherche);

  // ── Compétences clés à mettre en avant ───────────────────
  if (data.competences_cles?.length) {
    const existing = (P.customSkills || []).map(s => s.toLowerCase());

    html += `
    <div style="border-top:1.5px solid var(--border);padding-top:10px;margin-bottom:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:#6366f1">À mettre en avant</div>
        <button onclick="window._addSelectedSkills()"
          style="background:#6366f1;color:white;border:none;border-radius:6px;padding:3px 12px;font-size:11px;font-weight:700;cursor:pointer">
          ➕ Ajouter la sélection
        </button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${data.competences_cles.map((c) => {
          const alreadyIn = existing.includes(c.toLowerCase());
          const safeVal   = esc(c);
          if (alreadyIn) {
            return `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:100px;font-size:12px;font-weight:600;background:#f0fdf4;color:#16a34a;border:1.5px solid #bbf7d0">
              ✓ ${safeVal}
            </span>`;
          }
          return `<label style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:100px;font-size:12px;font-weight:600;background:#f5f3ff;color:#4f46e5;border:1.5px solid #c7d2fe;cursor:pointer;user-select:none"
            onmousedown="this.style.background=this.querySelector('input').checked?'#f5f3ff':'#ede9fe'"
            onmouseup="this.style.background=this.querySelector('input').checked?'#ede9fe':'#f5f3ff'">
            <input type="checkbox" data-skill="${safeVal}"
              style="width:12px;height:12px;accent-color:#6366f1;cursor:pointer;flex-shrink:0" />
            ${safeVal}
          </label>`;
        }).join('')}
      </div>
    </div>`;
  }

  // ── Mots-clés littéraux ───────────────────────────────────
  if (data.keywords?.length) {
    html += `
    <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px;border-top:1.5px solid var(--border);padding-top:10px">
      <span style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:#6366f1;margin-right:4px;white-space:nowrap">Mots-clés</span>
      ${data.keywords.map(k =>
        `<span style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:100px;padding:2px 9px;font-size:11.5px;font-weight:600">${esc(k)}</span>`
      ).join('')}
    </div>`;
  }

  // ── 3 accroches suggérées (placeholder async) ────────────
  const _hookCandId = window._splitCandId || '';
  html += `
  <div id="hook-proposals-${_hookCandId}" style="border-top:2px solid var(--border);margin-top:14px;padding-top:14px">
    <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:#0ea5e9;margin-bottom:8px">
      ✦ 3 accroches suggérées pour ce poste
    </div>
    <div style="font-size:12px;color:var(--ink3);display:flex;align-items:center;gap:6px">
      <span class="sp" style="width:11px;height:11px;display:inline-block"></span>Génération en cours…
    </div>
  </div>`;

  // Lance la génération async (met à jour le DOM quand prêt)
  if (_hookCandId && !isLoading) {
    setTimeout(() => _generateHookProposals(_hookCandId, data), 0);
  }

  html += `</div>`; // ferme la partie 3

  return html;
}

// ── GÉNÉRATION ASYNC DES ACCROCHES ────────────────────────
function _renderHookProposalsHtml(proposals) {
  if (!proposals || !proposals.length) return '<div style="font-size:12px;color:var(--ink3)">Aucune accroche générée.</div>';
  return `
  <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:#0ea5e9;margin-bottom:10px">
    ✦ 3 accroches suggérées pour ce poste
  </div>
  <div style="display:flex;flex-direction:column;gap:7px">
    ${proposals.map(p => {
      const safe = esc(p);
      const escaped = p.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'\\"');
      return `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;
        background:#f0f9ff;border:1.5px solid #bae6fd;border-radius:8px;padding:9px 12px">
        <span style="font-size:12.5px;color:#0369a1;font-weight:500;flex:1;line-height:1.4">${safe}</span>
        <button onclick="navigator.clipboard.writeText('${escaped}');
          this.textContent='✓ Copié !';this.style.background='#16a34a';
          setTimeout(()=>{this.textContent='Copier';this.style.background='#0ea5e9'},1500)"
          style="background:#0ea5e9;color:white;border:none;border-radius:6px;
            padding:5px 11px;font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0">
          Copier
        </button>
      </div>`;
    }).join('')}
  </div>
  <div style="font-size:10.5px;color:var(--ink3);margin-top:8px">
    Colle-la dans ton profil → champ "Domaines / Phrase d'accroche"
  </div>`;
}

async function _generateHookProposals(candId, data) {
  const el = document.getElementById('hook-proposals-' + candId);
  if (!el) return;

  // Vérifie le cache (version 2 du prompt — on invalide l'ancien cache v1)
  const cands = ls('sc_cands', []);
  const c = cands.find(x => x.id === candId);
  if (c?.analysis?.hookProposals?.length && c?.analysis?.hookProposalsV === 5) {
    el.innerHTML = _renderHookProposalsHtml(c.analysis.hookProposals);
    return;
  }

  try {
    const mTags = (data.missions || []).flatMap(m => m.tags || []).filter(t => t && t.length > 2);
    const pTags = (data.profil_recherche || []).flatMap(m => m.tags || []).filter(t => t && t.length > 2);
    const contexte = data.contexte || '';
    const jobTitle = c?.poste || '';

    // Filtre les tags : on enlève les noms d'entreprise/produit (présents dans contexte)
    const contexteWords = contexte.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    const filterBrand = (tags) => tags.filter(t => {
      const tl = t.toLowerCase();
      return !contexteWords.some(w => tl.includes(w));
    });
    const cleanMTags = filterBrand([...new Set(mTags)]).slice(0, 6);
    const cleanPTags = filterBrand([...new Set(pTags)]).slice(0, 4);

    const prompt = `Tu es expert en personal branding et recrutement. Génère 3 accroches DIFFÉRENTES pour la section PROFIL d'un CV.

OBJECTIF : Donner envie au recruteur de continuer à lire le CV et de décrocher son téléphone.

PROFIL CANDIDAT : En fin de Master Supply Chain — PPA Business School, disponible octobre 2026
POSTE CIBLÉ : ${jobTitle}
CE QUE LE POSTE DEMANDE : ${cleanMTags.join(', ')}${cleanPTags.length ? ' / ' + cleanPTags.join(', ') : ''}

FORMAT : Chaque accroche = 2 phrases courtes qui fonctionnent ensemble (35 à 50 mots au total)
- Phrase 1 : qui je suis + mon positionnement fort (pas "étudiant(e)", commence par la valeur)
- Phrase 2 : ce que j'apporte concrètement à CE poste spécifique, pourquoi me choisir

RÈGLES STRICTES :
- JAMAIS de nom d'entreprise, de marque, de produit ou de lieu
- BANNIR ABSOLUMENT ces formulations clichées que tous les candidats utilisent :
  "rigoureux(se)", "orienté(e) résultats", "passionné(e) par", "spécialisé(e) en",
  "dynamique", "motivé(e)", "polyvalent(e)", "sens du travail en équipe",
  "autonome", "force de proposition", "à l'écoute"
- Remplace les adjectifs creux par des FAITS CONCRETS, des DOMAINES PRÉCIS, des ACTIONS
- Pas de "Futur(e) diplômé(e)" — trop faible. Commence par un fait ou une compétence tangible
- Les 3 propositions doivent être vraiment différentes (angle différent : expertise / ambition / impact)

EXEMPLES DU STYLE ATTENDU (concrets, sans clichés) :
"Master Supply Chain PPA 2026, formé(e) à la planification des approvisionnements et à la gestion des stocks. Je cherche à appliquer ces compétences terrain dès octobre 2026 sur un poste à impact opérationnel."
"Deux ans de formation supply chain orientée flux et pilotage fournisseurs — je veux prendre en charge vos approvisionnements et contribuer directement à la performance de votre chaîne logistique dès octobre 2026."
"En fin de Master Supply Chain à PPA, avec une formation axée sur l'optimisation des flux et la coordination logistique. Disponible octobre 2026 pour un poste où je peux agir vite et créer de la valeur."

Réponds UNIQUEMENT avec un JSON valide : ["accroche 1", "accroche 2", "accroche 3"]`;

    const { text } = await callAIAuto(prompt, { maxTokens: 400, temperature: 0.7 });
    let proposals = null;
    try { proposals = safeParseJSON(text); } catch(e) { /* ignore */ }
    if (!Array.isArray(proposals) || !proposals.length) {
      // Fallback : extrait les strings du texte brut
      const matches = text.match(/"([^"]{15,120})"/g);
      if (matches) proposals = matches.map(m => m.replace(/^"|"$/g, '')).slice(0, 3);
    }
    if (!Array.isArray(proposals) || !proposals.length) throw new Error('parse failed');

    // Cache dans la candidature
    const cands2 = ls('sc_cands', []);
    const idx = cands2.findIndex(x => x.id === candId);
    if (idx !== -1) {
      if (!cands2[idx].analysis) cands2[idx].analysis = {};
      cands2[idx].analysis.hookProposals = proposals;
      cands2[idx].analysis.hookProposalsV = 5;
      ss('sc_cands', cands2);
    }

    const el2 = document.getElementById('hook-proposals-' + candId);
    if (el2) el2.innerHTML = _renderHookProposalsHtml(proposals);

  } catch(e) {
    const el2 = document.getElementById('hook-proposals-' + candId);
    if (el2) el2.innerHTML = `<div style="font-size:11.5px;color:var(--ink3)">⚠ Génération échouée — ${esc(e.message)}</div>`;
  }
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

async function openSplitView(candId) {
  const c = ls('sc_cands', []).find(x => x.id === candId);
  if (!c) return;
  window._splitCandId = candId;

  // ── CV adapté — panneau droit (sync) ──
  const a = c.analysis || {};
  _cvTarget = a.poste || c.poste;
  localStorage.setItem('sc_cv_target', _cvTarget);
  _matchedSkills = [...(a.keywords_present||[]),...(a.must_have||[]),...(a.nice_to_have||[])].filter(Boolean);
  localStorage.setItem('sc_matched_skills', JSON.stringify(_matchedSkills));
  // Reset des désélections manuelles au changement d'offre
  if (typeof _deselectedSkills !== 'undefined') { _deselectedSkills = []; localStorage.removeItem('sc_deselected_skills'); }

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
    <div id="split-decode-panel" style="margin-bottom:28px">
      ${_renderDecodePanelHtml(cachedDecode, false, cachedProvider, null, rawText)}
    </div>`;

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
