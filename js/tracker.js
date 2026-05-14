// ── TRACKER ────────────────────────────────────────────────
let _trackerFilter  = 'Tous';
let _indeedFetching = false;

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
  cands.push({
    id: Date.now().toString(),
    company: co, poste,
    date:          document.getElementById('f-date').value,
    status:        document.getElementById('f-status').value,
    notes:         document.getElementById('f-notes').value.trim(),
    indeedUrl:     indeedUrlEl?.value.trim() || '',
    jobDescription: indeedUrlEl?.dataset.desc || ''
  });
  ss('sc_cands', cands);
  document.getElementById('f-co').value       = '';
  document.getElementById('f-poste').value    = '';
  document.getElementById('f-notes').value    = '';
  if (indeedUrlEl) { indeedUrlEl.value = ''; delete indeedUrlEl.dataset.desc; }
  document.getElementById('f-indeed-status').textContent = '';
  document.getElementById('add-form').classList.add('hidden');
  renderTracker();
  refreshBadges();
  toast('Candidature ajoutée');
}

// ── INDEED IMPORT ──────────────────────────────────────────

function onIndeedUrlInput(val) {
  const hasKey = /[?&](?:vjk|jk)=[a-f0-9]{8,}/i.test(val);
  const s = document.getElementById('f-indeed-status');
  if (hasKey) { s.style.color='var(--ink3)'; s.textContent='→ Clique sur Récupérer pour importer l\'annonce'; }
  else        { s.textContent=''; }
}

// ── Fetch avec timeout manuel ──────────────────────────────
async function _timedFetch(url, opts = {}, ms = 12000) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), ms);
  try   { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(tid); }
}

// ── Détection page de blocage (Cloudflare, bot detection) ────
function _isBlocked(text) {
  const t = (text || '').toLowerCase();
  return t.includes('just a moment') || t.includes('checking your browser')
      || t.includes('cloudflare') || t.includes('enable javascript')
      || t.includes('access denied') || t.includes('robot') || t.length < 200;
}

// ── Validation titre extrait ──────────────────────────────────
const BAD_TITLES = ['just a moment', 'access denied', 'robot', 'cloudflare', 'verify', 'checking'];
function _isBadTitle(t) { const l = (t||'').toLowerCase(); return BAD_TITLES.some(b => l.includes(b)); }

// ── Stratégie 1 : Jina AI Reader (rendu navigateur headless) ─
async function _fetchViaJina(indeedUrl) {
  // Essaie d'abord avec l'URL viewjob, puis avec l'URL /jobs?vjk= si bloqué
  const urlsToTry = [
    indeedUrl,
    indeedUrl.replace('/viewjob?jk=', '/?vjk='),
  ];
  for (const url of urlsToTry) {
    const r = await _timedFetch(
      `https://r.jina.ai/${url}`,
      { headers: { 'Accept': 'application/json', 'X-Timeout': '15', 'X-No-Cache': 'true' } },
      22000
    );
    if (!r.ok) continue;
    const data = await r.json();
    const content = data?.data?.content || data?.content || '';
    if (!_isBlocked(content)) return { text: content, title: data?.data?.title || '' };
  }
  throw new Error('jina_blocked');
}

// ── Stratégie 2 : proxies CORS classiques (HTML brut) ────────
async function _fetchViaProxy(indeedUrl) {
  const enc = encodeURIComponent(indeedUrl);
  const tries = [
    async () => { const r = await _timedFetch(`https://corsproxy.io/?${enc}`);             return r.ok ? r.text() : Promise.reject(); },
    async () => { const r = await _timedFetch(`https://api.allorigins.win/raw?url=${enc}`); return r.ok ? r.text() : Promise.reject(); },
    async () => { const r = await _timedFetch(`https://api.allorigins.win/get?url=${enc}`); if (!r.ok) throw 0; const d = await r.json(); return d.contents || ''; },
    async () => { const r = await _timedFetch(`https://api.codetabs.com/v1/proxy?quest=${enc}`); return r.ok ? r.text() : Promise.reject(); },
  ];
  for (const fn of tries) {
    try {
      const html = await fn();
      if (html?.length > 400 && !_isBlocked(html)) return html;
    } catch { /* suivant */ }
  }
  throw new Error('proxy_fail');
}

// ── Extraction structurée depuis texte/HTML ───────────────────
function _parseFromText(text) {
  // Tente JSON-LD dans le HTML
  for (const [, inner] of [...text.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]) {
    try {
      const p = JSON.parse(inner.trim());
      const jp = Array.isArray(p) ? p.find(x => x['@type']==='JobPosting') : (p['@type']==='JobPosting' ? p : null);
      if (jp?.title) return {
        title:       jp.title,
        company:     jp.hiringOrganization?.name || '',
        location:    jp.jobLocation?.address?.addressLocality || jp.jobLocation?.[0]?.address?.addressLocality || '',
        contract:    (jp.employmentType||'').replace(/_/g,' '),
        description: (jp.description||'').replace(/<[^>]+>/g,' ').replace(/\s{2,}/g,' ').trim().substring(0,2000)
      };
    } catch { /* continue */ }
  }
  return null;
}

