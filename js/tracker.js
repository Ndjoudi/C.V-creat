// ── TRACKER ────────────────────────────────────────────────
let _trackerFilter = 'Tous';
let _pasteTimer    = null;

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
        <th>Entreprise</th><th>Poste</th><th>Date</th><th>Statut</th><th>Notes</th><th></th>
      </tr></thead>
      <tbody>${visible.map(c => {
        const [col, bg, border] = STAT_COLORS[c.status] || ['var(--ink3)', 'var(--bg)', 'var(--border)'];
        const indeedLink = c.indeedUrl
          ? `<a href="${esc(c.indeedUrl)}" target="_blank" rel="noopener" title="Voir l'annonce Indeed" style="display:inline-flex;align-items:center;gap:3px;font-size:11px;color:#2164f3;text-decoration:none;font-weight:600;white-space:nowrap">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="11" height="11" fill="#2164f3"><path d="M8.5 5.5A2.5 2.5 0 0 1 11 3h2a2.5 2.5 0 0 1 0 5h-1v8.5A1.5 1.5 0 0 1 10.5 18H10a1.5 1.5 0 0 1-1.5-1.5V5.5zM12 6h-1a.5.5 0 0 0 0 1h1a.5.5 0 0 0 0-1z"/></svg>
              Indeed</a>` : '';
        return `<tr>
          <td style="font-weight:700;color:var(--ink)">${esc(c.company)}${indeedLink ? '<br><span style="font-weight:400">' + indeedLink + '</span>' : ''}</td>
          <td style="color:var(--ink2)">${esc(c.poste)}</td>
          <td style="color:var(--ink3);font-size:12.5px">${c.date || ''}</td>
          <td><select style="background:${bg};border:1.5px solid ${border};border-radius:100px;color:${col};font-size:12px;font-weight:700;padding:3px 9px;cursor:pointer;outline:none" onchange="updCand('${c.id}','status',this.value)">${
            STATS.map(s => `<option${s === c.status ? ' selected' : ''}>${s}</option>`).join('')
          }</select></td>
          <td class="notes-cell" onclick="openNoteModal('${esc(c.company)}','${esc(c.poste)}',\`${(c.notes||'').replace(/`/g,"'")}\`)" title="Cliquer pour voir la note complète">${esc(c.notes) || '<span style="opacity:.4">—</span>'}</td>
          <td><button onclick="delCand('${c.id}')" style="background:none;border:none;cursor:pointer;color:var(--ink3);font-size:18px;line-height:1;padding:2px 6px;border-radius:4px;transition:var(--t)" onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--ink3)'">×</button></td>
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
    jobDescription: pasteEl?.dataset.desc || ''
  });
  ss('sc_cands', cands);
  document.getElementById('f-co').value    = '';
  document.getElementById('f-poste').value = '';
  document.getElementById('f-notes').value = '';
  if (indeedUrlEl) indeedUrlEl.value = '';
  const pasteEl = document.getElementById('f-paste-text');
  if (pasteEl) { pasteEl.value = ''; delete pasteEl.dataset.desc; }
  document.getElementById('f-paste-status').textContent = '';
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

  status.style.color = 'var(--ink3)';
  status.innerHTML   = '<span class="sp" style="width:12px;height:12px;display:inline-block;margin-right:6px"></span>Analyse en cours...';

  try {
    const raw = await callGroq(
      `Tu es un assistant RH expert. Extrais les informations structurées de cette annonce d'emploi.

ANNONCE:
${text.substring(0, 5000)}

Réponds UNIQUEMENT en JSON valide (pas de markdown):
{"title":"","company":"","location":"","salary":"","contractType":"","description":""}

- title    : intitulé exact du poste
- company  : nom de l'entreprise
- location : ville / département
- salary   : fourchette salariale si mentionnée, sinon ""
- contractType : CDI / CDD / Stage / Alternance / Freelance
- description  : résumé du poste en 2-3 phrases max`,
      { maxTokens: 400, temperature: 0 }
    );
    const p = safeParseJSON(raw);

    if (p.title)   document.getElementById('f-poste').value = p.title;
    if (p.company) document.getElementById('f-co').value    = p.company;

    // Stocke le texte complet pour usage IA ultérieur
    ta.dataset.desc = text.substring(0, 2000);

    const parts = [p.title, p.company, p.location, p.contractType, p.salary].filter(Boolean);
    status.style.color = 'var(--teal-d)';
    status.innerHTML   = `<strong>✓</strong> ${esc(parts.join(' · '))}`;

  } catch {
    status.style.color = 'var(--red)';
    status.textContent = '⚠ Erreur d\'analyse — vérifie ta clé API';
  }
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
