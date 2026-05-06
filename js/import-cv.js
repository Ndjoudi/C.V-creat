// ── CV IMPORT ──────────────────────────────────────────────
let _importedData = null;

async function importCVFromText() {
  const text = document.getElementById('import-cv-txt').value.trim();
  if (!text) { toast('⚠️ Colle d\'abord le texte de ton CV'); return; }
  if (text.length < 100) { toast('⚠️ Le texte semble trop court — colle l\'intégralité du CV'); return; }

  const btn   = document.getElementById('import-cv-btn');
  const ldg   = document.getElementById('import-cv-loading');
  const errEl = document.getElementById('import-cv-error');
  const prev  = document.getElementById('import-cv-preview');

  btn.disabled = true; btn.textContent = 'Extraction en cours...';
  ldg.classList.remove('hidden');
  errEl.classList.add('hidden');
  prev.classList.add('hidden');

  // Listes de référence pour matcher les compétences connues
  const allTools  = TOOLS.join(', ');
  const allSubs   = SUBS.join(', ');
  const allCerts  = CERTS.join(', ');
  const allSects  = SECTS.join(', ');
  const allLevels = 'Notions, Intermédiaire, Courant, Bilingue, Langue maternelle';
  const allYears  = 'Moins d\'1 an, 1-2 ans, 3-5 ans, 5-10 ans, 10-15 ans, 15+ ans';

  const prompt = `Tu es un expert en analyse de CV. Extrais toutes les informations de ce CV et retourne-les en JSON structuré.

RÈGLES STRICTES :
- Ne jamais inventer d'informations absentes du CV
- Si une information est absente, mettre une chaîne vide "" ou un tableau vide []
- Pour yearsExp, choisir la valeur la plus proche parmi : ${allYears}
- Pour les langues, le niveau doit être exactement l'un de : ${allLevels}
- Pour subdomains, ne mettre que les valeurs présentes dans cette liste : ${allSubs}
- Pour tools, ne mettre que les valeurs présentes dans cette liste : ${allTools}
- Pour certifs, ne mettre que les valeurs présentes dans cette liste : ${allCerts}
- Pour sectors, ne mettre que les valeurs présentes dans cette liste : ${allSects}
- Les compétences non trouvées dans ces listes vont dans customSkills
- Les descriptions d'expériences doivent conserver les bullet points avec • au début de chaque ligne
- Les dates de durée : format "Mois AAAA – Mois AAAA" ou "AAAA – AAAA"

CV À ANALYSER :
${text}

Réponds UNIQUEMENT en JSON valide sans markdown ni backticks :
{"firstName":"","lastName":"","email":"","phone":"","location":"","linkedin":"","title":"","yearsExp":"","summary":"","experiences":[{"title":"","company":"","duration":"","location":"","description":""}],"education":[{"degree":"","school":"","year":"","mention":""}],"languages":[{"name":"","level":""}],"subdomains":[],"tools":[],"certifs":[],"sectors":[],"customSkills":[]}`;

  try {
    const raw  = await callGroq(prompt, { maxTokens: 3000, temperature: 0.1 });
    const data = safeParseJSON(raw);

    // Générer des IDs pour les tableaux
    data.experiences = (data.experiences || []).filter(e => e.title || e.company).map(e => ({ ...e, id: Date.now().toString() + Math.random().toString(36).slice(2) }));
    data.education   = (data.education   || []).filter(e => e.degree || e.school).map(e => ({ ...e, id: Date.now().toString() + Math.random().toString(36).slice(2) }));
    data.languages   = (data.languages   || []).filter(l => l.name).map(l => ({ ...l, id: Date.now().toString() + Math.random().toString(36).slice(2) }));

    // Nettoyer les tableaux
    ['subdomains','tools','certifs','sectors','customSkills'].forEach(k => {
      data[k] = Array.isArray(data[k]) ? data[k].filter(Boolean) : [];
    });

    _importedData = data;
    renderImportPreview(data);
    prev.classList.remove('hidden');
    toast('✅ CV analysé — vérifie les informations extraites');
  } catch (e) {
    errEl.textContent = groqErrorMessage(e);
    errEl.classList.remove('hidden');
  } finally {
    ldg.classList.add('hidden');
    btn.disabled = false;
    btn.textContent = '✦ Extraire avec l\'IA';
  }
}

function renderImportPreview(d) {
  const skillCount = (d.subdomains?.length || 0) + (d.tools?.length || 0) + (d.certifs?.length || 0) + (d.customSkills?.length || 0);
  const lines = [
    d.firstName || d.lastName ? `<strong>Identité :</strong> ${[d.firstName, d.lastName].filter(Boolean).join(' ')}${d.title ? ' — ' + d.title : ''}` : null,
    d.email || d.phone ? `<strong>Contact :</strong> ${[d.email, d.phone, d.location].filter(Boolean).join(' · ')}` : null,
    d.yearsExp ? `<strong>Expérience :</strong> ${d.yearsExp}` : null,
    d.summary ? `<strong>Résumé :</strong> ${d.summary.slice(0, 120)}${d.summary.length > 120 ? '…' : ''}` : null,
    d.experiences?.length ? `<strong>Expériences :</strong> ${d.experiences.length} poste${d.experiences.length > 1 ? 's' : ''} — ${d.experiences.map(e => e.title + (e.company ? ' chez ' + e.company : '')).join(', ')}` : null,
    d.education?.length   ? `<strong>Formation :</strong> ${d.education.map(e => e.degree + (e.school ? ' · ' + e.school : '')).join(', ')}` : null,
    skillCount ? `<strong>Compétences :</strong> ${skillCount} extraites (${d.tools?.length || 0} outils, ${d.certifs?.length || 0} certifications, ${d.customSkills?.length || 0} autres)` : null,
    d.languages?.length ? `<strong>Langues :</strong> ${d.languages.map(l => l.name + ' (' + l.level + ')').join(', ')}` : null,
  ].filter(Boolean);

  document.getElementById('import-cv-summary').innerHTML = lines.map(l => `<div style="margin-bottom:4px">· ${l}</div>`).join('');
}

function applyImportedCV() {
  if (!_importedData) return;

  // Fusionner avec DEF_PROFILE pour garantir tous les champs
  P = { ...DEF_PROFILE, ..._importedData };
  ss('sc_profile', P);

  // Mettre à jour tous les formulaires
  loadProfileToForm();
  renderChips();
  renderExpList();
  renderEduList();
  renderLangList();
  updateSBProfile();
  refreshDash();

  // Revenir sur l'onglet Infos pour que l'utilisateur vérifie
  document.querySelectorAll('.tabs .tab').forEach(t => t.classList.toggle('on', t.dataset.tab === 'info'));
  document.querySelectorAll('[id^="tab-"]').forEach(el => {
    el.classList.toggle('hidden', el.id !== 'tab-info');
  });

  document.getElementById('import-cv-preview').classList.add('hidden');
  document.getElementById('import-cv-txt').value = '';
  _importedData = null;

  toast('✅ Profil importé — vérifie les informations dans chaque onglet');
}

function cancelImport() {
  _importedData = null;
  document.getElementById('import-cv-preview').classList.add('hidden');
}