async function importFromIndeed() {
  if (_indeedFetching) return;
  const rawUrl = document.getElementById('f-indeed-url').value.trim();
  if (!rawUrl) { toast('Colle un lien Indeed d\'abord'); return; }

  const keyMatch = rawUrl.match(/[?&](?:vjk|jk)=([a-f0-9]+)/i);
  const jk = keyMatch?.[1] || '';
  if (!jk) { toast('Lien Indeed invalide — paramètre vjk= introuvable'); return; }

  const btn      = document.getElementById('f-indeed-btn');
  const status   = document.getElementById('f-indeed-status');
  const origHtml = btn.innerHTML;
  _indeedFetching = true;
  btn.disabled = true; btn.textContent = '⏳ Récupération...';
  status.style.color = 'var(--ink3)';

  const host      = rawUrl.includes('fr.indeed') ? 'fr.indeed.com' : 'indeed.com';
  const indeedUrl = `https://${host}/viewjob?jk=${jk}`;

  let title = '', company = '', location = '', contract = '', description = '';
  let gotData = false;

  // ── Tentative 1 : Jina AI Reader ──
  try {
    status.textContent = '🔍 Lecture de la page Indeed (Jina AI)...';
    const { text, title: jinaTitle } = await _fetchViaJina(indeedUrl);

    // Groq extrait les infos depuis le texte propre renvoyé par Jina
    status.textContent = '✨ Extraction des infos avec l\'IA...';
    const raw = await callGroq(
      `Voici le contenu d'une offre d'emploi. Extrais les informations.\n\nCONTENU:\n${text.substring(0,4000)}\n\nRéponds UNIQUEMENT en JSON valide:\n{"title":"","company":"","location":"","contractType":"","description":""}`,
      { maxTokens: 350, temperature: 0 }
    );
    const p = safeParseJSON(raw);
    title       = p.title        || jinaTitle || '';
    company     = p.company      || '';
    location    = p.location     || '';
    contract    = p.contractType || '';
    description = p.description  || '';
    if ((title || company) && !_isBadTitle(title)) gotData = true;
  } catch { /* passe à la stratégie suivante */ }

  // ── Tentative 2 : proxies CORS + parsing JSON-LD + IA ──
  if (!gotData) {
    try {
      status.textContent = '🔄 Essai via proxy CORS...';
      const html = await _fetchViaProxy(indeedUrl);

      // JSON-LD d'abord
      const parsed = _parseFromText(html);
      if (parsed?.title) {
        ({ title, company, location, contract, description } = parsed);
        gotData = true;
      } else {
        // IA sur le texte brut
        status.textContent = '✨ Analyse IA du contenu...';
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'')
          .replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&')
          .replace(/\s{2,}/g,' ').trim().substring(0,3500);
        const raw = await callGroq(
          `Texte d'une annonce emploi. Extrais les infos.\n\nTEXTE:\n${text}\n\nRéponds UNIQUEMENT en JSON:\n{"title":"","company":"","location":"","contractType":"","description":""}`,
          { maxTokens:300, temperature:0 }
        );
        const p = safeParseJSON(raw);
        title = p.title||''; company = p.company||''; location = p.location||'';
        contract = p.contractType||''; description = p.description||'';
        if ((title || company) && !_isBadTitle(title)) gotData = true;
      }
    } catch { /* passe au fallback */ }
  }

  // ── Résultat ──
  if (gotData && (title || company)) {
    if (title)   document.getElementById('f-poste').value = title;
    if (company) document.getElementById('f-co').value    = company;
    document.getElementById('f-indeed-url').dataset.desc  = description;

    const parts = [title, company, location, contract].filter(Boolean);
    status.style.color = 'var(--teal-d)';
    status.innerHTML = `<strong style="color:var(--teal-d)">✓ Importé :</strong> ${esc(parts.join(' · '))}`;
    toast('Annonce Indeed importée ✓');
  } else {
    // ── Fallback manuel : zone de texte ──
    status.style.color = '#D97706';
    status.innerHTML = `⚠ Indeed bloque le rendu automatique.<br>
      <span style="color:var(--ink2)">Copie le texte de l'annonce (Ctrl+A + Ctrl+C sur la page Indeed) et colle ci-dessous — l'IA se charge du reste :</span>`;
    document.getElementById('indeed-paste-zone').classList.remove('hidden');
  }

  _indeedFetching = false;
  btn.disabled = false; btn.innerHTML = origHtml;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ── Analyse du texte collé manuellement ────────────────────
async function analyzeIndeedPaste() {
  const text = document.getElementById('f-indeed-paste').value.trim();
  if (text.length < 50) { toast('Colle d\'abord le texte de l\'annonce'); return; }

  const btn   = document.getElementById('f-paste-btn');
  const status = document.getElementById('f-indeed-status');
  btn.disabled = true; btn.textContent = 'Analyse...';

  try {
    const raw = await callGroq(
      `Tu es un assistant RH. Extrais les informations de cette annonce d'emploi.\n\nANNONCE:\n${text.substring(0,4000)}\n\nRéponds UNIQUEMENT en JSON valide:\n{"title":"","company":"","location":"","contractType":"","description":""}`,
      { maxTokens: 400, temperature: 0 }
    );
    const p = safeParseJSON(raw);
    if (p.title)   document.getElementById('f-poste').value = p.title;
    if (p.company) document.getElementById('f-co').value    = p.company;
    document.getElementById('f-indeed-url').dataset.desc = p.description || '';

    const parts = [p.title, p.company, p.location, p.contractType].filter(Boolean);
    status.style.color = 'var(--teal-d)';
    status.innerHTML = `<strong style="color:var(--teal-d)">✓ Analysé :</strong> ${esc(parts.join(' · '))}`;
    document.getElementById('indeed-paste-zone').classList.add('hidden');
    document.getElementById('f-indeed-paste').value = '';
    toast('Annonce analysée ✓');
  } catch {
    toast('Erreur lors de l\'analyse — vérifie ta clé API');
  } finally {
    btn.disabled = false; btn.textContent = 'Analyser';
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
