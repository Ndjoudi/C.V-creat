// ── INTERVIEW ──────────────────────────────────────────────

// Auto-fill role field from profile when navigating to this screen
function prefillInterviewRole() {
  const field = document.getElementById('itv-role');
  if (field && !field.value && P.title) field.value = P.title;
}

async function generateInterview() {
  const role  = document.getElementById('itv-role').value.trim() || P.title || 'Supply Chain';
  const level = document.getElementById('itv-level').value;
  const offer = document.getElementById('itv-offer').value.trim();

  const btn   = document.getElementById('itv-btn');
  const ldg   = document.getElementById('itv-loading');
  const errEl = document.getElementById('itv-error');
  const res   = document.getElementById('itv-result');

  btn.disabled = true;
  ldg.classList.remove('hidden');
  errEl.classList.add('hidden');
  res.innerHTML = '';

  const ps = P.firstName
    ? `Profil: ${P.title||role} | ${P.yearsExp||''} | Outils: ${P.tools.slice(0,5).join(', ')||'—'} | Domaines: ${P.subdomains.join(', ')||'—'}`
    : role;

  const prompt = `Tu es un expert RH supply chain. Génère 6 questions d'entretien pour ce profil.
Poste: ${role} | Niveau: ${level}
${offer ? 'Offre: ' + offer : ''}
${ps}
Réponds UNIQUEMENT en JSON valide: {"questions":[{"q":"Question 1","category":"Technique|Comportemental|Situationnel|Motivation","difficulty":"Facile|Moyen|Difficile","tip":"Conseil pour bien répondre (2-3 phrases)"}]}`;

  try {
    const raw    = await callGroq(prompt, { maxTokens: 2000, temperature: 0.8 });
    const result = safeParseJSON(raw);
    renderInterview(result);
  } catch (e) {
    errEl.textContent = groqErrorMessage(e);
    errEl.classList.remove('hidden');
  } finally {
    ldg.classList.add('hidden');
    btn.disabled = false;
    btn.innerHTML = '🎤 Générer la simulation';
  }
}

function renderInterview(r) {
  const catColors = {
    'Technique':      ['var(--teal)',  'var(--teal-bg)',  'var(--teal-border)'],
    'Comportemental': ['#7C3AED',     '#F5F3FF',         '#DDD6FE'],
    'Situationnel':   ['#D97706',     'var(--sand-bg)',   '#D4B98A'],
    'Motivation':     ['#16A34A',     'var(--green-bg)', '#BBF7D0']
  };
  const diffColors = { 'Facile': '#16A34A', 'Moyen': '#D97706', 'Difficile': '#DC2626' };
  const qs = r.questions || [];

  let html = `<div class="card card-hi" style="margin-bottom:20px">
    <div style="font-size:15px;font-weight:700;margin-bottom:4px">🎤 Simulation prête — ${qs.length} questions</div>
    <div style="font-size:13px;color:var(--ink3)">Prépare tes réponses avec la méthode STAR (Situation, Tâche, Action, Résultat)</div>
  </div>`;

  qs.forEach((q, i) => {
    const [cc, cb, cborder] = catColors[q.category] || ['var(--ink3)', 'var(--bg)', 'var(--border)'];
    html += `<div class="iqcard">
      <div class="iqcard-meta">
        <span class="iqcard-tag" style="background:${cb};color:${cc};border-color:${cborder}">${q.category||'Général'}</span>
        <span style="color:${diffColors[q.difficulty]||'var(--ink3)'};font-weight:600;font-size:11px">${q.difficulty||''}</span>
        <span style="color:var(--ink3)">Question ${i + 1}</span>
      </div>
      <div class="iqcard-q">${esc(q.q||'')}</div>
      <details>
        <summary style="font-size:12.5px;color:var(--teal);cursor:pointer;font-weight:600;user-select:none;list-style:none;display:flex;align-items:center;gap:5px">
          <span>💡</span> Voir le conseil de réponse
        </summary>
        <div class="iqcard-tip" style="margin-top:8px">${esc(q.tip||'')}</div>
      </details>
    </div>`;
  });

  document.getElementById('itv-result').innerHTML = html;
}

function clearInterview() {
  document.getElementById('itv-role').value  = '';
  document.getElementById('itv-offer').value = '';
  document.getElementById('itv-result').innerHTML = '';
}
