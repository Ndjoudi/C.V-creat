// ── PROFILE HIGHLIGHT BUILDER ──────────────────────────────
function buildProfileHighlight() {
  const cfg = P.highlightConfig || {};
  const segments = [];

  if (cfg.formation) {
    const edu = P.education && P.education[0];
    if (edu && edu.degree) {
      let s = `<span class="cv-phi-plain">En cursus </span>`;
      s += `<strong class="cv-phi-formation">${esc(edu.degree)}</strong>`;
      if (edu.school) s += `<span class="cv-phi-plain"> à </span><strong class="cv-phi-school">${esc(edu.school)}</strong>`;
      if (edu.year)   s += `<span class="cv-phi-year">, diplômé(e) ${esc(edu.year)}</span>`;
      segments.push(s);
    } else if (P.yearsExp) {
      segments.push(`<span class="cv-phi-plain">Fort(e) de </span><strong class="cv-phi-formation">${esc(P.yearsExp)} d'expérience</strong>`);
    }
  }

  const pills = [];
  if (cfg.contrat  && P.contratRecherche) pills.push(`<span class="cv-phi-pill cv-phi-pill--dark">${esc(P.contratRecherche)}</span>`);
  if (cfg.dispo    && P.disponibilite)    pills.push(`<span class="cv-phi-plain" style="font-size:11px">Disponible </span><span class="cv-phi-pill cv-phi-pill--green">${esc(P.disponibilite)}</span>`);
  if (cfg.mobility && P.mobility)         pills.push(`<span class="cv-phi-pill cv-phi-pill--blue">${esc(P.mobility)}</span>`);
  if (cfg.permis   && P.permis)           pills.push(`<span class="cv-phi-pill cv-phi-pill--gray">${esc(P.permis)}</span>`);
  if (pills.length) segments.push(pills.join(''));

  if (!segments.length) return '';
  return `<div class="cv-profile-highlight">${segments.map(s => `<div class="cv-phi-line">${s}</div>`).join('')}</div>`;
}

// ── HIGHLIGHT TOGGLES ──────────────────────────────────────
const HIGHLIGHT_CHIPS = [
  { key:'formation', label:'Formation'     },
  { key:'contrat',   label:'Contrat'       },
  { key:'dispo',     label:'Disponibilité' },
  { key:'mobility',  label:'Mobilité'      },
  { key:'permis',    label:'Permis'        },
];

function toggleHighlight(key) {
  P.highlightConfig[key] = !P.highlightConfig[key];
  ss('sc_profile', P);
  renderHighlightToggles();
  renderCV();
}

function renderHighlightToggles() {
  const el = document.getElementById('profile-highlight-chips');
  if (!el) return;
  el.innerHTML = HIGHLIGHT_CHIPS.map(c => {
    const on = P.highlightConfig[c.key];
    return `<button onclick="toggleHighlight('${c.key}')" class="cv-hi-chip${on ? ' on' : ''}">${c.label}</button>`;
  }).join('');
}

// ── SKILL MATCH HELPER ─────────────────────────────────────
// Retourne true si la compétence correspond à un mot-clé de la dernière offre analysée
// Matching flou : "Excel avancé" matche si l'offre mentionne "Excel" (et inversement)
function isMatchedSkill(skill) {
  if (!_matchedSkills || !_matchedSkills.length) return false;
  const s = skill.toLowerCase().trim();
  return _matchedSkills.some(kw => {
    const k = (kw || '').toLowerCase().trim();
    if (!k || k.length < 2) return false;
    return s.includes(k) || k.includes(s);
  });
}

// ── HELPERS ────────────────────────────────────────────────

// Parse a description into bullet points or plain text
function renderDescription(text) {
  if (!text) return '';
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Detect if the text uses bullet markers
  const hasBullets = lines.some(l => /^[•\-\*▪▸→>]/.test(l));

  if (hasBullets) {
    const items = lines.map(l => l.replace(/^[•\-\*▪▸→>\s]+/, '').trim()).filter(Boolean);
    return `<ul class="cv-bullets">${items.map(item =>
      `<li class="cv-bullet-item"><span class="cv-bullet-dot">▸</span><span>${esc(item)}</span></li>`
    ).join('')}</ul>`;
  }

  // Multiple lines without markers → treat each as a bullet
  if (lines.length > 1) {
    return `<ul class="cv-bullets">${lines.map(line =>
      `<li class="cv-bullet-item"><span class="cv-bullet-dot">▸</span><span>${esc(line)}</span></li>`
    ).join('')}</ul>`;
  }

  // Single block of text
  return `<div class="cv-edesc">${esc(text)}</div>`;
}

