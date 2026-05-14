// ── TRACKER ────────────────────────────────────────────────
let _trackerFilter    = 'Tous';
let _pasteTimer       = null;
let _lastAnalysisResult = null;   // gardé pour addCand()

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

        // Score badge
        const sc = c.score;
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
            <button onclick="loadCVForCand('${c.id}')" style="background:none;border:1.5px solid var(--teal-border);cursor:pointer;color:var(--teal-d);font-size:11px;font-weight:700;padding:3px 8px;border-radius:100px;margin-right:3px" title="Voir le CV adapté à cette offre">CV</button><button onclick="loadCVForCand('${c.id}', true)" style="background:none;border:1.5px solid var(--border);cursor:pointer;color:var(--ink3);font-size:11px;font-weight:600;padding:3px 8px;border-radius:100px;margin-right:3px" title="Télécharger PDF">⬇ PDF</button>` : ''}<button onclick="delCand('${c.id}')" style="background:none;border:none;cursor:pointer;color:var(--ink3);font-size:18px;line-height:1;padding:2px 6px;border-radius:4px" onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--ink3)'">×</button></td>
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
  const score       = _lastAnalysisResult?.score_global ?? _lastAnalysisResult?.score ?? null;
  cands.push({
    id: Date.now().toString(),
    company: co, poste,
    date:           document.getElementById('f-date').value,
    status:         document.getElementById('f-status').value,
    notes:          document.getElementById('f-notes').value.trim(),
    indeedUrl:      indeedUrlEl?.value.trim() || '',
    jobDescription: pasteEl?.dataset.desc || '',
    score,
    analysis:       _lastAnalysisResult || null
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

  ta.dataset.desc = text.substring(0, 2000);

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
    analysisEl.innerHTML += `<div style="color:var(--red);font-size:13px;padding:4px 0">⚠ Analyse échouée — l'annonce reste enregistrée sans score.</div>`;
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
