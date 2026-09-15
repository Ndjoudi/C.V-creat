// ── RENDU D'UNE PUCE ───────────────────────────────────────
// Texte simple : les mises en valeur sont posées après coup sur TOUT le CV
// par appliqueMisesEnValeur() (tracker.js), à l'identique dans « Mon CV »
// et dans la fenêtre d'annonce.
function renderBulletHtml(text) {
  return esc(text);
}

// ── MIGRATION : importe les emphases des overrides → P.emphases ────
(function migrateEmphases() {
  try {
    if (P._emphasesMigrated) return;
    const allKeys = Object.keys(localStorage).filter(k => k.startsWith('sc_cvov_'));
    allKeys.forEach(k => {
      const ov = JSON.parse(localStorage.getItem(k) || '{}');
      (ov.emphases || []).forEach(em => {
        if (!P.emphases.find(e => e.text.toLowerCase() === em.text.toLowerCase())) {
          P.emphases.push({ text: em.text, type: em.type, expIdx: em.expIdx });
        }
      });
    });
    P._emphasesMigrated = true;
    ss('sc_profile', P);
  } catch(e) {}
})();

// ── MIGRATION : supprime domainesProfile générique ─────────
if (typeof P !== 'undefined' && P.domainesProfile && !P._v3_hookMigrated) {
  P.domainesProfile = '';
  P._v3_hookMigrated = true;
  if (typeof ss === 'function') ss('sc_profile', P);
}

// ── PROFILE HIGHLIGHT BUILDER ──────────────────────────────
// Texte simple (plus de pastilles colorées) : un seul paragraphe continu,
// avec de vrais séparateurs « | » écrits dans le texte. Le retour à la ligne
// se fait seulement quand la largeur est pleine (gain de place sur le CV).
function buildProfileHighlight() {
  const sep    = '<span class="cv-sep"> | </span>';
  const lignes = [];

  // Formation (depuis education[0])
  const edu = P.education && P.education[0];
  if (edu && edu.degree) {
    const endYear = edu.year ? edu.year.trim().split(/\s*[-–—]\s*/).pop() : '';
    lignes.push(`Fin de cursus <strong>${esc(edu.degree)}</strong>`
      + (edu.school ? ` à <strong>${esc(edu.school)}</strong>` : '')
      + (endYear ? `, ${esc(endYear)}` : ''));
  } else if (P.yearsExp) {
    lignes.push(`Fort(e) de <strong>${esc(P.yearsExp)} d'expérience</strong>`);
  }

  // Contrat, disponibilité, mobilité, permis — à la suite de la formation
  const infos = [];
  if (P.contratRecherche) infos.push(`Contrat recherché : <strong>${esc(P.contratRecherche)}</strong>`);
  if (P.disponibilite)    infos.push(`Disponibilité : <strong>${esc(P.disponibilite)}</strong>`);
  if (P.mobility)         infos.push(`Mobilité : <strong>${esc(P.mobility)}</strong>`);
  if (P.permis) {
    // Évite « Permis : Permis B » quand la valeur contient déjà le mot
    infos.push(/permis/i.test(P.permis) ? `<strong>${esc(P.permis)}</strong>` : `Permis : <strong>${esc(P.permis)}</strong>`);
  }
  if (infos.length) lignes.push(infos.join(sep));

  if (!lignes.length) return '';
  return `<div class="cv-profile-highlight"><div class="cv-phi-line">${lignes.join(sep)}</div></div>`;
}

// ── MODÈLE UNIQUE ──────────────────────────────────────────
// Un seul CV, conçu pour être lu par les ATS. Les anciens profils
// (Classique, Moderne) basculent dessus automatiquement.
if (typeof P !== 'undefined' && P.cvTemplate !== 'ats') {
  P.cvTemplate = 'ats';
  try { ss('sc_profile', P); } catch {}
}

