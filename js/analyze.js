// ── ANON TOGGLE ────────────────────────────────────────────
let ANON = true;

function toggleAnon() {
  ANON = !ANON;
  const tog  = document.getElementById('anon-tog');
  const note = document.getElementById('anon-note');
  tog.classList.toggle('is-on', ANON);
  tog.classList.toggle('is-off', !ANON);
  note.classList.toggle('is-on', ANON);
  note.classList.toggle('is-off', !ANON);
  note.textContent = ANON
    ? 'Envoyé à Groq : compétences et expériences uniquement — données personnelles remplacées'
    : 'Mode complet — ton profil entier est envoyé à Groq, incluant nom et coordonnées';
}

function clearOffer() {
  document.getElementById('offer-txt').value = '';
  document.getElementById('analyze-result').innerHTML = '';
}

function anonymize(p) {
  return {
    ...p,
    firstName: 'Candidat', lastName: 'X',
    email: 'candidat@anonyme.fr', phone: 'XX XX XX XX XX',
    location: p.location ? p.location.split(',').slice(-1)[0].trim() : 'France',
    experiences: p.experiences.map((e, i) => ({ ...e, company: 'Entreprise ' + String.fromCharCode(65 + i) }))
  };
}

// ── CV ERROR DETECTION (100% JS, pas d'IA) ─────────────────
const WEAK_PHRASES = [
  'responsable de','en charge de','participé à','participation à',
  'aidé à','contribué à','impliqué dans','chargé de','travaillé sur',
  'membre de','fait partie de','involved in','responsible for','assisted with'
];

const STRONG_VERBS = ['Optimisé','Piloté','Développé','Lancé','Négocié','Automatisé',
  'Réduit','Augmenté','Dirigé','Géré','Mis en place','Structuré','Coordonné',
  'Généré','Déployé','Supervisé','Rationalisé','Consolidé','Amélioré','Accéléré'];

function detectCVErrors() {
  const errors   = [];
  const warnings = [];

  // Résumé
  if (!P.summary) {
    errors.push('Résumé manquant — section critique pour les ATS');
  } else {
    const words = P.summary.trim().split(/\s+/).length;
    if (words < 30)  warnings.push('Résumé trop court (' + words + ' mots) — vise 50-80 mots');
    if (words > 100) warnings.push('Résumé trop long (' + words + ' mots) — condense à 50-80 mots');
    if (!/\d/.test(P.summary)) warnings.push('Résumé sans chiffre — ajoute au moins 1 métrique concrète');
  }

  // Expériences
  if (!P.experiences.length) {
    errors.push('Aucune expérience renseignée dans le profil');
  } else {
    P.experiences.forEach(exp => {
      const label = '"' + (exp.title || 'Expérience sans titre') + '"';
      if (!exp.description) {
        warnings.push(label + ' : aucune description — les ATS ne peuvent pas analyser ce poste');
        return;
      }
      const desc = exp.description.toLowerCase();
      WEAK_PHRASES.forEach(p => {
        if (desc.includes(p)) errors.push(label + ' : expression faible "' + p + '" → remplace par un verbe fort (' + STRONG_VERBS.slice(0,3).join(', ') + '...)');
      });
      if (!/\d/.test(exp.description)) warnings.push(label + ' : aucun chiffre — ajoute des % ou métriques concrètes');
    });
  }

  // Sections manquantes
  if (!P.tools.length && !P.subdomains.length) warnings.push('Aucun outil ni domaine supply chain — les ATS cherchent ces mots-clés');
  if (!P.education.length) warnings.push('Aucune formation renseignée');
  if (!P.email) warnings.push('Email manquant dans le profil');
  if (!P.title) warnings.push('Titre professionnel manquant — important pour les ATS');

  return { errors, warnings };
}