// ── CV TARGET ──────────────────────────────────────────────
function setCVTarget(val) {
  _cvTarget = val.trim();
  localStorage.setItem('sc_cv_target', _cvTarget);
  renderCV();
}


// ── CV RENDER ──────────────────────────────────────────────
function renderCV() {
  const empty = !P.firstName;
  document.getElementById('cv-empty').classList.toggle('hidden', !empty);
  document.getElementById('cv-content').classList.toggle('hidden', empty);
  if (empty) return;

  // Restore target input if set
  const targetInput = document.getElementById('cv-target-input');
  if (targetInput && !targetInput.value && _cvTarget) targetInput.value = _cvTarget;

  // ── Header ──
  const displayTitle = _cvTarget || P.title;

  // LinkedIn: clickable link
  const liUrl = P.linkedin ? (P.linkedin.startsWith('http') ? P.linkedin : 'https://' + P.linkedin) : '';
  const liShort = P.linkedin ? P.linkedin.replace(/^https?:\/\/(www\.)?linkedin\.com\//, 'linkedin.com/') : '';

  const contacts = [
    P.email ? `<span>${esc(P.email)}</span>` : '',
    P.phone ? `<span>${esc(P.phone)}</span>` : '',
    P.location ? `<span>${esc(P.location)}</span>` : '',
    liUrl    ? `<span><a href="${liUrl}" style="color:inherit;text-decoration:none">${esc(liShort)}</a></span>` : ''
  ].filter(Boolean).join('');

  const extras = [P.disponibilite, P.mobility, P.permis].filter(Boolean);
  const extraLine = extras.map(e => `<span>${esc(e)}</span>`).join('');

  // Right-side: photo only
  const rightCol = P.photo ? `
    <div style="flex-shrink:0">
      <img src="${P.photo}" class="cv-photo"/>
    </div>` : '';

  let html = `
  <div class="cv-hd">
    <div style="flex:1">
      <div class="cv-nm">${esc(P.firstName)} ${esc(P.lastName)}</div>
      ${displayTitle ? `<div class="cv-ti">${esc(displayTitle)}</div>` : ''}
      ${contacts ? `<div class="cv-contact-line">${contacts}</div>` : ''}
      ${extraLine ? `<div class="cv-contact-line" style="margin-top:3px">${extraLine}</div>` : ''}
    </div>
    ${rightCol}
  </div>
  <div class="cv-div"></div>`;

  // ── Profil : bloc highlight auto + texte complémentaire ──
  const highlightBlock = buildProfileHighlight();
  const fullSummary    = [P.summary, P.summaryTarget].filter(Boolean).join(' ');
  if (highlightBlock || fullSummary) {
    html += `<div class="cv-sec">
      <div class="cv-stitle">Profil</div>
      ${highlightBlock}
      ${fullSummary ? `<div class="cv-summary-text"${highlightBlock ? ' style="margin-top:9px"' : ''}>${esc(fullSummary)}</div>` : ''}
    </div>`;
  }

  // ── Expériences ──
  if (P.experiences.length) {
    html += `<div class="cv-sec"><div class="cv-stitle">Expériences professionnelles</div>`;
    P.experiences.forEach(e => {
      // Show bullets if any exist (required or selected), otherwise fall back to description
      const activeBullets = (e.bullets || []).filter(b => b.required || b.selected);
      const bodyHtml = activeBullets.length
        ? `<ul class="cv-bullets">${activeBullets.map(b => `<li class="cv-bullet-item"><span class="cv-bullet-dot">▸</span><span>${esc(b.text)}</span></li>`).join('')}</ul>`
        : renderDescription(e.description);
      html += `<div class="cv-exp">
        <div class="cv-erow">
          <div class="cv-etitle">${esc(e.title)}${e.contractType ? ' <span style="font-size:10px;font-weight:600;padding:1px 6px;border-radius:100px;background:#F2F2F2;color:#6E6E73;border:1px solid #D2D2D7;vertical-align:middle;margin-left:5px">' + esc(e.contractType) + '</span>' : ''}</div>
          <div class="cv-edates">${esc(e.duration)}</div>
        </div>
        ${e.company ? `<div class="cv-eco">${esc(e.company)}${e.sector ? ' · ' + esc(e.sector) : ''}${e.location ? ' · ' + esc(e.location) : ''}</div>` : ''}
        ${bodyHtml}
      </div>`;
    });
    html += `</div>`;
  }

  // ── Formation ──
  if (P.education.length) {
    html += `<div class="cv-sec"><div class="cv-stitle">Formation</div>`;
    P.education.forEach(e => {
      html += `<div class="cv-exp">
        <div class="cv-erow">
          <div class="cv-etitle">${esc(e.degree)}</div>
          <div class="cv-edates">${esc(e.year)}</div>
        </div>
        ${e.school ? `<div class="cv-eco">${esc(e.school)}${e.mention ? ' · ' + esc(e.mention) : ''}</div>` : ''}
      </div>`;
    });
    html += `</div>`;
  }

  // ── Compétences en tags ──
  const hasSkills = P.subdomains.length || P.tools.length || P.certifs.length || P.customSkills.length || P.informatique.length;
  if (hasSkills) {
    const hasMatches = _matchedSkills && _matchedSkills.length > 0;
    const legendHtml = hasMatches
      ? `<span class="cv-match-legend"><span class="cv-match-dot"></span>Demandé dans cette offre</span>`
      : '';
    html += `<div class="cv-sec">
      <div class="cv-stitle-row">
        <div class="cv-stitle">Compétences et Outils</div>
        ${legendHtml}
      </div>`;

    // Helper : retourne la classe CSS correcte selon match
    const tagClass = s => `cv-skill-tag${isMatchedSkill(s) ? ' cv-skill-tag--match' : ''}`;

    if (P.subdomains.length) {
      html += `<div class="cv-skill-row">
        <div class="cv-skill-key">Domaines</div>
        <div class="cv-skill-tags">${P.subdomains.map(s => `<span class="${tagClass(s)}">${esc(s)}</span>`).join('')}</div>
      </div>`;
    }
    if (P.tools.length) {
      html += `<div class="cv-skill-row">
        <div class="cv-skill-key">Outils SC</div>
        <div class="cv-skill-tags">${P.tools.map(s => `<span class="${tagClass(s)}">${esc(s)}</span>`).join('')}</div>
      </div>`;
    }
    if (P.informatique.length) {
      html += `<div class="cv-skill-row">
        <div class="cv-skill-key">Bureautique</div>
        <div class="cv-skill-tags">${P.informatique.map(s => `<span class="${tagClass(s)}">${esc(s)}</span>`).join('')}</div>
      </div>`;
    }
    if (P.certifs.length) {
      html += `<div class="cv-skill-row">
        <div class="cv-skill-key">Certifications</div>
        <div class="cv-skill-tags">${P.certifs.map(s => `<span class="${tagClass(s)}">${esc(s)}</span>`).join('')}</div>
      </div>`;
    }
    if (P.customSkills.length) {
      html += `<div class="cv-skill-row">
        <div class="cv-skill-key">Autres</div>
        <div class="cv-skill-tags">${P.customSkills.map(s => `<span class="${tagClass(s)}">${esc(s)}</span>`).join('')}</div>
      </div>`;
    }
    html += `</div>`;
  }

  // ── Langues ──
  if (P.languages.length) {
    html += `<div class="cv-sec">
      <div class="cv-stitle">Langues</div>
      <div class="cv-lang-row">${P.languages.map(l =>
        `<div class="cv-lang-item">
          <span class="cv-lang-name">${esc(l.name)}</span>
          <span class="cv-lang-level">— ${esc(l.level)}</span>
        </div>`
      ).join('')}</div>
    </div>`;
  }

  // ── Secteurs ──
  if (P.sectors.length) {
    html += `<div class="cv-sec">
      <div class="cv-stitle">Secteurs</div>
      <div class="cv-skill-tags">${P.sectors.map(s => `<span class="cv-skill-tag">${esc(s)}</span>`).join('')}</div>
    </div>`;
  }

  // ── Centres d'intérêt ──
  if (P.hobbies) {
    html += `<div class="cv-sec">
      <div class="cv-stitle">Centres d'intérêt</div>
      <div class="cv-summary-text">${esc(P.hobbies)}</div>
    </div>`;
  }

  document.getElementById('cv-doc').innerHTML = html;
}

// ── ANALYSE DU CV ──────────────────────────────────────────
async function analyzeCV() {
  if (!P.firstName) { toast('Renseigne d\'abord ton profil'); return; }

  const btn    = document.getElementById('analyze-cv-btn');
  const result = document.getElementById('cv-analysis-result');

  btn.disabled = true; btn.textContent = 'Analyse en cours...';
  result.innerHTML = `<div class="ldg"><div class="sp"></div>Analyse de ton CV en cours...</div>`;

  // ── Partie 1 : détection d'erreurs JS (instantané) ──
  const { errors, warnings } = detectCVErrors();

  // ── Partie 2 : analyse IA de la qualité du contenu ──
  const cvText = [
    P.title ? 'Titre : ' + P.title : '',
    P.yearsExp ? 'Expérience : ' + P.yearsExp : '',
    P.summary ? 'Résumé : ' + P.summary : '',
    P.experiences.length ? 'Expériences :\n' + P.experiences.map(e =>
      `- ${e.title} chez ${e.company} (${e.duration})\n${e.description || '(pas de description)'}`
    ).join('\n') : '',
    P.tools.length ? 'Outils : ' + P.tools.join(', ') : '',
    P.certifs.length ? 'Certifications : ' + P.certifs.join(', ') : '',
  ].filter(Boolean).join('\n\n');

  const prompt = `Tu es un expert en recrutement supply chain. Analyse la qualité de ce CV et donne des recommandations concrètes.

RÈGLES D'ÉVALUATION (basées sur les meilleures pratiques ATS 2025) :
- Un bon résumé : 50-80 mots, au moins 1 chiffre, ciblé sur la valeur ajoutée
- Bons bullet points : verbe d'action fort (Optimisé, Piloté, Déployé...) + résultat chiffré (formule APR)
- Mauvais bullet points : "Responsable de", "En charge de", sans chiffres, trop vagues
- Score ATS optimal : 65-75% de correspondance avec les offres cibles
- Signale ce qui est fort ET ce qui doit être amélioré

CV À ANALYSER :
${cvText}

Réponds UNIQUEMENT en JSON valide sans markdown :
{
  "score_qualite": 72,
  "points_forts": ["Point fort 1 concret", "Point fort 2"],
  "ameliorations": [
    {"priorite": "haute", "section": "Résumé", "probleme": "...", "suggestion": "..."},
    {"priorite": "moyenne", "section": "Expériences", "probleme": "...", "suggestion": "..."}
  ],
  "verdict": "Phrase de synthèse en 1-2 phrases sur l'état global du CV"
}`;

  try {
    const raw  = await callGroq(prompt, { maxTokens: 1200, temperature: 0.3 });
    const data = safeParseJSON(raw);
    renderCVAnalysis(data, errors, warnings, result);
  } catch (e) {
    // Si l'IA échoue, on affiche quand même les erreurs JS
    renderCVAnalysis(null, errors, warnings, result);
  } finally {
    btn.disabled = false; btn.textContent = 'Analyser mon CV';
  }
}

function renderCVAnalysis(ai, errors, warnings, container) {
  let html = '';

  // ── Score + verdict IA ──
  if (ai) {
    const sc  = ai.score_qualite || 0;
    const col = sc >= 70 ? 'var(--teal)' : sc >= 50 ? '#D97706' : 'var(--red)';
    const bg  = sc >= 70 ? 'var(--teal-bg)' : sc >= 50 ? 'var(--sand-bg)' : 'var(--red-bg)';
    const bd  = sc >= 70 ? 'var(--teal-border)' : sc >= 50 ? 'var(--border)' : 'var(--red-border)';

    html += `<div class="card" style="background:${bg};border-color:${bd};margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div style="font-size:36px;font-weight:800;color:${col};line-height:1">${sc}<span style="font-size:18px">/100</span></div>
        <div style="flex:1">
          <div style="font-size:13.5px;font-weight:600;color:var(--ink);margin-bottom:4px">Qualité globale du CV</div>
          <div style="font-size:13px;color:var(--ink2);line-height:1.6">${esc(ai.verdict || '')}</div>
        </div>
        <button onclick="document.getElementById('cv-analysis-result').innerHTML=''" style="background:none;border:none;cursor:pointer;color:var(--ink3);font-size:20px;padding:4px;line-height:1" title="Fermer">×</button>
      </div>
    </div>`;

    // Points forts
    if (ai.points_forts?.length) {
      html += `<div class="card" style="margin-bottom:12px">
        <div class="ctitle" style="color:var(--teal)">Points forts</div>
        ${ai.points_forts.map(p => `<div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid var(--border2);font-size:13px;align-items:flex-start">
          <span style="color:var(--teal);font-weight:700;flex-shrink:0">✓</span>
          <span style="color:var(--ink2)">${esc(p)}</span>
        </div>`).join('')}
      </div>`;
    }

    // Améliorations IA classées par priorité
    if (ai.ameliorations?.length) {
      const hautes  = ai.ameliorations.filter(a => a.priorite === 'haute');
      const moyennes = ai.ameliorations.filter(a => a.priorite !== 'haute');

      const renderAmelios = (items, col, bg, bd, label) => items.length ? `
        <div style="margin-bottom:10px">
          <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:${col};margin-bottom:8px">${label}</div>
          ${items.map(a => `<div style="background:${bg};border:1px solid ${bd};border-radius:var(--radius-sm);padding:12px 14px;margin-bottom:8px">
            <div style="font-size:12px;font-weight:700;color:${col};margin-bottom:4px">${esc(a.section || '')} — ${esc(a.probleme || '')}</div>
            <div style="font-size:12.5px;color:var(--ink2);line-height:1.6">→ ${esc(a.suggestion || '')}</div>
          </div>`).join('')}
        </div>` : '';

      html += `<div class="card" style="margin-bottom:12px">
        <div class="ctitle">Améliorations recommandées</div>
        ${renderAmelios(hautes,  'var(--red)',   'var(--red-bg)',  'var(--red-border)', 'Priorité haute')}
        ${renderAmelios(moyennes,'#D97706',     '#FFFBEB',       '#FDE68A',           'Priorité moyenne')}
      </div>`;
    }
  }

  // ── Erreurs détectées en JS (toujours fiables) ──
  if (errors.length || warnings.length) {
    html += `<div class="card" style="margin-bottom:12px">
      <div class="ctitle">Problèmes détectés</div>
      ${errors.map(e   => `<div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid var(--border2);font-size:13px;align-items:flex-start"><span style="color:var(--red);font-weight:700;flex-shrink:0">✗</span><span>${esc(e)}</span></div>`).join('')}
      ${warnings.map(w => `<div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid var(--border2);font-size:13px;align-items:flex-start"><span style="color:#D97706;font-weight:700;flex-shrink:0">!</span><span style="color:var(--ink2)">${esc(w)}</span></div>`).join('')}
    </div>`;
  }

  if (!html) {
    html = `<div class="card" style="border-color:var(--teal-border);background:var(--teal-bg)">
      <div style="font-size:14px;font-weight:700;color:var(--teal)">Ton CV semble en bon état</div>
    </div>`;
  }

  container.innerHTML = html;
  container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function printCV() {
  if (!P.firstName) { toast('Renseigne ton prénom dans le profil'); return; }
  const docHtml = document.getElementById('cv-doc').innerHTML;
  let wrapper = document.getElementById('cv-print-wrapper');
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.id = 'cv-print-wrapper';
    document.body.appendChild(wrapper);
  }
  wrapper.innerHTML = `<div class="cv-doc">${docHtml}</div>`;
  setTimeout(() => window.print(), 80);
}
