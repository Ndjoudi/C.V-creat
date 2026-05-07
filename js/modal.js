// ── AI GENERATION MODAL ────────────────────────────────────
const RQ = [
  { id:'domains', q:'Sur quels domaines supply chain tu travailles principalement ?', type:'text', ph:'Ex: appros, planification, logistique entrepôt...' },
  { id:'win',     q:'Ta plus belle réalisation, celle dont tu es le plus fier ?',     type:'text', ph:'Ex: réduction ruptures 30%, projet WMS, déménagement entrepôt...' },
  { id:'goal',    q:'Tu cherches quoi dans ta prochaine expérience ?',                type:'text', ph:'Ex: management, évoluer vers S&OP, nouveau secteur...' },
  { id:'tone',    q:'Quel ton tu préfères pour ton accroche ?', type:'choice', choices:['Professionnel / Corporate','Dynamique / Ambitieux','Expert / Technique'] },
];
const EQ = [
  { id:'missions', q:'Quelles étaient tes missions principales sur ce poste ?',  type:'text', ph:'Ex: gestion stocks, coordination transport, planification MRP...' },
  { id:'kpis',     q:'Des KPIs ou chiffres à valoriser ?',                        type:'text', ph:'Ex: taux de service 98%, 10 000 refs, budget 2M€... (ou \'aucun\')' },
  { id:'best',     q:'Ta meilleure réalisation sur ce poste ?',                   type:'text', ph:'Ex: mise en place WMS, réduction coûts, encadrement équipe...' },
];

let modalState = { type: null, expId: null, step: 0, answers: {}, generated: '' };

function openModal(type, expId = null) {
  modalState = { type, expId, step: 0, answers: {}, generated: '' };
  document.getElementById('modal-title').innerHTML = `<i data-lucide="sparkles" style="width:16px;height:16px;vertical-align:-3px;margin-right:6px"></i>${type === 'resume' ? 'Générer l\'accroche' : 'Générer la description'}`;
  if (typeof lucide !== 'undefined') lucide.createIcons();
  document.getElementById('modal-overlay').classList.remove('hidden');
  renderModalStep();
}
function closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); }

function renderModalStep() {
  const qs = modalState.type === 'resume' ? RQ : EQ;
  const { step, generated } = modalState;
  const done = step >= qs.length;

  document.getElementById('modal-sub').textContent = done
    ? (generated ? 'Résultat — utilise ou affine' : 'Génération...')
    : `Question ${step + 1} sur ${qs.length}`;
  document.getElementById('modal-foot').classList.toggle('hidden', !generated);

  if (done && !generated) { generateText(); return; }
  if (generated) { renderModalResult(); return; }

  const q    = qs[step];
  const dots = qs.map((_, i) => `<div class="sdot${i < step ? ' done' : i === step ? ' cur' : ''}"></div>`).join('');
  let body   = `<div class="sdots">${dots}</div><div class="cbbl cbbl-ai">${q.q}</div>`;

  if (q.type === 'text') {
    body += `<textarea class="inp" id="m-inp" rows="3" style="margin-top:8px" placeholder="${q.ph}"></textarea>
    <div style="display:flex;justify-content:flex-end;margin-top:9px">
      <button class="btn btn-p" onclick="submitModalAnswer()">Suivant →</button>
    </div>`;
  } else {
    body += `<div style="display:flex;flex-wrap:wrap;margin-top:10px">${q.choices.map(c => `<span class="cbtn" onclick="selectTone(this,'${c}')">${c}</span>`).join('')}</div>
    <div style="display:flex;justify-content:flex-end;margin-top:11px">
      <button class="btn btn-p" id="tone-btn" onclick="submitTone()" disabled>Générer <i data-lucide="sparkles" style="width:13px;height:13px;vertical-align:-2px;margin-left:3px"></i></button>
    </div>`;
  }

  document.getElementById('modal-body').innerHTML = body;
  if (typeof lucide !== 'undefined') lucide.createIcons();
  const inp = document.getElementById('m-inp');
  if (inp) {
    inp.focus();
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitModalAnswer(); } });
  }
}