// ── ANALYZE ────────────────────────────────────────────────
async function doAnalyze() {
  const offer = document.getElementById('offer-txt').value.trim();
  if (!offer) { toast('⚠️ Colle d\'abord une offre d\'emploi'); return; }

  const btn   = document.getElementById('analyze-btn');
  const ldg   = document.getElementById('analyze-loading');
  const errEl = document.getElementById('analyze-error');
  const res   = document.getElementById('analyze-result');

  btn.disabled = true; btn.textContent = 'Analyse en cours...';
  ldg.classList.remove('hidden'); errEl.classList.add('hidden'); res.innerHTML = '';

  const p  = ANON ? anonymize(P) : P;
  const ps = p.firstName
    ? `Titre: ${p.title||'—'} | Expérience: ${p.yearsExp||'—'}
Sous-domaines SC: ${p.subdomains.join(', ')||'—'}
Outils: ${p.tools.join(', ')||'—'}
Certifications: ${p.certifs.join(', ')||'—'}
Secteurs: ${p.sectors.join(', ')||'—'}
Résumé actuel: ${p.summary||'—'}
Expériences: ${p.experiences.map(e => e.title + ' chez ' + e.company + ' (' + e.duration + '): ' + e.description).join(' | ')||'—'}`
    : 'Profil non renseigné';

  const prompt = `Tu es un expert RH et consultant en recrutement supply chain, spécialisé dans l'optimisation ATS (Applicant Tracking System).

RÈGLES D'ANALYSE STRICTES :
- Calcule les scores en comptant réellement les correspondances, pas au hasard
- score_global : % de mots-clés importants de l'offre présents dans le profil (65-75% = optimal)
- score_resume : adéquation du résumé/accroche avec le poste visé
- score_competences : % des compétences demandées présentes dans le profil
- score_experience : pertinence des expériences pour ce rôle
- must_have : compétences/exigences marquées "requis", "obligatoire", "impératif", "exigé" dans l'offre
- nice_to_have : compétences marquées "souhaité", "idéalement", "un plus", "apprécié"
- keywords_present : termes de l'offre effectivement présents dans le profil
- keywords_missing : termes importants de l'offre absents du profil
- adapted_bullets : 4 bullet points PERCUTANTS suivant la formule APR (Verbe d'action fort + Action concrète + Résultat chiffré quand possible). Verbes recommandés: Optimisé, Piloté, Déployé, Réduit, Augmenté, Négocié, Automatisé, Structuré, Coordonné. Ne jamais commencer par "Responsable de" ou "En charge de".
- cover_letter : lettre professionnelle avec accroche percutante, paragraphe valeur ajoutée, paragraphe motivation entreprise, formule de politesse
- Ne jamais inventer d'informations absentes du profil

OFFRE D'EMPLOI :
${offer}

PROFIL DU CANDIDAT :
${ps}

Réponds UNIQUEMENT en JSON valide, sans markdown, sans backticks, sans commentaires :
{"poste":"...","entreprise":"...","score_global":72,"score_resume":65,"score_competences":80,"score_experience":70,"must_have":["exigence 1","exigence 2"],"nice_to_have":["souhait 1"],"keywords_present":["mot-clé présent 1","mot-clé présent 2"],"keywords_missing":["mot-clé manquant 1","mot-clé manquant 2"],"adapted_bullets":["Verbe fort + action + résultat","Verbe fort + action + résultat","Verbe fort + action + résultat","Verbe fort + action + résultat"],"tips":["Conseil concret et actionnable 1","Conseil concret et actionnable 2"],"cover_letter":"Lettre complète..."}`;

  try {
    const raw    = await callGroq(prompt, { maxTokens: 3200, temperature: 0.5 });
    const result = safeParseJSON(raw);

    // Compatibilité : si l'IA renvoie score au lieu de score_global
    if (result.score !== undefined && result.score_global === undefined) result.score_global = result.score;

    const cvErrors = detectCVErrors();
    renderAnalyzeResult(result, cvErrors, document.getElementById('analyze-result'));

    const score = result.score_global ?? result.score ?? 0;
    const hist  = ls('sc_history', []);
    hist.unshift({ id: Date.now().toString(), date: new Date().toLocaleDateString('fr-FR'), poste: result.poste, entreprise: result.entreprise, score, result });
    if (hist.length > 20) hist.pop();
    ss('sc_history', hist);
    refreshBadges();
    toast('✅ Analyse sauvegardée dans l\'historique');
  } catch (e) {
    errEl.textContent = groqErrorMessage(e);
    errEl.classList.remove('hidden');
  } finally {
    ldg.classList.add('hidden');
    btn.disabled = false; btn.innerHTML = '✦ Analyser avec l\'IA';
  }
}

