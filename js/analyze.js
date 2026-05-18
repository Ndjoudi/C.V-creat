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

// ── EXTRACTION LOCALE (0 token) ────────────────────────────
function extractJobInfoLocal(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const lower = text.toLowerCase();

  // Titre = 1ère ligne non vide courte (≤80 chars)
  const title = lines.find(l => l.length <= 80 && l.length > 3) || '';

  // Entreprise = 2ème ligne courte ou après · ou "chez"
  const coLine = lines.find((l, i) => i > 0 && i < 6 && l.length <= 60 && l !== title) || '';

  // Salaire = ligne courte (≤80 chars) avec € et chiffres
  const salRaw = lines.find(l => l.length <= 80 && /\d/.test(l) && l.includes('€')) || '';
  // Retire la partie contrat si collée ("De 50 000€ à 60 000€ par an - CDI" → "De 50 000€ à 60 000€ par an")
  const salLine = salRaw.replace(/\s*[-–]\s*(cdi|cdd|intérim|stage|alternance|temps plein|temps partiel).*/i, '').trim();

  // Contrat
  const contractMatch = lower.match(/\b(cdi|cdd|intérim|interim|stage|alternance|temps plein|temps partiel|freelance|indépendant)\b/);
  const contractType = contractMatch ? contractMatch[1].toUpperCase().replace('INTERIM','Intérim') : '';

  // Lieu = ligne COURTE (≤60 chars) avec code postal ou nom de ville seul
  const locLine = lines.find(l =>
    l.length <= 60 && (
      /\b\d{5}\b/.test(l) ||
      /^(Paris|Lyon|Marseille|Bordeaux|Lille|Nantes|Toulouse|Roissy|Créteil|Sartrouville|Massy|Versailles|Mitry|Marne|Seine|Val|Île-de-France)[\s,\-]/i.test(l) ||
      /\b(cedex|\d{2}e?)\b/i.test(l)
    )
  ) || '';

  // Télétravail
  const remoteMatch = lower.match(/\b(télétravail|teletravail|remote|hybride|hybrid|présentiel)\b/);
  const remote = remoteMatch ? remoteMatch[1] : '';

  return { title, company: coLine, salary: salLine, contractType, location: locLine, remote };
}

// ── SCORING LOCAL (0 token) ─────────────────────────────────
function computeLocalScore(offerText, profileSkills, mustHave, niceToHave, profile) {
  const p = profile || {};
  const offerLower = offerText.toLowerCase();

  // ── Textes du profil par couche ──
  const skillsText = profileSkills.filter(s => typeof s === 'string').join(' ').toLowerCase();

  const expText = (p.experiences||[]).map(e =>
    [e.title||'', e.company||'', e.description||'', ...(e.bullets||[]).map(b=>b.text||'')].join(' ')
  ).join(' ').toLowerCase();

  const summaryText = ((p.summary||'') + ' ' + (p.title||'')).toLowerCase();

  const fullProfileText = [skillsText, expText, summaryText].join(' ');

  function reMatch(kw, text) {
    if (typeof kw !== 'string' || !kw.trim() || !text) return false;
    try {
      const re = new RegExp(`(?<![\\wÀ-öø-ÿ])${kw.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?![\\wÀ-öø-ÿ])`, 'i');
      return re.test(text);
    } catch { return text.includes(kw.toLowerCase()); }
  }

  // ── keywords_present : skills profil trouvés dans l'offre ──
  const present = profileSkills
    .filter(s => typeof s === 'string' && s.trim().length > 1)
    .filter(s => reMatch(s, offerLower));

  // ── keywords_missing : exigences de l'offre absentes du profil complet ──
  const allOfferKw = [...(mustHave||[]), ...(niceToHave||[])];
  const missing = allOfferKw.filter(kw => !reMatch(kw, fullProfileText));

  // ── Mots-clés significatifs de l'offre (4+ chars, hors stop words) ──
  const stopWords = new Set(['dans','pour','avec','être','avoir','nous','vous','cette','votre','leur','leurs','notre','entre','comme','mais','dont','plus','très','bien','tout','tous','toute','toutes','aussi','même','alors','ainsi','donc','lors','selon','après','avant','sans','sous','vers','chez','dont','déjà','encore','souvent','parfois','jamais','toujours']);
  const offerWords = [...new Set((offerLower.match(/\b[a-zÀ-öø-ÿ]{4,}\b/g) || []).filter(w => !stopWords.has(w)))];

  // ── Score Compétences : skills du profil trouvés dans l'offre ──
  const skillsInOffer = present.length; // déjà calculé
  const skillsTotal   = profileSkills.filter(s => typeof s === 'string' && s.trim().length > 1).length;
  // + bonus must_have/nice_to_have trouvés dans les skills
  const mustTotal  = (mustHave||[]).length;
  const niceTotal  = (niceToHave||[]).length;
  const mustInSkills = (mustHave||[]).filter(kw => reMatch(kw, skillsText)).length;
  const niceInSkills = (niceToHave||[]).filter(kw => reMatch(kw, skillsText)).length;
  const mustBonus    = mustTotal > 0 ? (mustInSkills / mustTotal) * 30 : 0;
  const skillsBase   = skillsTotal > 0 ? (skillsInOffer / skillsTotal) * 70 : 0;
  const scoreCompetences = Math.min(Math.round(skillsBase + mustBonus), 100);

  // ── Score Expériences : mots-clés de l'offre trouvés dans expériences + compétences ──
  // On utilise fullProfileText pour éviter un score 0 si les descriptions sont courtes
  const expHits   = offerWords.filter(w => fullProfileText.includes(w)).length;
  const expRaw    = offerWords.length > 0 ? (expHits / offerWords.length) * 400 : 0;
  const scoreExp  = Math.min(Math.round(expRaw), 100);

  // ── Score Résumé : mots-clés de l'offre trouvés dans accroche/titre ──
  const summaryHits  = offerWords.filter(w => summaryText.includes(w)).length;
  const summaryRaw   = offerWords.length > 0 ? (summaryHits / offerWords.length) * 500 : 0;
  const scoreResume  = Math.min(Math.round(summaryRaw), 100);

  // ── Score global pondéré ──
  const scoreGlobal = Math.round(scoreExp * 0.55 + scoreCompetences * 0.30 + scoreResume * 0.15);

  return {
    keywords_present:  present,
    keywords_missing:  missing,
    score_competences: Math.min(scoreCompetences, 100),
    score_experience:  Math.min(scoreExp, 100),
    score_resume:      Math.min(scoreResume, 100),
    score_global:      Math.min(scoreGlobal, 100),
  };
}