// ── STRIP HTML (nettoyage données legacy rich-editor) ───────
function stripHTML(html) {
  return (html || '')
    .replace(/<[^>]+>/g, ' ')   // remplace chaque balise par un espace (évite les mots collés)
    .replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── SKILL MATCH HELPER ─────────────────────────────────────
// Retourne true si la compétence correspond à un mot-clé de la dernière offre analysée
// Matching flou : "Excel avancé" matche si l'offre mentionne "Excel" (et inversement)
// Skills manuellement désélectionnés (blacklist, overrides l'auto-match)
let _deselectedSkills = JSON.parse(localStorage.getItem('sc_deselected_skills') || '[]');

function isMatchedSkill(skill) {
  if (!_matchedSkills || !_matchedSkills.length) return false;
  const s = skill.toLowerCase().trim();
  // Blacklist : désélectionné manuellement → jamais vert
  if (_deselectedSkills.some(d => d.toLowerCase() === s)) return false;
  return _matchedSkills.some(kw => {
    const k = (kw || '').toLowerCase().trim();
    if (!k || k.length < 2) return false;
    return s.includes(k) || k.includes(s);
  });
}

// ── TOGGLE COMPÉTENCE (sélection manuelle) ─────────────────
function toggleSkillMatch(skill) {
  const sl = skill.toLowerCase().trim();
  if (isMatchedSkill(skill)) {
    if (!_deselectedSkills.map(d=>d.toLowerCase()).includes(sl)) {
      _deselectedSkills.push(sl);
    }
    localStorage.setItem('sc_deselected_skills', JSON.stringify(_deselectedSkills));
  } else {
    _deselectedSkills = _deselectedSkills.filter(d => d.toLowerCase() !== sl);
    localStorage.setItem('sc_deselected_skills', JSON.stringify(_deselectedSkills));
    if (!_matchedSkills.map(k=>(k||'').toLowerCase()).includes(sl)) {
      _matchedSkills.push(skill);
      localStorage.setItem('sc_matched_skills', JSON.stringify(_matchedSkills));
    }
  }

  // Persiste les sélections manuelles dans la candidature courante
  const candId = window._splitCandId;
  if (candId) {
    try {
      const cands = JSON.parse(localStorage.getItem('sc_cands') || '[]');
      const idx   = cands.findIndex(x => x.id === candId);
      if (idx !== -1) {
        const a = cands[idx].analysis || {};
        const aiBase = [...(a.keywords_present||[]),...(a.must_have||[]),...(a.nice_to_have||[])].map(s=>s.toLowerCase());
        // Seulement les skills ajoutés manuellement (pas dans la base IA)
        cands[idx].manual_matched_skills   = _matchedSkills.filter(s => !aiBase.includes(s.toLowerCase()));
        cands[idx].manual_deselected_skills = [..._deselectedSkills];
        localStorage.setItem('sc_cands', JSON.stringify(cands));
      }
    } catch(e) {}
  }

  renderCV();
  if (typeof _refreshSplitCV === 'function' &&
      !document.getElementById('split-modal-overlay')?.classList.contains('hidden')) {
    _refreshSplitCV();
  }
}

// ── HIGHLIGHT MOTS-CLÉS DANS LES EXPÉRIENCES ──────────────
// Style subtil : soulignement vert + clic pour désélectionner
// (sans fond coloré pour garder le CV lisible)
function highlightMatchedInText(text) {
  if (!text) return esc(text);
  if (!_matchedSkills || !_matchedSkills.length) return esc(text);

  // Filtre les désélectionnés, trie par longueur desc (phrases avant mots)
  const kws = [..._matchedSkills]
    .filter(k => {
      if (!k || k.trim().length < 2) return false;
      return !_deselectedSkills.some(d => d.toLowerCase() === k.toLowerCase().trim());
    })
    .sort((a, b) => b.length - a.length);

  if (!kws.length) return esc(text);

  const hits = [];
  for (const kw of kws) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let re;
    try { re = new RegExp(`(?<![\\wÀ-öø-ÿ])${escaped}(?![\\wÀ-öø-ÿ])`, 'gi'); }
    catch { re = new RegExp(escaped, 'gi'); }
    let m;
    while ((m = re.exec(text)) !== null) {
      hits.push({ start: m.index, end: m.index + m[0].length, word: m[0], kw });
    }
  }

  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept = [];
  let cursor = 0;
  for (const h of hits) {
    if (h.start >= cursor) { kept.push(h); cursor = h.end; }
  }
  if (!kept.length) return esc(text);

  let html = '';
  let pos = 0;
  for (const h of kept) {
    html += esc(text.slice(pos, h.start));
    const sk = h.kw.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    // Soulignement vert subtil, cliquable pour désélectionner
    html += `<span onclick="toggleSkillMatch('${sk}')" title="✕ Cliquer pour masquer" style="border-bottom:2px solid #059669;font-weight:600;cursor:pointer;color:inherit">${esc(h.word)}</span>`;
    pos = h.end;
  }
  html += esc(text.slice(pos));
  return html;
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

// ── HELPER — construit la phrase d'accroche complète ───────
function _buildAccrocheText() {
  const poste = (typeof _cvTarget !== 'undefined' ? _cvTarget : '') || P.title || '[poste ciblé]';
  // 1. Champ accrocheIntro (nouveau, prioritaire)
  const intro = (P.accrocheIntro || '').trim();
  if (intro) {
    const clean = intro.replace(/[,.\s]+$/, ''); // enlève virgule/point final
    return `${clean}, je vise un poste de ${poste}.`;
  }
  // 2. Fallback auto depuis yearsExp + domainesProfile
  const y = P.yearsExp || '', d = P.domainesProfile || '';
  if (y || d) {
    let t = '';
    if (y) t += `Fort(e) de ${y}`;
    if (d) t += (y ? ' en ' : 'En ') + d;
    t += `, je vise un poste de ${poste}.`;
    return t;
  }
  // 3. Fallback : summaryTarget legacy
  return stripHTML(P.summaryTarget) || '';
}

// ── PRÉ-REMPLIR LA PARTIE LIBRE DE L'ACCROCHE ─────────────
function prefillAccroche() {
  const years  = P.yearsExp        || '';
  const domain = P.domainesProfile || '';
  let t = '';
  if (years)  t += `Fort de ${years}`;
  if (domain) t += (years ? ' en ' : 'En ') + domain;
  if (!t)     t  = 'Fort de [X ans] en [domaine]';
  const el = document.getElementById('p-accrocheIntro');
  if (el) {
    el.value = t;
    el.focus();
    el.setSelectionRange(t.length, t.length);
    saveProfile();
    renderCV();
    if (typeof _syncSplitCV === 'function') _syncSplitCV();
  }
}

// ── MISE À JOUR APERÇU ACCROCHE (profil form) ─────────────
function _updateAccrochePreview() {
  const intro = (P.accrocheIntro || '').trim();
  const poste = (typeof _cvTarget !== 'undefined' ? _cvTarget : '') || P.title || '[poste ciblé]';
  const prev  = document.getElementById('accroche-preview-text');
  const prevP = document.getElementById('accroche-preview-poste');
  if (!prev || !prevP) return;
  if (intro) {
    const clean = intro.replace(/[,.\s]+$/, '');
    prev.textContent  = clean + ', je vise un poste de ';
    prevP.textContent = poste + '.';
  } else {
    prev.textContent  = '[ta phrase], je vise un poste de ';
    prevP.textContent = poste + '.';
  }
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

  // Modèle unique, lisible par les ATS — règles détaillées dans le README
  const cvDoc = document.getElementById('cv-doc');
  // Un nouveau rendu remplace le CV : on quitte proprement un mode édition en cours
  if (cvDoc.dataset.editing === 'true' && typeof _exitCVEditMode === 'function') _exitCVEditMode('cv-doc');
  cvDoc.className = 'cv-doc cv-doc--ats';

  const displayTitle = _cvTarget || P.title;
  // Séparateur écrit dans le texte (un séparateur ajouté par le CSS est
  // invisible pour un ATS, qui colle alors les champs entre eux)
  const sep = '<span class="cv-sep"> | </span>';

  // ── En-tête : nom d'abord (l'ATS le cherche en tête), puis poste,
  //    puis coordonnées en toutes lettres — LinkedIn compris ──
  const liTexte  = P.linkedin ? P.linkedin.trim().replace(/^https?:\/\/(www\.)?/, '') : '';
  const contacts = [
    P.email    ? esc(P.email)    : '',
    P.phone    ? esc(P.phone)    : '',
    P.location ? esc(P.location) : '',
    // Texte court « 🔗 LinkedIn » : l'adresse complète reste dans le lien cliquable du PDF
    liTexte    ? `<a href="https://${esc(liTexte)}" class="cv-link cv-link--linkedin">🔗 LinkedIn</a>` : ''
  ].filter(Boolean).join(sep);

  let html = `
    <div class="cv-hd">
      <div class="cv-hd-main">
        ${displayTitle ? `<div class="cv-ats-poste">${esc(displayTitle)}</div>` : ''}
        <div class="cv-nm">${esc(P.firstName)} ${esc(P.lastName)}</div>
        ${contacts ? `<div class="cv-contact-line">${contacts}</div>` : ''}
      </div>
      ${P.photo ? `<img src="${P.photo}" class="cv-photo" alt="">` : ''}
    </div>
    <div class="cv-div"></div>`;

  // ── Profil ──
  const highlightBlock = buildProfileHighlight();
  const targetText     = _buildAccrocheText();
  let targetHtml = esc(targetText);
  if (displayTitle) {
    const posteEsc = esc(displayTitle);
    targetHtml = targetHtml.replace(posteEsc, `<span class="cv-accroche-poste">${posteEsc}</span>`);
  }
  if (highlightBlock || targetText) {
    html += `<div class="cv-sec">
      <div class="cv-stitle">Profil</div>
      ${highlightBlock}
      ${targetText ? `<div class="cv-summary-text cv-accroche">${targetHtml}</div>` : ''}
    </div>`;
  }

  // ── Expériences ──
  if (P.experiences.some(e => !e.cvMasque)) {
    html += `<div class="cv-sec"><div class="cv-stitle">Expériences professionnelles</div>`;
    P.experiences.forEach((e, i) => {
      if (e.cvMasque) return;   // masqué du CV, conservé dans le profil
      const activeBullets = (e.bullets || []).filter(b => b.required || b.selected);
      const expIdx = (typeof e._origIdx === 'number') ? e._origIdx : i;
      const bodyHtml = activeBullets.length
        ? `<ul class="cv-bullets">${activeBullets.map(b => `<li class="cv-bullet-item"><span class="cv-bullet-dot">•</span><span>${renderBulletHtml(b.text, expIdx)}</span></li>`).join('')}</ul>`
        : renderDescription(e.description);
      // L'intitulé reste SEUL sur sa ligne : collé au contrat et au rattachement,
      // l'ATS lisait « Poste CDI Rattaché au… » comme un seul titre de poste
      const lieu = [e.company, e.sector, e.location, e.duration].filter(Boolean).map(esc).join(sep);
      const meta = [
        e.contractType ? esc(e.contractType) : '',
        e.reportingTo  ? `Rattaché directement au ${esc(e.reportingTo)}` : ''
      ].filter(Boolean).join(sep);
      html += `<div class="cv-exp" data-exp-idx="${expIdx}">
        <div class="cv-etitle">${esc(e.title)}</div>
        ${lieu ? `<div class="cv-eco">${lieu}</div>` : ''}
        ${meta ? `<div class="cv-emeta">${meta}</div>` : ''}
        ${bodyHtml}
      </div>`;
    });
    html += `</div>`;
  }

  // ── Formation : une ligne par diplôme ──
  if (P.education.length) {
    html += `<div class="cv-sec"><div class="cv-stitle">Formation</div>`;
    P.education.forEach(e => {
      const endYear = e.year ? e.year.trim().split(/\s*[-–—]\s*/).pop() : '';
      const parts = [
        e.degree ? `<span class="cv-edu-degree">${esc(e.degree)}</span>` : '',
        ...[e.school, e.mention, endYear].filter(Boolean).map(esc)
      ].filter(Boolean);
      html += `<div class="cv-edu-row">${parts.join(sep)}</div>`;
    });
    html += `</div>`;
  }

  // ── Compétences : listes séparées par des virgules ──
  const hasSkills = P.subdomains.length || P.tools.length || P.certifs.length || P.customSkills.length || P.informatique.length;
  if (hasSkills) {
    html += `<div class="cv-sec"><div class="cv-stitle">Compétences</div>`;

    // Clic sur une compétence = la mettre en avant pour cette offre
    const tagEl = s => {
      const matched = isMatchedSkill(s);
      const sk = s.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      return `<span class="cv-skill-plain${matched ? ' cv-skill-plain--match' : ''}"
        onclick="toggleSkillMatch('${sk}')"
        title="${matched ? 'Désélectionner' : 'Sélectionner pour cette offre'}">${esc(s)}</span>`;
    };
    // Bouton + : à l'écran seulement (tous les <button> sont retirés du PDF)
    const plus  = key => key
      ? `<button class="cv-skill-add" onclick="event.stopPropagation();window._openSkillPicker('${key}',this)" title="Ajouter">+</button>`
      : '';
    // Une catégorie vide garde son + à l'écran mais disparaît du PDF
    const ligne = (label, items, key) =>
      `<div class="cv-skill-row${items.length ? '' : ' cv-skill-row--vide'}">${plus(key)}<span class="cv-skill-key">${label} :</span> ${items.map(tagEl).join(', ')}</div>`;

    html += ligne('Domaines', P.subdomains, 'subdomains');
    html += ligne('Outils', [...P.tools, ...P.informatique], 'tools');
    if (P.certifs.length) html += ligne('Certifications', P.certifs, '');
    html += ligne('Autres compétences', P.customSkills, 'customSkills');
    html += `</div>`;
  }

  // ── Langues ──
  if (P.languages.length) {
    html += `<div class="cv-sec"><div class="cv-stitle">Langues</div>
      <div class="cv-summary-text">${P.languages.map(l => `${esc(l.name)}${l.level ? ' — ' + esc(l.level) : ''}`).join(sep)}</div>
    </div>`;
  }

  // ── Secteurs ──
  if (P.sectors.length) {
    html += `<div class="cv-sec"><div class="cv-stitle">Secteurs</div>
      <div class="cv-summary-text">${P.sectors.map(esc).join(', ')}</div>
    </div>`;
  }

  // ── Centres d'intérêt ──
  if (P.hobbies) {
    html += `<div class="cv-sec"><div class="cv-stitle">Centres d'intérêt</div>
      <div class="cv-summary-text">${esc(P.hobbies)}</div>
    </div>`;
  }

  cvDoc.innerHTML = html;
  // Mises en valeur du profil : identiques dans « Mon CV » et dans l'annonce
  if (typeof appliqueMisesEnValeur === 'function') appliqueMisesEnValeur(cvDoc);
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

// ── SKILL PICKER — panel flottant universel ───────────────
const _SKILL_DB = {
  subdomains:  () => SUBS,
  tools:       () => TOOLS,
  informatique:() => INFORMATIQUE,
  certifs:     () => (typeof CERTS !== 'undefined' ? CERTS : []),
  customSkills:() => []
};

window._openSkillPicker = function(key, btnEl) {
  // Ferme si déjà ouvert pour ce bouton
  const existing = document.getElementById('cv-skill-picker');
  if (existing) {
    if (existing.dataset.key === key) { existing.remove(); return; }
    existing.remove();
  }

  const db      = (_SKILL_DB[key] || (() => []))();
  const current = (P[key] || []).map(s => s.toLowerCase());
  const avail   = db.filter(s => !current.includes(s.toLowerCase()));

  const panel = document.createElement('div');
  panel.id = 'cv-skill-picker';
  panel.dataset.key = key;
  panel.style.cssText = `position:fixed;z-index:9999;background:white;border:1px solid #e0e7ff;border-radius:10px;
    box-shadow:0 8px 28px rgba(0,0,0,.15);padding:12px 14px;width:280px;max-height:320px;overflow-y:auto`;

  // Positionne le panel sous le bouton
  const rect = btnEl.getBoundingClientRect();
  panel.style.top  = (rect.bottom + 6) + 'px';
  panel.style.left = Math.max(8, rect.left - 120) + 'px';

  let inner = `<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:#6366f1;margin-bottom:8px">
    Ajouter une compétence</div>`;

  // Input libre
  inner += `<div style="display:flex;gap:6px;margin-bottom:10px">
    <input id="cv-sp-input" type="text" placeholder="Taper et Entrée…"
      style="flex:1;border:1px solid #e0e7ff;border-radius:6px;padding:5px 8px;font-size:12.5px;outline:none;color:#1e293b"
      onkeydown="if(event.key==='Enter'){window._addFromPicker('${key}');event.preventDefault()}" />
    <button onclick="window._addFromPicker('${key}')"
      style="background:#6366f1;color:white;border:none;border-radius:6px;padding:5px 10px;font-size:12px;font-weight:700;cursor:pointer">+</button>
  </div>`;

  // Chips depuis la base
  if (avail.length) {
    inner += `<div style="font-size:10px;color:#94a3b8;margin-bottom:5px">Suggestions</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">`;
    avail.forEach(s => {
      const safe = s.replace(/'/g,"&#39;").replace(/"/g,'&quot;');
      inner += `<span onclick="window._pickSkill('${key}','${s.replace(/'/g,"\\'")}',this)"
        style="background:#f1f5f9;color:#374151;border:1px solid #e2e8f0;border-radius:100px;
               padding:3px 10px;font-size:12px;cursor:pointer;transition:background .15s"
        onmouseover="this.style.background='#e0e7ff';this.style.color='#4f46e5'"
        onmouseout="this.style.background='#f1f5f9';this.style.color='#374151'">${esc(s)}</span>`;
    });
    inner += `</div>`;
  }

  panel.innerHTML = inner;
  document.body.appendChild(panel);

  // Focus input
  setTimeout(() => { const inp = document.getElementById('cv-sp-input'); if (inp) inp.focus(); }, 30);

  // Ferme au clic en dehors
  const close = e => { if (!panel.contains(e.target) && e.target !== btnEl) { panel.remove(); document.removeEventListener('mousedown', close, true); } };
  setTimeout(() => document.addEventListener('mousedown', close, true), 50);
};

window._pickSkill = function(key, val) {
  if (!P[key]) P[key] = [];
  const low = P[key].map(s => s.toLowerCase());
  if (!low.includes(val.toLowerCase())) { P[key].push(val); ss('sc_profile', P); }
  document.getElementById('cv-skill-picker')?.remove();
  renderCV();
  _syncSplitCV();
};

window._addFromPicker = function(key) {
  const inp = document.getElementById('cv-sp-input');
  const val = (inp?.value || '').trim();
  if (!val) return;
  if (!P[key]) P[key] = [];
  const low = P[key].map(s => s.toLowerCase());
  if (!low.includes(val.toLowerCase())) { P[key].push(val); ss('sc_profile', P); }
  document.getElementById('cv-skill-picker')?.remove();
  renderCV();
  _syncSplitCV();
};

// Re-synchronise la fenêtre d'annonce après une modification faite dans « Mon CV »
function _syncSplitCV() {
  if (!document.getElementById('cv-doc-split')) return;
  if (typeof _clonePourAnnonce === 'function') _clonePourAnnonce();
}

// Vrai titre du site, mémorisé une fois pour toutes. Sans ça, deux PDF
// enchaînés se marchent dessus : le second prendrait pour "titre d'origine"
// le nom de fichier du premier.
const _TITRE_SITE = document.title;

function printCV() {
  if (!P.firstName) { toast('Renseigne ton prénom dans le profil'); return; }

  // Quelle version du CV imprimer ?
  //   • Une annonce est ouverte à l'écran → son CV adapté (cv-doc-split)
  //   • Sinon → le CV principal (cv-doc)
  // Important : quand on ferme une annonce, cv-doc-split reste dans la page
  // (elle est seulement masquée). Sans ce contrôle d'ouverture, tous les
  // boutons PDF réutilisaient ce vieux CV — d'où un titre figé tant qu'on
  // n'avait pas rechargé la page.
  const overlay      = document.getElementById('split-modal-overlay');
  const annonceOuverte = !!overlay && !overlay.classList.contains('hidden');
  const srcEl = (annonceOuverte && document.getElementById('cv-doc-split'))
             || document.getElementById('cv-doc');
  if (!srcEl) return;

  let wrapper = document.getElementById('cv-print-wrapper');
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.id = 'cv-print-wrapper';
    document.body.appendChild(wrapper);
  }
  const _printClass = 'cv-doc cv-doc--ats';   // modèle unique
  // Lettre de recommandation en page 2 (si déposée et l'interrupteur actif)
  const _lettre = typeof lettreRecoHtmlPourPdf === 'function' ? lettreRecoHtmlPourPdf() : '';
  wrapper.innerHTML = `<div class="${_printClass}">${srcEl.innerHTML}</div>${_lettre}`;

  // Supprime les éléments interactifs (boutons +, toolbars) de la version imprimée
  wrapper.querySelectorAll('button, #emphasis-toolbar, [id$="-picker"], .cv-edit-ui').forEach(el => el.remove());

  // Nom du fichier PDF = "Date - Poste - Entreprise"
  // Vaut pour la split view comme pour les boutons PDF (tableau, Feed)
  // Même précaution que plus haut : _splitCandId garde la dernière annonce
  // consultée même après fermeture. On ne s'y fie que si elle est à l'écran,
  // sinon le PDF hériterait du nom de l'offre précédente.
  const originalTitle = _TITRE_SITE;
  const candId = window._pdfCandId || (annonceOuverte ? window._splitCandId : null);
  window._pdfCandId = null;
  if (candId) {
    const c = ls('sc_cands', []).find(x => x.id === candId);
    if (c) {
      // Formate la date en jj-mm-aaaa
      let dateStr = '';
      if (c.date) {
        const d = new Date(c.date);
        if (!isNaN(d)) {
          const jj = String(d.getDate()).padStart(2,'0');
          const mm = String(d.getMonth()+1).padStart(2,'0');
          const aaaa = d.getFullYear();
          dateStr = `${jj}-${mm}-${aaaa}`;
        } else {
          dateStr = c.date; // garde la date telle quelle si pas parsable
        }
      }
      const posteNet = typeof cleanJobTitle === 'function' ? cleanJobTitle(c.poste) : c.poste;
      const parts = [dateStr, posteNet, c.company].filter(Boolean);
      if (parts.length) document.title = parts.join(' - ');
    }
  }

  const titreDefini = document.title;
  // Attend que les images (photo, lettre scannée) soient prêtes : sinon
  // l'impression peut partir avec une page 2 blanche.
  // Attente limitée à 1,5 s : si le navigateur ne répond pas (onglet en
  // arrière-plan), l'impression part quand même.
  const _images = [...wrapper.querySelectorAll('img')].map(img => img.decode().catch(() => {}));
  const _delaiMax = new Promise(r => setTimeout(r, 1500));
  Promise.race([Promise.all(_images), _delaiMax]).then(() => setTimeout(() => {
    window.print();
    // Restaure le titre du site — mais seulement si un autre PDF n'a pas
    // déjà pris la main entre-temps.
    setTimeout(() => {
      if (document.title === titreDefini) document.title = originalTitle;
    }, 1000);
  }, 80));
}
