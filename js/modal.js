// ── AI GENERATION MODAL ────────────────────────────────────
// "Mon profil" → phrase template (1 étape : coller l'offre)
const PHRASE_TEMPLATE = `Fort de ${'{yearsExp}'} en logistique e-commerce, [COMPETENCES_CLES], je vise un poste de [POSTE_VISE].`;

const RQ = [
  { id:'offer', q:'Colle le texte de l\'offre d\'emploi ici :', type:'textarea', ph:'Copie-colle le texte complet de l\'offre (LinkedIn, Indeed, APEC…)' },
];
const EQ = [
  { id:'missions', q:'Quelles étaient tes missions principales sur ce poste ?',  type:'text', ph:'Ex: gestion stocks, coordination transport, planification MRP...' },
  { id:'kpis',     q:'Des KPIs ou chiffres à valoriser ?',                        type:'text', ph:'Ex: taux de service 98%, 10 000 refs, budget 2M€... (ou \'aucun\')' },
  { id:'best',     q:'Ta meilleure réalisation sur ce poste ?',                   type:'text', ph:'Ex: mise en place WMS, réduction coûts, encadrement équipe...' },
];

let modalState = { type: null, expId: null, step: 0, answers: {}, generated: '' };

function openModal(type, expId = null) {
  modalState = { type, expId, step: 0, answers: {}, generated: '' };
  const titles = { resume: 'Phrase profil', target: 'Pour ce poste', exp: 'Générer la description' };
  document.getElementById('modal-title').innerHTML = `<i data-lucide="sparkles" style="width:16px;height:16px;vertical-align:-3px;margin-right:6px"></i>${titles[type] || 'Générer'}`;
  if (typeof lucide !== 'undefined') lucide.createIcons();
  document.getElementById('modal-overlay').classList.remove('hidden');
  renderModalStep();
}
function closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); }

function renderModalStep() {
  const qs = (modalState.type === 'resume' || modalState.type === 'target') ? RQ : EQ;
  const { step, generated } = modalState;
  const done = step >= qs.length;

  document.getElementById('modal-sub').textContent = done
    ? (generated ? 'Résultat — copie ou affine' : 'Génération...')
    : `Étape ${step + 1} sur ${qs.length}`;
  document.getElementById('modal-foot').classList.toggle('hidden', !generated);

  if (done && !generated) { generateText(); return; }
  if (generated) { renderModalResult(); return; }

  const q    = qs[step];
  const dots = qs.map((_, i) => `<div class="sdot${i < step ? ' done' : i === step ? ' cur' : ''}"></div>`).join('');
  let body   = `<div class="sdots">${dots}</div><div class="cbbl cbbl-ai">${q.q}</div>`;

  const rows = q.type === 'textarea' ? 7 : 3;
  body += `<textarea class="inp" id="m-inp" rows="${rows}" style="margin-top:8px" placeholder="${q.ph}"></textarea>
  <div style="display:flex;justify-content:flex-end;margin-top:9px">
    <button class="btn btn-p" onclick="submitModalAnswer()">Générer <i data-lucide="sparkles" style="width:13px;height:13px;vertical-align:-2px;margin-left:3px"></i></button>
  </div>`;

  document.getElementById('modal-body').innerHTML = body;
  if (typeof lucide !== 'undefined') lucide.createIcons();
  const inp = document.getElementById('m-inp');
  if (inp) {
    inp.focus();
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && q.type !== 'textarea') { e.preventDefault(); submitModalAnswer(); } });
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

  if (modalState.type === 'resume' || modalState.type === 'target') {
    const langs = P.languages.length ? P.languages.map(l => l.name + ' ' + l.level).join(', ') : '';
    const isTarget = modalState.type === 'target';

    if (isTarget) {
      // "Pour ce poste" — 1-2 phrases ciblées
      prompt = `Tu es un expert en recrutement. Génère 1 à 2 phrases (30-50 mots) qui montrent POURQUOI ce candidat correspond au poste ciblé.

POSTE CIBLÉ : "${a.offer || _cvTarget || 'poste ciblé'}"
Langues disponibles : ${langs || 'non renseigné'}
Disponibilité : "${P.disponibilite || 'disponible rapidement'}"
${refine ? 'Modification : ' + refine : ''}

RÈGLES : commence par "Particulièrement motivé(e) par" ou "Attiré(e) par" ou équivalent. Cite 1-2 compétences/atouts directement liés au poste. Termine par la disponibilité.
Réponds UNIQUEMENT avec le texte, sans guillemets.`;
    } else {
      // "Mon profil" — phrase template avec trous
      const offerText = a.offer || '';
      const yearsExp  = P.yearsExp || '5 ans';

      if (refine) {
        // Affinage libre sur la phrase déjà générée
        prompt = `Voici une phrase de profil CV : "${modalState.generated}"
Modification demandée : ${refine}
Réponds UNIQUEMENT avec la phrase corrigée, sans guillemets.`;
      } else {
        prompt = `À partir de l'offre d'emploi ci-dessous, extrais UNIQUEMENT en JSON :
1. "competences" : 2-3 compétences clés demandées dans l'offre, formulées en 3-4 mots max chacune, séparées par des virgules (ex: "planification opérationnelle, coordination d'équipes")
2. "titre" : le titre EXACT du poste tel qu'il apparaît dans l'offre, sans rien changer

OFFRE :
${offerText.slice(0, 3000)}

Réponds UNIQUEMENT en JSON valide : {"competences":"...","titre":"..."}`;
      }
    }
  } else {
    const exp = P.experiences.find(e => e.id === modalState.expId) || {};
    prompt = `Expert RH supply chain. Génère une description de poste CV en 3-4 bullet points percutants (verbe d'action fort).
Poste: ${exp.title||'poste supply chain'} | Entreprise: ${exp.company||'—'}
Missions: ${a.missions} | KPIs: ${a.kpis} | Réalisation: ${a.best}
${refine ? 'Modification: ' + refine : ''}
Réponds UNIQUEMENT avec les bullet points (un par ligne, commençant par •).`;
  }

  try {
    const raw = await callGroq(prompt, { maxTokens: 400, temperature: 0.4 });

    // Pour "Mon profil" (hors affinage) : assembler la phrase template depuis le JSON
    if (modalState.type === 'resume' && !refine) {
      const data = safeParseJSON(raw);
      const competences = data.competences || '';
      const titre       = data.titre       || '';
      const yearsExp    = P.yearsExp || '5 ans';
      modalState.generated = `Fort de ${yearsExp} en logistique e-commerce, ${competences}, je vise un poste de ${titre}.`;
    } else {
      modalState.generated = raw;
    }
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
  if (modalState.type === 'target') {
    P.summaryTarget = txt;
    const el = document.getElementById('p-summaryTarget');
    if (el) el.value = txt;
    ss('sc_profile', P);
    toast('Accroche ciblée appliquée');
  } else if (modalState.type === 'resume') {
    P.summary = txt;
    const el = document.getElementById('p-summary');
    if (el) { el.value = txt; el.dispatchEvent(new Event('input')); }
    ss('sc_profile', P);
    toast('Profil appliqué');
  } else {
    const exp = P.experiences.find(e => e.id === modalState.expId);
    if (exp) { exp.description = txt; ss('sc_profile', P); renderExpList(); }
    toast('Description appliquée');
  }
  closeModal();
}