// ── SHARED RESULT RENDERER ─────────────────────────────────
function renderAnalyzeResult(r, cvErrors, container) {
  // Support ancien format (score) et nouveau (score_global)
  const sc  = r.score_global ?? r.score ?? 0;
  const col = sc >= 70 ? 'var(--teal)' : sc >= 50 ? '#D97706' : 'var(--red)';
  const bg  = sc >= 70 ? 'var(--teal-bg)'     : sc >= 50 ? 'var(--sand-bg)'  : 'var(--red-bg)';
  const bd  = sc >= 70 ? 'var(--teal-border)' : sc >= 50 ? 'var(--border)'   : 'var(--red-border)';
  const lbl = sc >= 70 ? '✅ Bonne compatibilité' : sc >= 50 ? '⚠️ Compatibilité moyenne' : '❌ Faible compatibilité';

  const circ = 2 * Math.PI * 36;
  const dash = (sc / 100) * circ;

  // ── Erreurs CV détectées en JS ──
  let errHtml = '';
  if (cvErrors && (cvErrors.errors.length || cvErrors.warnings.length)) {
    errHtml = `<div class="card" style="border-color:var(--border)">
      <div class="ctitle">⚠️ Points à améliorer dans ton CV</div>
      ${cvErrors.errors.map(e => `<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border2);font-size:13px;align-items:flex-start"><span style="color:var(--red);font-weight:700;flex-shrink:0">✗</span><span style="color:var(--ink)">${esc(e)}</span></div>`).join('')}
      ${cvErrors.warnings.map(w => `<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border2);font-size:13px;align-items:flex-start"><span style="color:#D97706;font-weight:700;flex-shrink:0">!</span><span style="color:var(--ink2)">${esc(w)}</span></div>`).join('')}
    </div>`;
  }

  // ── Score global + breakdown ──
  const scoreBreakdown = (r.score_resume !== undefined) ? `
    <div style="margin-top:16px;display:grid;gap:8px">
      ${[
        { label: 'Résumé / Accroche',  val: r.score_resume },
        { label: 'Compétences',         val: r.score_competences },
        { label: 'Expériences',         val: r.score_experience }
      ].map(({ label, val }) => {
        if (val === undefined) return '';
        const c = val >= 70 ? 'var(--teal)' : val >= 50 ? '#D97706' : 'var(--red)';
        return `<div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
            <span style="color:var(--ink2);font-weight:500">${label}</span>
            <span style="color:${c};font-weight:700">${val}%</span>
          </div>
          <div class="prog"><div class="prog-f" style="width:${val}%;background:${c}"></div></div>
        </div>`;
      }).join('')}
    </div>` : '';

  let html = `
  ${errHtml}
  <div class="card" style="background:${bg};border:1.5px solid ${bd}">
    <div style="display:flex;align-items:center;gap:22px">
      <div class="score-ring">
        <svg width="96" height="96" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r="36" fill="none" stroke="var(--border)" stroke-width="6"/>
          <circle cx="48" cy="48" r="36" fill="none" stroke="${col}" stroke-width="6"
            stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}" stroke-linecap="round"/>
        </svg>
        <div class="score-ring-val">
          <div class="score-ring-n" style="color:${col}">${sc}</div>
          <div class="score-ring-pct" style="color:${col}">%</div>
        </div>
      </div>
      <div style="flex:1">
        <div style="font-size:20px;font-weight:800;color:var(--ink)">${esc(r.poste||'')}</div>
        ${r.entreprise ? `<div style="font-size:13px;color:var(--ink3);margin-top:3px">${esc(r.entreprise)}</div>` : ''}
        <div style="margin-top:10px;display:inline-flex;padding:4px 12px;border-radius:100px;font-size:12px;font-weight:600;color:${col};border:1.5px solid ${bd};background:${bg}">${lbl}</div>
      </div>
    </div>
    ${scoreBreakdown}
  </div>`;

  // ── Must-have / Nice-to-have ──
  if (r.must_have?.length || r.nice_to_have?.length) {
    html += `<div class="card">
      <div class="ctitle">Exigences du poste</div>
      ${r.must_have?.length ? `
        <div style="margin-bottom:12px">
          <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--red);margin-bottom:8px">Indispensables</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">${r.must_have.map(k => `<span style="padding:4px 11px;border-radius:100px;font-size:12.5px;font-weight:600;background:var(--red-bg);color:var(--red);border:1.5px solid var(--red-border)">${esc(k)}</span>`).join('')}</div>
        </div>` : ''}
      ${r.nice_to_have?.length ? `
        <div>
          <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#D97706;margin-bottom:8px">Souhaitées</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">${r.nice_to_have.map(k => `<span style="padding:4px 11px;border-radius:100px;font-size:12.5px;font-weight:600;background:#FFFBEB;color:#D97706;border:1.5px solid #FDE68A">${esc(k)}</span>`).join('')}</div>
        </div>` : ''}
    </div>`;
  }

  // ── Mots-clés présents / manquants ──
  if (r.keywords_present?.length || r.keywords_missing?.length) {
    html += `<div class="card">
      <div class="ctitle">Mots-clés ATS</div>
      ${r.keywords_present?.length ? `
        <div style="margin-bottom:14px">
          <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--teal);margin-bottom:8px">✓ Présents dans ton profil</div>
          <div>${r.keywords_present.map(k => `<span class="atag">${esc(k)}</span>`).join('')}</div>
        </div>` : ''}
      ${r.keywords_missing?.length ? `
        <div>
          <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--red);margin-bottom:8px">✗ Absents de ton profil</div>
          <div>${r.keywords_missing.map(k => `<span style="display:inline-block;padding:4px 10px;background:var(--red-bg);color:var(--red);border-radius:var(--radius-xs);font-size:12px;font-weight:600;margin:2px;border:1px solid var(--red-border)">${esc(k)}</span>`).join('')}</div>
        </div>` : ''}
    </div>`;
  }

  // ── Bullet points (suggestions IA) ──
  html += `<div class="card">
    <div class="ctitle-row">
      <span class="ctitle">Bullet points adaptés pour ton CV</span>
      <span style="font-size:11px;color:var(--sand-dark);background:var(--sand-bg);border:1px solid #D4B98A;padding:3px 9px;border-radius:100px;font-weight:600">✨ Suggestions IA — à relire</span>
    </div>
    <div style="font-size:12.5px;color:var(--ink3);margin-bottom:13px">Formule APR : Verbe d'action + Action concrète + Résultat</div>
    ${(r.adapted_bullets||[]).map(b=>`<div class="bullet">${esc(b)}</div>`).join('')}
  </div>`;

  // ── Conseils ──
  if (r.tips?.length) {
    html += `<div class="card"><div class="ctitle">Conseils pour cette candidature</div>${r.tips.map(t=>`<div class="bullet">${esc(t)}</div>`).join('')}</div>`;
  }

  // ── Lettre de motivation ──
  if (r.cover_letter) {
    html += `<div class="card">
      <div class="ctitle-row">
        <span class="ctitle">Lettre de motivation</span>
        <span style="font-size:11px;color:var(--sand-dark);background:var(--sand-bg);border:1px solid #D4B98A;padding:3px 9px;border-radius:100px;font-weight:600">✨ Suggestion IA — à personnaliser</span>
      </div>
      <div style="display:flex;gap:7px;margin-bottom:12px">
        <button class="btn btn-g" style="font-size:12.5px" onclick="copyLetter()">📋 Copier</button>
        <button class="btn btn-g" style="font-size:12.5px" onclick="downloadLetter()">📤 Télécharger</button>
      </div>
      <div class="covl" id="cover-letter-txt">${esc(r.cover_letter)}</div>
    </div>`;
  }

  container.innerHTML = html;
  window._coverLetter = r.cover_letter || '';
}

function copyLetter() { navigator.clipboard.writeText(window._coverLetter || ''); toast('📋 Lettre copiée dans le presse-papier'); }
function downloadLetter() {
  const blob = new Blob([window._coverLetter || ''], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a'); a.href = url; a.download = 'lettre-motivation.txt';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('📥 Lettre téléchargée');
}