function selectTone(el, val) {
  document.querySelectorAll('.cbtn').forEach(b => b.classList.remove('sel'));
  el.classList.add('sel');
  el.dataset.val = val;
  const btn = document.getElementById('tone-btn');
  btn.disabled = false;
  btn.dataset.val = val;
}

function submitTone() { const val = document.getElementById('tone-btn').dataset.val; if (!val) return; submitModalAnswerVal(val); }
function submitModalAnswer() {
  const val = (document.getElementById('m-inp')?.value || '').trim();
  if (!val) { toast('Entre une réponse pour continuer'); return; }
  submitModalAnswerVal(val);
}
function submitModalAnswerVal(val) {
  const qs = modalState.type === 'resume' ? RQ : EQ;
  const q  = qs[modalState.step];
  modalState.answers[q.id] = val;
  modalState.step++;
  renderModalStep();
}

async function generateText(refine = '') {
  document.getElementById('modal-body').innerHTML = `<div class="ldg"><div class="sp"></div>L'IA rédige ton texte...</div>`;
  document.getElementById('modal-foot').classList.add('hidden');

  const a = modalState.answers;
  let prompt = '';

  if (modalState.type === 'resume') {
    prompt = `Expert RH supply chain. Génère une accroche CV professionnelle en français (3-4 phrases, max 80 mots).
Domaines: ${a.domains || P.subdomains.join(', ') || 'supply chain'}
Expérience: ${P.yearsExp || 'non précisé'}
Outils: ${P.tools.slice(0,5).join(', ') || '—'}
Réalisation: ${a.win}
Objectif: ${a.goal}
Ton: ${a.tone}
${refine ? 'Modification: ' + refine : ''}
Réponds UNIQUEMENT avec le texte, sans guillemets ni titre.`;
  } else {
    const exp = P.experiences.find(e => e.id === modalState.expId) || {};
    prompt = `Expert RH supply chain. Génère une description de poste CV en 3-4 bullet points percutants (verbe d'action fort).
Poste: ${exp.title||'poste supply chain'} | Entreprise: ${exp.company||'—'}
Missions: ${a.missions} | KPIs: ${a.kpis} | Réalisation: ${a.best}
${refine ? 'Modification: ' + refine : ''}
Réponds UNIQUEMENT avec les bullet points (un par ligne, commençant par •).`;
  }

  try {
    modalState.generated = await callGroq(prompt, { maxTokens: 400, temperature: 0.75 });
    renderModalResult();
  } catch (e) {
    document.getElementById('modal-body').innerHTML = `<div style="color:var(--red);font-size:13.5px;padding:14px;background:var(--red-bg);border-radius:var(--radius-sm);border:1px solid var(--red-border)">Erreur : ${esc(e.message)}</div>`;
  }
}

function renderModalResult() {
  document.getElementById('modal-foot').classList.remove('hidden');
  document.getElementById('modal-body').innerHTML = `
    <div class="cres">${esc(modalState.generated)}</div>
    <div style="font-size:12.5px;color:var(--ink3);margin-bottom:10px">Pas satisfait ? Dis-moi ce qui ne va pas :</div>
    <div style="display:flex;gap:8px">
      <input class="inp" id="refine-inp" placeholder="Ex: plus court, ajoute SAP, ton plus dynamique..." style="flex:1"/>
      <button class="btn btn-g" onclick="refineText()">Affiner</button>
    </div>`;
  document.getElementById('refine-inp').addEventListener('keydown', e => { if (e.key === 'Enter') refineText(); });
}

function refineText() { const val = document.getElementById('refine-inp').value.trim(); if (!val) return; generateText(val); }

function applyGenerated() {
  const txt = modalState.generated;
  if (modalState.type === 'resume') {
    P.summary = txt;
    document.getElementById('p-summary').value = txt;
    ss('sc_profile', P);
    initWordCounter();
    toast('Accroche appliquée');
  } else {
    const exp = P.experiences.find(e => e.id === modalState.expId);
    if (exp) { exp.description = txt; ss('sc_profile', P); renderExpList(); }
    toast('Description appliquée');
  }
  closeModal();
}