// ── EXTRACTION EXIGENCES LOCALE (0 token) ──────────────────
function extractRequirementsLocal(offerText) {
  const lines = offerText.split('\n').map(l => l.trim()).filter(l => l.length > 8 && l.length < 200);

  const mustSignals = [
    // Mots explicites
    /\b(obligatoire|requis|impératif|exigé|exigée|indispensable|nécessaire|incontournable|impérative)\b/i,
    // Expérience obligatoire
    /\bexpérience (confirmée|significative|solide|requise|obligatoire|exigée|avérée|démontrée|éprouvée|réussie)\b/i,
    /\b\d+\s*ans?\s*(d[' ]expérience|minimum|requis|exigés?)\b/i,
    /\bminimum\s+\d+\s*ans?\b/i,
    /\bexpérience (de|en|dans).{0,40}(minimum|requise|obligatoire|exigée)\b/i,
    // Maîtrise
    /\b(excellente?|parfaite?|solide|bonne?|grande?|haute?)\s+maîtrise\b/i,
    /\bmaîtrise\s+(obligatoire|indispensable|requise|exigée|impérative)\b/i,
    /\bmaîtrisez?\b/i,
    // Formation / diplôme
    /\b(bac\s*\+?\s*\d|master\s*\d?|licence|mba|ingénieur|diplôme)\b/i,
    /\b(formation (requise|obligatoire|exigée|en)|niveau bac)\b/i,
    /\btitulaire (d[ue'n]|d[' ]un)\b/i,
    /\bissu[e]? (de|d[' ]une) (formation|école|université)\b/i,
    // Verbes forts au présent
    /\bvous (devez|maîtrisez|justifiez|possédez|disposez|démontrez|présentez|avez impérativement)\b/i,
    /\b(doit|doivent) (maîtriser|posséder|justifier|disposer|avoir)\b/i,
    // Connaissance obligatoire
    /\bconnaissance (approfondie|solide|parfaite|obligatoire|requise|exigée)\b/i,
    /\bà l'aise (avec|sur|en)\b/i,
    /\bcapacité (avérée|démontrée|requise) (à|de)\b/i,
  ];

  const niceSignals = [
    // Préférence
    /\b(idéalement|de préférence|dans l'idéal|si possible|dans l'idéal)\b/i,
    /\bde préférence\b/i,
    // Atout / plus
    /\bun plus\b/i,
    /\b(serait?|sera|constitue?|représente?) un (plus|atout|avantage)\b/i,
    /\b(est|serait?) (apprécié|appréciée|un atout|bienvenu)\b/i,
    /\batout\b/i,
    // Souhaité / apprécié
    /\b(apprécié|appréciée|souhaité|souhaitée|bienvenu|bienvenue)(s?)\b/i,
    /\b(recommandé|recommandée|suggéré|suggérée)(s?)\b/i,
    // Une expérience en... serait
    /\bune expérience (en|dans|sur).{0,60}(serait|sera|est un)\b/i,
    /\bla (connaissance|maîtrise) de?.{0,40}(serait|est un|sera)\b/i,
    // Bonus / optionnel
    /\b(optionnel|facultatif|bonus)\b/i,
    /\bserait un\b/i,
  ];

  // Détecte la section "Profil recherché"
  const profilIdx = lines.findIndex(l => /^(profil recherché|profil candidat|votre profil|ce que nous recherchons)/i.test(l));

  const mustRaw = new Set();
  const niceRaw = new Set();

  const stopWords = new Set(['de','du','des','la','le','les','un','une','dans','pour','avec','et','ou','à','en','par','sur','au','aux','ce','cette','ces','votre','notre','vous','nous','son','ses','leur','leurs','qui','que','dont','où','afin','lors','notamment','ainsi','avoir','être','faire','savoir','pouvoir','devoir']);

  function cleanSkill(line) {
    return line
      // Retire les signaux
      .replace(/\b(obligatoire|requis|impératif|exigé|indispensable|nécessaire|idéalement|de préférence|un plus|serait? un atout|constitue un atout|apprécié|souhaité|bienvenu|expérience confirmée|expérience significative|excellente? maîtrise|bonne? maîtrise|solide maîtrise)\b/gi, '')
      // Retire ponctuation et mots parasites de début
      .replace(/^[\s:,;.•\-–—►▸*]+/, '')
      .replace(/\b(dans|d'|de|du|des|une|un|la|le|les|l'|au|aux|en|avec|pour|par)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function extractKeywords(raw) {
    const words = raw.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()));
    // Garde max 4 mots significatifs
    return words.slice(0, 4).join(' ').replace(/[,;:.]+$/, '').trim();
  }

  lines.forEach((line, idx) => {
    const isNice = niceSignals.some(p => p.test(line));
    const isMust = mustSignals.some(p => p.test(line));
    // Lignes dans la section "Profil recherché" → must par défaut
    const inProfilSection = profilIdx !== -1 && idx > profilIdx && idx < profilIdx + 20;

    if (isNice) {
      const kw = extractKeywords(cleanSkill(line));
      if (kw.length > 2) niceRaw.add(kw);
    } else if (isMust || inProfilSection) {
      const kw = extractKeywords(cleanSkill(line));
      if (kw.length > 2) mustRaw.add(kw);
    }
  });

  return {
    must_have:    [...mustRaw].slice(0, 10),
    nice_to_have: [...niceRaw].slice(0, 8),
  };
}

// ── ANALYSE CORE — appelable depuis tracker ou écran analyse ─
async function doAnalyzeCore(offerText, containerEl) {
  const p = ANON ? anonymize(P) : P;

  // ── 1. Extraction locale (0 token) ──
  const local = extractJobInfoLocal(offerText);

  // ── 2. Compétences du profil ──
  const profileSkills = [
    ...(p.technicalSkills||[]), ...(p.softSkills||[]),
    ...(p.tools||[]), ...(p.languages||[]),
    ...(p.subdomains||[]), ...(p.customSkills||[])
  ].filter(Boolean);

  // ── 3. Extraction locale des exigences (0 token, 0 API) ──
  const aiResult = extractRequirementsLocal(offerText);

  // ── 4. Score + keywords locaux (0 token) ──
  const localScore = computeLocalScore(offerText, profileSkills, aiResult.must_have, aiResult.nice_to_have, p);

  // ── 5. Fusion local ──
  const result = {
    poste:            local.title,
    entreprise:       local.company,
    location:         local.location,
    salary:           local.salary,
    contractType:     local.contractType,
    remote:           local.remote,
    score_global:     localScore.score_global,
    score_competences:localScore.score_competences,
    score_resume:     localScore.score_resume,
    score_experience: localScore.score_experience,
    must_have:        aiResult.must_have    || [],
    nice_to_have:     aiResult.nice_to_have || [],
    keywords_present: localScore.keywords_present,
    keywords_missing: localScore.keywords_missing,
    adapted_bullets:  [],
    tips:             [],
    cover_letter:     '',
  };

  renderAnalyzeResult(result, detectCVErrors(), containerEl);

  // Remplissage automatique des champs dashboard (évite un 2e appel API)
  if (result.poste)   { const el = document.getElementById('dash-poste'); if (el && !el.value) el.value = result.poste; }
  if (result.entreprise) { const el = document.getElementById('dash-co'); if (el && !el.value) el.value = result.entreprise; }

  // Mise à jour poste ciblé CV
  if (result.poste) {
    _cvTarget = result.poste;
    localStorage.setItem('sc_cv_target', _cvTarget);
    const ti = document.getElementById('cv-target-input');
    if (ti) ti.value = _cvTarget;
  }

  // Highlighting compétences
  const skillKw = [...(result.keywords_present||[]),...(result.must_have||[]),...(result.nice_to_have||[])].filter(Boolean);
  _matchedSkills = skillKw;
  localStorage.setItem('sc_matched_skills', JSON.stringify(_matchedSkills));

  // Historique
  const score = result.score_global ?? result.score ?? 0;
  const hist  = ls('sc_history', []);
  hist.unshift({ id: Date.now().toString(), date: new Date().toLocaleDateString('fr-FR'), poste: result.poste, entreprise: result.entreprise, score, result });
  if (hist.length > 20) hist.pop();
  ss('sc_history', hist);
  refreshBadges();
  return result;
}

// ── ANALYZE (écran dédié — conservé pour compatibilité) ─────
async function doAnalyze() {
  const offer = document.getElementById('offer-txt').value.trim();
  if (!offer) { toast('Colle d\'abord une offre d\'emploi'); return; }

  const btn   = document.getElementById('analyze-btn');
  const ldg   = document.getElementById('analyze-loading');
  const errEl = document.getElementById('analyze-error');
  const res   = document.getElementById('analyze-result');

  btn.disabled = true; btn.textContent = 'Analyse en cours...';
  ldg.classList.remove('hidden'); errEl.classList.add('hidden'); res.innerHTML = '';

  try {
    const result = await doAnalyzeCore(offer, res);
    toast(result.poste ? 'Poste ciblé mis à jour : ' + result.poste : 'Analyse sauvegardée');
  } catch (e) {
    errEl.textContent = groqErrorMessage(e);
    errEl.classList.remove('hidden');
  } finally {
    ldg.classList.add('hidden');
    btn.disabled = false; btn.innerHTML = 'Analyser avec l\'IA';
  }
}

// ── SHARED RESULT RENDERER ─────────────────────────────────
function renderAnalyzeResult(r, cvErrors, container) {
  // Support ancien format (score) et nouveau (score_global)
  const sc  = r.score_global ?? r.score ?? 0;
  const col = sc >= 70 ? 'var(--teal)' : sc >= 50 ? '#D97706' : 'var(--red)';
  const bg  = sc >= 70 ? 'var(--teal-bg)'     : sc >= 50 ? 'var(--sand-bg)'  : 'var(--red-bg)';
  const bd  = sc >= 70 ? 'var(--teal-border)' : sc >= 50 ? 'var(--border)'   : 'var(--red-border)';
  const lbl = sc >= 70 ? 'Bonne compatibilité' : sc >= 50 ? 'Compatibilité moyenne' : 'Faible compatibilité';

  const circ = 2 * Math.PI * 36;
  const dash = (sc / 100) * circ;

  // ── Erreurs CV détectées en JS ──
  let errHtml = '';
  if (cvErrors && (cvErrors.errors.length || cvErrors.warnings.length)) {
    errHtml = `<div class="card" style="border-color:var(--border)">
      <div class="ctitle">Points à améliorer</div>
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


  container.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function copyLetter() { navigator.clipboard.writeText(window._coverLetter || ''); toast('Lettre copiée'); }
function downloadLetter() {
  const blob = new Blob([window._coverLetter || ''], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a'); a.href = url; a.download = 'lettre-motivation.txt';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Lettre téléchargée');
}

// ── BULLET MATCHING ─────────────────────────────────────────
async function proposeBulletMatches(result) {
  // Gather all bullets from all experiences
  const allBullets = [];
  P.experiences.forEach(exp => {
    (exp.bullets || []).forEach(b => {
      allBullets.push({ expId: exp.id, bId: b.id, text: b.text, expTitle: exp.title || '' });
    });
  });
  if (!allBullets.length) return; // no bullets yet, skip

  const overlay = document.getElementById('bullet-match-overlay');
  const listEl  = document.getElementById('bullet-match-list');
  document.getElementById('bullet-match-title').innerHTML = '<i data-lucide="target" style="width:16px;height:16px;vertical-align:-3px;margin-right:6px"></i>Bullets correspondant à l\'offre';
  document.getElementById('bullet-match-sub').textContent = 'L\'IA analyse tes réalisations vs l\'offre — valide ou ajuste la sélection';
  listEl.innerHTML = '<div class="ldg"><div class="sp"></div>Analyse des bullets en cours...</div>';
  overlay.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons();

  const prompt = `Tu es un expert RH. Pour ce poste, identifie quels bullets du candidat sont les plus pertinents.

POSTE : ${result.poste || ''} chez ${result.entreprise || ''}
MOTS-CLÉS DE L'OFFRE : ${(result.keywords_missing || []).concat(result.keywords_present || []).join(', ')}
MUST-HAVE : ${(result.must_have || []).join(', ')}

BULLETS DU CANDIDAT (avec leurs IDs) :
${allBullets.map((b, i) => `[${i}] (${b.expTitle}) ${b.text}`).join('\n')}

Réponds UNIQUEMENT en JSON: {"selected": [0, 2, 4], "scores": [95, 78, 65]}
- "selected": indices des bullets les plus pertinents pour cette offre (max 6)
- "scores": score de pertinence 0-100 pour chaque bullet sélectionné (même ordre)`;

  try {
    const raw  = await callGroq(prompt, { maxTokens: 300, temperature: 0.2 });
    const data = safeParseJSON(raw);
    const selected = data.selected || [];
    const scores   = data.scores   || [];

    if (!selected.length) {
      listEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--ink3);font-size:13px">Aucun bullet particulièrement ciblé pour cette offre.<br>Ajoute des réalisations dans tes expériences pour améliorer le matching.</div>';
      return;
    }

    // Store for confirm
    overlay.dataset.matches = JSON.stringify(selected.map((idx, rank) => ({
      expId: allBullets[idx]?.expId,
      bId:   allBullets[idx]?.bId,
      score: scores[rank] || 0
    })).filter(m => m.expId));

    listEl.innerHTML = selected.map((idx, rank) => {
      const b = allBullets[idx];
      if (!b) return '';
      const sc = scores[rank] || 0;
      const col = sc >= 80 ? 'var(--teal)' : sc >= 60 ? '#D97706' : '#6E6E73';
      const bg  = sc >= 80 ? 'var(--teal-bg)' : sc >= 60 ? '#FFFBEB' : 'var(--bg)';
      return `<label class="bmatch-item">
        <input type="checkbox" id="bm-${rank}" checked style="flex-shrink:0;margin-top:3px;accent-color:#000;width:15px;height:15px"/>
        <div style="flex:1">
          <div style="font-size:11px;color:var(--ink3);margin-bottom:2px">${esc(b.expTitle)}</div>
          <div style="font-size:13px;color:var(--ink);line-height:1.55">${esc(b.text)}</div>
        </div>
        <span class="bmatch-score" style="color:${col};background:${bg};border:1px solid ${col}">${sc}%</span>
      </label>`;
    }).join('');
    if (typeof lucide !== 'undefined') lucide.createIcons();
  } catch(err) {
    listEl.innerHTML = '<div style="color:var(--red);padding:14px">Erreur lors du matching. Tes bullets sont inchangés.</div>';
  }
}

function confirmBulletMatch() {
  const overlay  = document.getElementById('bullet-match-overlay');
  const matches  = JSON.parse(overlay.dataset.matches || '[]');
  // Deselect all
  P.experiences.forEach(exp => { (exp.bullets||[]).forEach(b => { b.selected = false; }); });
  // Select checked
  let count = 0;
  const checkboxes = overlay.querySelectorAll('input[type=checkbox]');
  matches.forEach((m, i) => {
    if (checkboxes[i]?.checked) {
      const exp = P.experiences.find(e => e.id === m.expId);
      const b   = (exp?.bullets||[]).find(b => b.id === m.bId);
      if (b) { b.selected = true; count++; }
    }
  });
  ss('sc_profile', P);
  overlay.classList.add('hidden');
  toast(count + ' bullet' + (count>1?'s':'') + ' sélectionné' + (count>1?'s':'') + ' pour ce CV');
}

function closeBulletMatch() { document.getElementById('bullet-match-overlay').classList.add('hidden'); }
