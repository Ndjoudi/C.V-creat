// ── RENDU BULLET AVEC EMPHASES DU PROFIL ──────────────────
function renderBulletHtml(text, expIdx) {
  const emphases = (P.emphases || []).filter(em =>
    em.expIdx === expIdx || em.expIdx === null || em.expIdx === undefined
  );
  if (!emphases.length) return esc(text);

  const _ats = (P.cvTemplate === 'ats');
  // En ATS : surlignage jaune pour le texte, vert pour les chiffres (%, montants, KPI)
  const atsTextStyle = 'background:#FEF08A;color:#1D1D1F;font-weight:700;padding:0 3px;border-radius:2px';
  const atsNumStyle  = 'background:#BBF7D0;color:#14532D;font-weight:700;padding:0 3px;border-radius:2px';
  const isNumberSeg  = t => /\d/.test(t);

  const pillStyle      = _ats
    ? atsTextStyle
    : 'background:#ede9fe;color:#5b21b6;border-radius:100px;padding:1px 9px;font-weight:700;font-size:.92em;border:1px solid #ddd6fe';
  const underlineStyle = _ats
    ? atsTextStyle
    : 'font-weight:800;border-bottom:2.5px solid #6366f1;padding-bottom:1px';

  // Trie les emphases par position dans le texte (longest match first pour éviter chevauchements)
  const sorted = [...emphases].sort((a, b) => b.text.length - a.text.length);

  // Découpe le texte en segments (texte brut / spans)
  let segments = [{ t: text, raw: true }];
  sorted.forEach(em => {
    const newSegs = [];
    segments.forEach(seg => {
      if (!seg.raw) { newSegs.push(seg); return; }
      const lo = seg.t.toLowerCase();
      const emLo = em.text.toLowerCase();
      let idx = lo.indexOf(emLo);
      if (idx === -1) { newSegs.push(seg); return; }
      if (idx > 0) newSegs.push({ t: seg.t.slice(0, idx), raw: true });
      newSegs.push({ t: seg.t.slice(idx, idx + em.text.length), raw: false, type: em.type });
      const rest = seg.t.slice(idx + em.text.length);
      if (rest) newSegs.push({ t: rest, raw: true });
    });
    segments = newSegs;
  });

  return segments.map(seg => {
    if (seg.raw) return esc(seg.t);
    let style;
    if (seg.type === 'hl')         style = atsTextStyle;   // surlignage jaune explicite
    else if (seg.type === 'hlnum') style = atsNumStyle;    // surlignage vert explicite
    else {
      style = seg.type === 'pill' ? pillStyle : underlineStyle;
      if (_ats && isNumberSeg(seg.t)) style = atsNumStyle; // legacy : auto-vert si chiffre
    }
    return `<span data-cv-em="${seg.type}" style="${style}">${esc(seg.t)}</span>`;
  }).join('');
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
function buildProfileHighlight(ats) {
  const segments = [];

  // Ligne 1 : Formation (depuis education[0])
  const edu = P.education && P.education[0];
  if (edu && edu.degree) {
    let s = `<span class="cv-phi-plain">Fin de cursus </span>`;
    s += `<strong class="cv-phi-formation">${esc(edu.degree)}</strong>`;
    if (edu.school) s += `<span class="cv-phi-plain"> à </span><strong class="cv-phi-school">${esc(edu.school)}</strong>`;
    if (edu.year) {
      const endYear = edu.year.trim().split(/\s*[-–—]\s*/).pop();
      s += `<span class="cv-phi-year">, ${esc(endYear)}</span>`;
    }
    segments.push(s);
  } else if (P.yearsExp) {
    segments.push(`<span class="cv-phi-plain">Fort(e) de </span><strong class="cv-phi-formation">${esc(P.yearsExp)} d'expérience</strong>`);
  }

  // Ligne 2 : contrat, disponibilité, mobilité, permis
  if (ats) {
    // Mode ATS : infos labellisées sur la même ligne, espacées, sans séparateur ni case
    const atsItem = (label, txt) =>
      `<span class="cv-phi-plain">${label} : </span><span class="cv-phi-strong">${esc(txt)}</span>`;
    const items = [];
    if (P.contratRecherche) items.push(atsItem('Contrat', P.contratRecherche));
    if (P.disponibilite)    items.push(atsItem('Dispo', P.disponibilite));
    if (P.mobility)         items.push(atsItem('Déplacement', P.mobility));
    if (P.permis) {
      // Évite "Permis : Permis A et B" → garde juste la valeur si elle contient déjà "permis"
      items.push(/permis/i.test(P.permis)
        ? `<span class="cv-phi-strong">${esc(P.permis)}</span>`
        : atsItem('Permis', P.permis));
    }
    if (items.length) segments.push(items.join('&nbsp;&nbsp;&nbsp;'));
  } else {
    const pill = (txt, cls) => `<span class="cv-phi-pill ${cls}">${esc(txt)}</span>`;
    const pills = [];
    if (P.contratRecherche) pills.push(`<span class="cv-phi-plain">En recherche d'un </span>${pill(P.contratRecherche,'cv-phi-pill--dark')}`);
    if (P.disponibilite)    pills.push(`<span class="cv-phi-plain" style="font-size:11px">Disponible </span>${pill(P.disponibilite,'cv-phi-pill--green')}`);
    if (P.mobility)         pills.push(pill(P.mobility,'cv-phi-pill--blue'));
    if (P.permis)           pills.push(pill(P.permis,'cv-phi-pill--gray'));
    if (pills.length) segments.push(pills.join(''));
  }


  if (!segments.length) return '';
  // Mode ATS : tout sur une seule ligne continue (formation + infos)
  if (ats) {
    return `<div class="cv-profile-highlight">${segments.join('&nbsp;&nbsp;&nbsp;')}</div>`;
  }
  return `<div class="cv-profile-highlight">${segments.map(s => `<div class="cv-phi-line">${s}</div>`).join('')}</div>`;
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

  // ── Template branch ──────────────────────────────────────
  const cvDoc = document.getElementById('cv-doc');
  const _tpl  = P.cvTemplate || 'classique';
  _updateTplPicker(_tpl);
  if (_tpl === 'moderne') {
    cvDoc.className  = 'cv-doc cv-doc--moderne';
    cvDoc.innerHTML  = _buildModerneCV();
    return;
  }
  const _ats = (_tpl === 'ats');
  cvDoc.className = 'cv-doc' + (_ats ? ' cv-doc--ats' : '');

  // ── Header ──
  const displayTitle = _cvTarget || P.title;

  // LinkedIn: clickable link
  const liUrl = P.linkedin ? (P.linkedin.startsWith('http') ? P.linkedin : 'https://' + P.linkedin) : '';
  const liShort = P.linkedin ? P.linkedin.replace(/^https?:\/\/(www\.)?linkedin\.com\//, 'linkedin.com/') : '';

  const contacts = [
    P.email ? `<span>${esc(P.email)}</span>` : '',
    P.phone ? `<span>${esc(P.phone)}</span>` : '',
    P.location ? `<span>${esc(P.location)}</span>` : '',
    liUrl    ? `<span><a href="${liUrl}" style="text-decoration:none;display:inline-flex;align-items:center" title="${esc(liShort)}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="13" height="13" fill="#0A66C2" style="vertical-align:middle"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg></a></span>` : ''
  ].filter(Boolean).join('');

  // disponibilite / mobilité / permis sont affichés dans le bloc profil — pas dans le header
  const extraLine = '';

  // Right-side: photo only
  const rightCol = P.photo ? `
    <div style="flex-shrink:0">
      <img src="${P.photo}" class="cv-photo"/>
    </div>` : '';

  let html;
  if (_ats) {
    // ATS : poste en premier, puis nom, puis contact
    html = `
    <div class="cv-hd">
      <div style="flex:1">
        ${displayTitle ? `<div class="cv-ats-poste">${esc(displayTitle)}</div>` : ''}
        <div class="cv-nm">${esc(P.firstName)} ${esc(P.lastName)}</div>
        ${contacts ? `<div class="cv-contact-line">${contacts}</div>` : ''}
      </div>
      ${rightCol}
    </div>
    <div class="cv-div"></div>`;
  } else {
    html = `
    <div class="cv-hd">
      <div style="flex:1">
        <div class="cv-nm">${esc(P.firstName)} ${esc(P.lastName)}</div>
        ${contacts ? `<div class="cv-contact-line">${contacts}</div>` : ''}
        ${extraLine ? `<div class="cv-contact-line" style="margin-top:3px">${extraLine}</div>` : ''}
      </div>
      ${rightCol}
    </div>
    <div class="cv-div"></div>`;
  }

  // ── Profil : bloc highlight + phrase d'accroche ───────────
  const highlightBlock = buildProfileHighlight(_ats);
  const targetText     = _buildAccrocheText();
  // Met le nom du poste en évidence (plus grand) dans la phrase d'accroche
  let targetHtml = esc(targetText);
  if (displayTitle) {
    const posteEsc = esc(displayTitle);
    targetHtml = targetHtml.replace(posteEsc, `<span class="cv-accroche-poste">${posteEsc}</span>`);
  }
  if (highlightBlock || targetText) {
    html += `<div class="cv-sec">
      <div class="cv-stitle">Profil</div>
      ${highlightBlock}
      ${targetText ? `<div class="cv-summary-text"${highlightBlock ? ' style="margin-top:9px"' : ''}>${targetHtml}</div>` : ''}
    </div>`;
  }

  // ── Expériences ──
  if (P.experiences.length) {
    html += `<div class="cv-sec"><div class="cv-stitle">Expériences professionnelles</div>`;
    P.experiences.forEach((e, i) => {
      // Show bullets if any exist (required or selected), otherwise fall back to description
      const activeBullets = (e.bullets || []).filter(b => b.required || b.selected);
      const expIdx = (typeof e._origIdx === 'number') ? e._origIdx : i;
      const bodyHtml = activeBullets.length
        ? `<ul class="cv-bullets">${activeBullets.map(b => `<li class="cv-bullet-item"><span class="cv-bullet-dot">▸</span><span>${renderBulletHtml(b.text, expIdx)}</span></li>`).join('')}</ul>`
        : renderDescription(e.description);
      html += `<div class="cv-exp" data-exp-idx="${expIdx}">
        <div class="cv-etitle">${esc(e.title)}${e.contractType ? ' <span style="font-size:10px;font-weight:600;padding:1px 6px;border-radius:100px;background:#F2F2F2;color:#6E6E73;border:1px solid #D2D2D7;vertical-align:middle;margin-left:5px">' + esc(e.contractType) + '</span>' : ''}${e.reportingTo ? `<span style="font-size:10px;font-weight:400;font-style:italic;color:#6E6E73;margin-left:8px;vertical-align:middle">Rattaché directement au ${esc(e.reportingTo)}</span>` : ''}</div>
        ${e.company ? `<div class="cv-erow"><div class="cv-eco">${esc(e.company)}${e.sector ? ' · ' + esc(e.sector) : ''}${e.location ? ' · ' + esc(e.location) : ''}</div><div class="cv-edates">${esc(e.duration)}</div></div>` : ''}
        ${bodyHtml}
      </div>`;
    });
    html += `</div>`;
  }

  // ── Formation (layout compact 1 ligne par diplôme) ──
  if (P.education.length) {
    html += `<div class="cv-sec"><div class="cv-stitle">Formation</div>`;
    P.education.forEach(e => {
      const endYear = e.year ? e.year.trim().split(/\s*[-–—]\s*/).pop() : '';
      html += `<div class="cv-edu-row">
        <div class="cv-edu-left">
          <span class="cv-edu-degree">${esc(e.degree)}</span>
          ${e.school ? `<span class="cv-edu-school">— ${esc(e.school)}</span>` : ''}
          ${e.mention ? `<span class="cv-edu-mention">· ${esc(e.mention)}</span>` : ''}
        </div>
        ${endYear ? `<span class="cv-edu-year">${esc(endYear)}</span>` : ''}
      </div>`;
    });
    html += `</div>`;
  }

  // ── Compétences en tags ──
  const hasSkills = P.subdomains.length || P.tools.length || P.certifs.length || P.customSkills.length || P.informatique.length;
  if (hasSkills) {
    html += `<div class="cv-sec">
      <div class="cv-stitle">Compétences et Outils</div>`;

    // Helper : tag cliquable — clic pour sélectionner / désélectionner
    // En mode ATS : texte simple (pas de case), surligné si matché
    const tagEl = s => {
      const matched = isMatchedSkill(s);
      const sk = s.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      if (_ats) {
        return `<span class="cv-skill-plain${matched ? ' cv-skill-plain--match' : ''}"
          onclick="toggleSkillMatch('${sk}')"
          title="${matched ? 'Désélectionner' : 'Sélectionner pour cette offre'}">${esc(s)}</span>`;
      }
      return `<span class="cv-skill-tag${matched ? ' cv-skill-tag--match' : ''} cv-skill-tag--toggle"
        onclick="toggleSkillMatch('${sk}')"
        title="${matched ? 'Désélectionner' : 'Sélectionner pour cette offre'}"
        style="cursor:pointer">${esc(s)}</span>`;
    };
    const tagSep = _ats ? ', ' : '';

    // Helper : label de catégorie avec bouton + (à gauche)
    const catLabel = (label, key) =>
      `<div class="cv-skill-key" style="display:flex;align-items:center;gap:5px;white-space:nowrap">
        <button onclick="event.stopPropagation();window._openSkillPicker('${key}',this)"
          style="flex-shrink:0;width:16px;height:16px;background:#e0e7ff;color:#4f46e5;border:none;border-radius:50%;font-size:12px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;font-weight:700">+</button>
        ${label}
      </div>`;

    if (P.subdomains.length || true) {
      html += `<div class="cv-skill-row">
        ${catLabel('Domaines','subdomains')}
        <div class="cv-skill-tags">${P.subdomains.map(tagEl).join(tagSep)}</div>
      </div>`;
    }
    {
      const merged = [...P.tools.map(tagEl), ...P.informatique.map(tagEl)];
      html += `<div class="cv-skill-row">
        ${catLabel('Outils SC','tools')}
        <div class="cv-skill-tags">${merged.join(tagSep)}</div>
      </div>`;
    }
    if (P.certifs.length) {
      html += `<div class="cv-skill-row">
        <div class="cv-skill-key">Certifications</div>
        <div class="cv-skill-tags">${P.certifs.map(tagEl).join(tagSep)}</div>
      </div>`;
    }
    if (P.customSkills.length || true) {
      html += `<div class="cv-skill-row">
        ${catLabel('Autres','customSkills')}
        <div class="cv-skill-tags">${P.customSkills.map(tagEl).join(tagSep)}</div>
      </div>`;
    }
    html += `</div>`;
  }

  // ── Langues ──
  if (P.languages.length) {
    if (_ats) {
      const langsInline = P.languages.map(l =>
        `<span class="cv-lang-item"><span class="cv-lang-name">${esc(l.name)}</span> — <span class="cv-lang-level">${esc(l.level)}</span></span>`
      ).join('&nbsp;&nbsp;&nbsp;');
      html += `<div class="cv-sec">
        <div class="cv-lang-row--ats"><span class="cv-stitle-inline">Langues :</span> ${langsInline}</div>
      </div>`;
    } else {
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
  }

  // ── Secteurs ──
  if (P.sectors.length) {
    html += `<div class="cv-sec">
      <div class="cv-stitle">Secteurs</div>
      <div class="cv-skill-tags">${P.sectors.map(s => _ats
        ? `<span class="cv-skill-plain">${esc(s)}</span>`
        : `<span class="cv-skill-tag">${esc(s)}</span>`).join(_ats ? ', ' : '')}</div>
    </div>`;
  }

  // ── Centres d'intérêt ──
  if (P.hobbies) {
    if (_ats) {
      html += `<div class="cv-sec">
        <div class="cv-lang-row--ats"><span class="cv-stitle-inline">Centres d'intérêt :</span> ${esc(P.hobbies)}</div>
      </div>`;
    } else {
    html += `<div class="cv-sec">
      <div class="cv-stitle">Centres d'intérêt</div>
      <div class="cv-summary-text">${esc(P.hobbies)}</div>
    </div>`;
    }
  }

  cvDoc.innerHTML = html;
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

// Re-synchronise cv-doc-split avec cv-doc après un update
function _syncSplitCV() {
  const split = document.getElementById('cv-doc-split');
  const main  = document.getElementById('cv-doc');
  if (!split || !main) return;
  // Synchronise la classe du template (cv-doc--ats / cv-doc--moderne)
  split.className = main.className;
  split.innerHTML = main.innerHTML;
  // Strip les spans d'emphase statiques (renderBulletHtml) pour que
  // _applyEmphases puisse reposer des spans interactifs proprement
  split.querySelectorAll('span[data-cv-em]').forEach(span => {
    span.replaceWith(document.createTextNode(span.textContent));
  });
}

function printCV() {
  if (!P.firstName) { toast('Renseigne ton prénom dans le profil'); return; }

  // Utilise cv-doc-split (CV avec modifications de l'offre) si disponible, sinon cv-doc
  const srcEl = document.getElementById('cv-doc-split') || document.getElementById('cv-doc');
  if (!srcEl) return;

  let wrapper = document.getElementById('cv-print-wrapper');
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.id = 'cv-print-wrapper';
    document.body.appendChild(wrapper);
  }
  const _printTpl   = P.cvTemplate || 'classique';
  const _printClass = _printTpl === 'moderne' ? 'cv-doc cv-doc--moderne'
                    : _printTpl === 'ats'     ? 'cv-doc cv-doc--ats'
                    : 'cv-doc';
  // Lettre de recommandation en page 2 (si déposée et l'interrupteur actif)
  const _lettre = typeof lettreRecoHtmlPourPdf === 'function' ? lettreRecoHtmlPourPdf() : '';
  wrapper.innerHTML = `<div class="${_printClass}">${srcEl.innerHTML}</div>${_lettre}`;

  // Supprime les éléments interactifs (boutons +, toolbars) de la version imprimée
  wrapper.querySelectorAll('button, #emphasis-toolbar, [id$="-picker"]').forEach(el => el.remove());

  // Nom du fichier PDF = "Date - Poste - Entreprise"
  // Vaut pour la split view comme pour les boutons PDF (tableau, Feed)
  const originalTitle = document.title;
  const candId = window._splitCandId || window._pdfCandId;
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

  setTimeout(() => {
    window.print();
    // Restaure le titre original après l'impression
    setTimeout(() => { document.title = originalTitle; }, 1000);
  }, 80);
}

// ── TEMPLATE PICKER — met à jour les boutons actifs ────────
function _updateTplPicker(tpl) {
  document.querySelectorAll('.tpl-btn').forEach(btn => {
    const t = btn.dataset.tpl;
    if (!t) return;
    btn.classList.toggle('active', t === tpl);
  });
}

// ── CHANGER LE TEMPLATE ────────────────────────────────────
function setCVTemplate(tpl) {
  P.cvTemplate = tpl;
  ss('sc_profile', P);
  renderCV();
  // Met à jour le sélecteur dans la split view
  if (typeof _updateSplitTplPicker === 'function') _updateSplitTplPicker(tpl);
  // Si la split view est ouverte, on la reconstruit entièrement (classe + emphases)
  const splitOpen = !document.getElementById('split-modal-overlay')?.classList.contains('hidden');
  if (splitOpen && typeof _refreshSplitCV === 'function') {
    _refreshSplitCV();
  } else if (typeof _syncSplitCV === 'function') {
    _syncSplitCV();
  }
}

// Met à jour l'état actif des boutons template dans la split view
function _updateSplitTplPicker(tpl) {
  document.querySelectorAll('#split-tpl-picker .tpl-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tpl === tpl);
  });
}

// ── SUPPRIMER UNE COMPÉTENCE DU PROFIL (sidebar Moderne) ──
window._removeSkillFromProfile = function(key, val) {
  // key = 'auto' → cherche dans tous les tableaux
  let target = key;
  if (key === 'auto') {
    target = ['subdomains','tools','informatique','certifs','customSkills']
      .find(k => (P[k]||[]).some(s => s.toLowerCase() === val.toLowerCase())) || '';
  }
  if (!target || !P[target]) return;
  P[target] = P[target].filter(s => s.toLowerCase() !== val.toLowerCase());
  ss('sc_profile', P);
  renderCV();
  if (typeof _syncSplitCV === 'function') _syncSplitCV();
};

// ── RENDU TEMPLATE MODERNE (sidebar sombre) ────────────────
function _buildModerneCV() {
  const displayTitle = _cvTarget || P.title;
  const liUrl = P.linkedin
    ? (P.linkedin.startsWith('http') ? P.linkedin : 'https://' + P.linkedin)
    : '';

  // ─── SIDEBAR ─────────────────────────────────────────────
  let sb = '';

  // Photo ou initiales
  if (P.photo) {
    sb += `<img src="${P.photo}" class="cv-sb-photo"/>`;
  } else {
    const ini = (((P.firstName||'')[0]||'') + ((P.lastName||'')[0]||'')).toUpperCase();
    sb += `<div style="width:82px;height:82px;border-radius:50%;background:rgba(255,255,255,.1);border:2px solid rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;color:rgba(255,255,255,.6);margin:0 auto 12px;flex-shrink:0">${ini||'?'}</div>`;
  }

  sb += `<div class="cv-sb-nm">${esc(P.firstName)} ${esc(P.lastName)}</div>`;
  if (displayTitle) sb += `<div class="cv-sb-ti">${esc(displayTitle)}</div>`;

  // Contact
  const ci = [
    P.email    && `<div class="cv-sb-ci"><span class="cv-sb-ci-icon">✉</span><span>${esc(P.email)}</span></div>`,
    P.phone    && `<div class="cv-sb-ci"><span class="cv-sb-ci-icon">☎</span><span>${esc(P.phone)}</span></div>`,
    P.location && `<div class="cv-sb-ci"><span class="cv-sb-ci-icon">⌖</span><span>${esc(P.location)}</span></div>`,
    liUrl      && `<div class="cv-sb-ci"><span class="cv-sb-ci-icon" style="font-weight:900;font-size:8px">in</span><a href="${liUrl}" style="color:rgba(255,255,255,.72);text-decoration:none;word-break:break-all;font-size:9.5px">${esc((P.linkedin||'').replace(/^https?:\/\/(www\.)?linkedin\.com\//,'linkedin.com/'))}</a></div>`,
  ].filter(Boolean);
  if (ci.length) sb += `<div class="cv-sb-stitle">Contact</div>${ci.join('')}`;

  // ── Helpers sidebar ──────────────────────────────────────
  // Tag cliquable (toggle match) + × pour supprimer
  const sbTag = (s, key) => {
    const matched = isMatchedSkill(s);
    const sk  = s.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    const k   = (key||'auto').replace(/'/g,"\\'");
    return `<span class="cv-sb-tag${matched ? ' cv-sb-tag--match' : ''}"
      onclick="toggleSkillMatch('${sk}')"
      title="${matched ? 'Désélectionner' : 'Sélectionner'}"
      style="position:relative;padding-right:18px;cursor:pointer">
        ${esc(s)}
        <span onclick="event.stopPropagation();window._removeSkillFromProfile('${k}','${sk}')"
          title="Supprimer"
          style="position:absolute;right:4px;top:50%;transform:translateY(-50%);font-size:10px;opacity:.4;line-height:1;cursor:pointer;font-weight:700">×</span>
      </span>`;
  };

  // Titre de section + bouton +
  const sbSec = (label, key) => {
    const k = (key||'').replace(/'/g,"\\'");
    return `<div class="cv-sb-stitle" style="display:flex;align-items:center;justify-content:space-between">
      <span>${label}</span>
      <button onclick="event.stopPropagation();window._openSkillPicker('${k}',this)"
        style="background:rgba(255,255,255,.14);color:rgba(255,255,255,.75);border:none;border-radius:50%;width:14px;height:14px;font-size:11px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;font-weight:800;flex-shrink:0;line-height:1">+</button>
    </div>`;
  };

  // Compétences (subdomains + tools + informatique) — key 'auto' pour la suppression
  const allSkillsWithKey = [
    ...P.subdomains.map(s  => ({s, k:'subdomains'})),
    ...P.tools.map(s       => ({s, k:'tools'})),
    ...P.informatique.map(s=> ({s, k:'informatique'})),
  ].filter(x => x.s);

  if (allSkillsWithKey.length || true) {
    sb += sbSec('Compétences','tools');
    sb += `<div>${allSkillsWithKey.map(x => sbTag(x.s, x.k)).join('')}</div>`;
  }
  if (P.certifs.length || true) {
    sb += sbSec('Certifications','certifs');
    sb += `<div>${P.certifs.map(s => sbTag(s,'certifs')).join('')}</div>`;
  }
  if (P.customSkills.length || true) {
    sb += sbSec('Autres','customSkills');
    sb += `<div>${P.customSkills.map(s => sbTag(s,'customSkills')).join('')}</div>`;
  }

  // Langues
  if (P.languages.length) {
    sb += `<div class="cv-sb-stitle">Langues</div>`;
    P.languages.forEach(l => {
      sb += `<div class="cv-sb-lang">
        <span style="font-weight:700">${esc(l.name)}</span>
        <span class="cv-sb-lang-lv">${esc(l.level)}</span>
      </div>`;
    });
  }

  // Formation
  if (P.education.length) {
    sb += `<div class="cv-sb-stitle">Formation</div>`;
    P.education.forEach(e => {
      const endYear = e.year ? e.year.trim().split(/\s*[-–—]\s*/).pop() : '';
      sb += `<div class="cv-sb-edu">
        <div class="cv-sb-edu-deg">${esc(e.degree)}</div>
        ${e.school   ? `<div class="cv-sb-edu-sc">${esc(e.school)}</div>` : ''}
        ${e.mention  ? `<div class="cv-sb-edu-sc" style="font-style:italic">${esc(e.mention)}</div>` : ''}
        ${endYear    ? `<div class="cv-sb-edu-yr">${esc(endYear)}</div>` : ''}
      </div>`;
    });
  }

  // ─── COLONNE PRINCIPALE ───────────────────────────────────
  let mc = '';

  // Profil
  const highlightBlock = buildProfileHighlight();
  const targetText     = _buildAccrocheText();
  if (highlightBlock || targetText) {
    mc += `<div class="cv-sec">
      <div class="cv-stitle">Profil</div>
      ${highlightBlock}
      ${targetText ? `<div class="cv-summary-text"${highlightBlock ? ' style="margin-top:9px"' : ''}>${esc(targetText)}</div>` : ''}
    </div>`;
  }

  // Expériences
  if (P.experiences.length) {
    mc += `<div class="cv-sec"><div class="cv-stitle">Expériences professionnelles</div>`;
    P.experiences.forEach((e, i) => {
      const activeBullets = (e.bullets || []).filter(b => b.required || b.selected);
      const expIdx = (typeof e._origIdx === 'number') ? e._origIdx : i;
      const bodyHtml = activeBullets.length
        ? `<ul class="cv-bullets">${activeBullets.map(b =>
            `<li class="cv-bullet-item"><span class="cv-bullet-dot">▸</span><span>${renderBulletHtml(b.text, expIdx)}</span></li>`
          ).join('')}</ul>`
        : renderDescription(e.description);
      mc += `<div class="cv-exp" data-exp-idx="${expIdx}">
        <div class="cv-etitle">${esc(e.title)}${e.contractType
          ? ` <span style="font-size:10px;font-weight:600;padding:1px 6px;border-radius:100px;background:#F2F2F2;color:#6E6E73;border:1px solid #D2D2D7;vertical-align:middle;margin-left:5px">${esc(e.contractType)}</span>`
          : ''}${e.reportingTo
          ? `<span style="font-size:10px;font-weight:400;font-style:italic;color:#6E6E73;margin-left:8px;vertical-align:middle">Rattaché directement au ${esc(e.reportingTo)}</span>`
          : ''}</div>
        ${e.company ? `<div class="cv-erow"><div class="cv-eco">${esc(e.company)}${e.sector ? ' · ' + esc(e.sector) : ''}${e.location ? ' · ' + esc(e.location) : ''}</div><div class="cv-edates">${esc(e.duration)}</div></div>` : ''}
        ${bodyHtml}
      </div>`;
    });
    mc += `</div>`;
  }

  // Secteurs
  if (P.sectors.length) {
    mc += `<div class="cv-sec">
      <div class="cv-stitle">Secteurs</div>
      <div class="cv-skill-tags">${P.sectors.map(s => `<span class="cv-skill-tag">${esc(s)}</span>`).join('')}</div>
    </div>`;
  }

  // Centres d'intérêt
  if (P.hobbies) {
    mc += `<div class="cv-sec">
      <div class="cv-stitle">Centres d'intérêt</div>
      <div class="cv-summary-text">${esc(P.hobbies)}</div>
    </div>`;
  }

  return `<div class="cv-sb">${sb}</div><div class="cv-mc">${mc}</div>`;
}

