// ── HISTORY ────────────────────────────────────────────────

function renderHistory() {
  const hist = ls('sc_history', []);
  const el   = document.getElementById('history-list');
  if (!hist.length) {
    el.innerHTML = `<div class="empty"><div class="empty-ic"></div><div class="empty-t">Aucune analyse</div><div class="empty-s">Lance une analyse d'offre pour commencer</div></div>`;
    return;
  }
  el.innerHTML = hist.map(h => {
    const sc  = h.score || 0;
    const col = sc >= 70 ? 'var(--teal)' : sc >= 50 ? '#D97706' : 'var(--red)';
    const bg  = sc >= 70 ? 'var(--teal-bg)' : sc >= 50 ? 'var(--sand-bg)' : 'var(--red-bg)';
    const bd  = sc >= 70 ? 'var(--teal-border)' : sc >= 50 ? '#D4B98A' : 'var(--red-border)';
    return `<div class="hist-item" onclick="openHistModal('${h.id}')">
      <div class="hist-score" style="color:${col};border-color:${bd};background:${bg}">${sc}</div>
      <div style="flex:1">
        <div style="font-weight:700;color:var(--ink);font-size:14px">${esc(h.poste||'Poste inconnu')}</div>
        ${h.entreprise ? `<div style="font-size:12.5px;color:var(--ink3);margin-top:2px">${esc(h.entreprise)}</div>` : ''}
      </div>
      <div style="font-size:12px;color:var(--ink3);text-align:right;flex-shrink:0">${h.date}</div>
      <button class="hist-del" onclick="delHistItem(event,'${h.id}')" title="Supprimer cette analyse">×</button>
    </div>`;
  }).join('');
}

function delHistItem(event, id) {
  event.stopPropagation();
  if (!confirm('Supprimer cette analyse ?')) return;
  const hist = ls('sc_history', []).filter(x => x.id !== id);
  ss('sc_history', hist);
  renderHistory();
  refreshBadges();
  toast('🗑️ Analyse supprimée');
}

function openHistModal(id) {
  const hist = ls('sc_history', []);
  const h = hist.find(x => x.id === id);
  if (!h) return;
  document.getElementById('hist-modal-title').textContent = esc(h.poste || 'Analyse');
  document.getElementById('hist-modal-sub').textContent   = (h.entreprise ? esc(h.entreprise) + ' · ' : '') + h.date;
  const body = document.getElementById('hist-modal-body');
  body.innerHTML = '';
  renderAnalyzeResult(h.result, body);
  document.getElementById('hist-modal-overlay').classList.remove('hidden');
}

function closeHistModal() { document.getElementById('hist-modal-overlay').classList.add('hidden'); }

function clearHistory() {
  if (!confirm('Supprimer tout l\'historique des analyses ?')) return;
  ss('sc_history', []);
  renderHistory();
  refreshBadges();
  toast('🗑️ Historique effacé');
}
