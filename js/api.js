// ── AI API LAYER ───────────────────────────────────────────
// Supporte Groq (llama) et Gemini (Google, modèles Flash gratuits)
// Provider actif : localStorage 'sc_ai_provider' = 'groq' | 'gemini'

function getProvider() {
  return localStorage.getItem('sc_ai_provider') || 'groq';
}

async function callGroq(prompt, { maxTokens = 2000, temperature = 0.7 } = {}) {
  const _p = getProvider();
  if (_p === 'gemini' || _p === 'gemini-pro') {
    return callGemini(prompt, { maxTokens, temperature });
  }
  return _groqAvecBascule(localStorage.getItem('sc_key') || '', prompt, maxTokens, temperature);
}

// ── IA ACTIVÉES / DÉSACTIVÉES ──────────────────────────────
// Interrupteurs de la barre de gauche : une IA éteinte n'est jamais
// appelée, même en secours. Au moins une doit rester allumée.
const CLE_IA_ETEINTES = 'sc_ia_eteintes';

function iaEteintes() {
  try { return JSON.parse(localStorage.getItem(CLE_IA_ETEINTES)) || []; } catch { return []; }
}

function iaActive(id) {
  return !iaEteintes().includes(id);
}

function basculeIA(id) {
  const eteintes = iaEteintes();
  const i = eteintes.indexOf(id);
  if (i === -1) eteintes.push(id); else eteintes.splice(i, 1);
  localStorage.setItem(CLE_IA_ETEINTES, JSON.stringify(eteintes));
  if (typeof refreshProviderUI === 'function') refreshProviderUI();
  if (typeof toast === 'function') toast(i === -1 ? `${id} désactivée` : `${id} réactivée`);
}

// ── DERNIÈRE IA UTILISÉE ───────────────────────────────────
// Affichée dans la barre de gauche : tu sais toujours qui a répondu.
const CLE_DERNIERE_IA = 'sc_derniere_ia';

const NOMS_MODELES = {
  'gemini-3.8-flash': 'Gemini 3.8 Flash',
  'gemini-3-flash':   'Gemini 3 Flash',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'openai/gpt-oss-120b': 'GPT-OSS 120B (Groq)',
  'openai/gpt-oss-20b':  'GPT-OSS 20B (Groq)',
  'qwen/qwen3.6-27b':    'Qwen 3.6 27B (Groq)',
  'llama-3.3-70b-versatile': 'Llama 3.3 70B',
  'llama-3.3-70b':           'Llama 3.3 70B'
};

function noteIAUtilisee(fournisseur, modele) {
  try {
    localStorage.setItem(CLE_DERNIERE_IA, JSON.stringify({
      fournisseur, modele, quand: new Date().toISOString()
    }));
  } catch {}
  if (typeof renderDerniereIA === 'function') renderDerniereIA();
}

// ── MODÈLES GROQ ───────────────────────────────────────────
// Groq retire régulièrement des modèles (llama-3.3-70b-versatile a été
// supprimé le 16/08/2026). On essaie dans l'ordre et on retient celui qui
// répond, comme pour Gemini.
const GROQ_MODELES = ['openai/gpt-oss-120b', 'qwen/qwen3.6-27b', 'openai/gpt-oss-20b'];
const CLE_MODELE_GROQ = 'sc_groq_modele';

function modeleGroqRetenu() {
  const m = localStorage.getItem(CLE_MODELE_GROQ);
  return GROQ_MODELES.includes(m) ? m : null;
}

async function _appelGroq(modele, key, prompt, maxTokens, temperature) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({ model: modele, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens, temperature })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  const texte = (d.choices?.[0]?.message?.content || '').trim();
  if (!texte) throw new Error('Groq: réponse vide');
  return texte;
}

// Parcourt la liste jusqu'à trouver un modèle encore en service
async function _groqAvecBascule(key, prompt, maxTokens, temperature) {
  if (!key) throw new Error('Clé Groq manquante — ajoute-la dans les paramètres');
  const retenu = modeleGroqRetenu();
  const aEssayer = retenu ? [retenu, ...GROQ_MODELES.filter(m => m !== retenu)] : [...GROQ_MODELES];

  let derniereErreur;
  for (let i = 0; i < aEssayer.length; i++) {
    const modele = aEssayer[i];
    try {
      const texte = await _appelGroq(modele, key, prompt, maxTokens, temperature);
      if (localStorage.getItem(CLE_MODELE_GROQ) !== modele) {
        localStorage.setItem(CLE_MODELE_GROQ, modele);
        console.log('[AI] Groq : modèle retenu →', modele);
      }
      noteIAUtilisee('Groq', modele);
      return texte;
    } catch (e) {
      derniereErreur = e;
      if (_modeleIndisponible(e.message) && i < aEssayer.length - 1) {
        console.warn(`[AI] ${modele} indisponible — essai de ${aEssayer[i + 1]}`);
        if (localStorage.getItem(CLE_MODELE_GROQ) === modele) localStorage.removeItem(CLE_MODELE_GROQ);
        continue;
      }
      throw e;
    }
  }
  throw derniereErreur;
}

// ── MODÈLES GEMINI ─────────────────────────────────────────
// Du plus récent au plus ancien. Le site essaie dans cet ordre et retient
// celui qui répond avec ta clé : pas besoin de toucher au code quand Google
// change son catalogue. Tous sont des modèles « Flash », gratuits.
const GEMINI_MODELES = ['gemini-3.8-flash', 'gemini-3-flash', 'gemini-2.5-flash'];
const CLE_MODELE_GEMINI = 'sc_gemini_modele';

function modeleGeminiRetenu() {
  const m = localStorage.getItem(CLE_MODELE_GEMINI);
  return GEMINI_MODELES.includes(m) ? m : null;
}

// Modèle inconnu ou non ouvert à cette clé → on essaie le suivant.
// (À distinguer d'un quota dépassé, qui doit faire basculer sur Groq.)
function _modeleIndisponible(msg) {
  const m = (msg || '').toLowerCase();
  return m.includes('404') || m.includes('not found') || m.includes('is not supported')
      || m.includes('unsupported') || m.includes('does not exist') || m.includes('permission')
      || m.includes('decommissioned') || m.includes('deprecated') || m.includes('no longer');
}

// Réglage de la réflexion : Gemini 3 utilise « thinkingLevel » (high par
// défaut, ce qui épuisait le budget de sortie et tronquait le JSON) ;
// Gemini 2.5 utilise « thinkingBudget ». Les mélanger renvoie une erreur 400.
function _configGeneration(modele, maxTokens, temperature) {
  const cfg = { maxOutputTokens: Math.max(maxTokens * 3, 12000), temperature };
  cfg.thinkingConfig = /^gemini-3/.test(modele)
    ? { thinkingLevel: 'low' }
    : { thinkingBudget: 0 };
  return cfg;
}

async function _appelGemini(modele, key, prompt, maxTokens, temperature) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: _configGeneration(modele, maxTokens, temperature)
      })
    }
  );
  const d = await r.json();
  if (d.error) throw new Error(`Gemini: ${d.error.message} (code: ${d.error.code})`);
  const fin  = d.candidates?.[0]?.finishReason || '';
  // Une réponse coupée donne un JSON invalide plus loin : on la refuse ici
  // pour laisser la bascule faire son travail.
  const text = (d.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  if (!text) throw new Error(`Gemini: réponse vide — finish reason: ${fin || 'inconnu'}`);
  if (fin === 'MAX_TOKENS') throw new Error(`Gemini: réponse tronquée (limite de tokens atteinte sur ${modele})`);
  return text.trim();
}

async function _callGeminiWithKey(key, prompt, maxTokens, temperature) {
  // Le modèle déjà validé passe en premier ; sinon on descend la liste
  const retenu = modeleGeminiRetenu();
  const aEssayer = retenu ? [retenu, ...GEMINI_MODELES.filter(m => m !== retenu)] : [...GEMINI_MODELES];

  let derniereErreur;
  for (let i = 0; i < aEssayer.length; i++) {
    const modele = aEssayer[i];
    try {
      const texte = await _appelGemini(modele, key, prompt, maxTokens, temperature);
      noteIAUtilisee('Gemini', modele);
      if (localStorage.getItem(CLE_MODELE_GEMINI) !== modele) {
        localStorage.setItem(CLE_MODELE_GEMINI, modele);
        console.log('[AI] Gemini : modèle retenu →', modele);
      }
      return texte;
    } catch (e) {
      derniereErreur = e;

      // Modèle inconnu pour cette clé → on descend la liste définitivement
      if (_modeleIndisponible(e.message) && i < aEssayer.length - 1) {
        console.warn(`[AI] ${modele} indisponible avec cette clé — essai de ${aEssayer[i + 1]}`);
        if (localStorage.getItem(CLE_MODELE_GEMINI) === modele) localStorage.removeItem(CLE_MODELE_GEMINI);
        continue;
      }

      // Modèle saturé (503) ou trop sollicité : une 2e tentative après une
      // pause, puis on essaie un AUTRE modèle — changer de clé n'y ferait rien.
      if (_isTransientAIError(e.message ? e : new Error(''))) {
        try {
          await new Promise(r => setTimeout(r, 1200));
          const texte = await _appelGemini(modele, key, prompt, maxTokens, temperature);
          noteIAUtilisee('Gemini', modele);
          return texte;
        } catch (e2) {
          derniereErreur = e2;
          if (i < aEssayer.length - 1) {
            console.warn(`[AI] ${modele} saturé — essai de ${aEssayer[i + 1]}`);
            continue;
          }
        }
      }
      throw derniereErreur;   // quota épuisé, clé invalide : bascule plus haut
    }
  }
  throw derniereErreur;
}

// Erreur temporaire/surcharge → on doit basculer sur un autre provider
function _isTransientAIError(e) {
  const msg = (e.message || '').toLowerCase();
  return msg.includes('429') || msg.includes('rate') || msg.includes('quota')
      || msg.includes('resource_exhausted') || msg.includes('too many')
      || msg.includes('503') || msg.includes('500') || msg.includes('overload')
      || msg.includes('high demand') || msg.includes('unavailable') || msg.includes('try again')
      || msg.includes('tronqu');
}

async function callGemini(prompt, { maxTokens = 2000, temperature = 0.7 } = {}) {
  const proKey   = localStorage.getItem('sc_gemini_pro_key') || '';
  const persoKey = localStorage.getItem('sc_gemini_key') || '';
  const groqKey  = localStorage.getItem('sc_key') || '';
  if (!proKey && !persoKey) throw new Error('Clé Gemini manquante — ajoute-la dans les paramètres');
  if (!iaActive('gemini') && !iaActive('gemini-pro') && iaActive('groq')) {
    return _callGroqDirect(prompt, { maxTokens, temperature });   // Gemini éteint
  }

  // Chaîne de secours : Gemini Pro → Gemini perso → Groq
  const queue = [];
  if (proKey   && iaActive('gemini-pro')) queue.push({ name: 'Gemini Pro', fn: () => _callGeminiWithKey(proKey,   prompt, maxTokens, temperature) });
  if (persoKey && iaActive('gemini'))     queue.push({ name: 'Gemini',     fn: () => _callGeminiWithKey(persoKey, prompt, maxTokens, temperature) });
  if (groqKey  && iaActive('groq'))       queue.push({ name: 'Groq',       fn: () => _callGroqDirect(prompt, { maxTokens, temperature }) });
  if (!queue.length) throw new Error('Toutes les IA sont désactivées — rallume-en une dans la barre de gauche');

  let lastErr;
  for (let i = 0; i < queue.length; i++) {
    try {
      return await queue[i].fn();
    } catch (e) {
      lastErr = e;
      const transient = _isTransientAIError(e);
      const hasNext = i < queue.length - 1;
      if (transient && hasNext) {
        console.warn(`[AI] ${queue[i].name} indisponible (${e.message}) — bascule sur ${queue[i+1].name}`);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

function groqErrorMessage(e) {
  if (e.message.includes('401') || e.message.includes('API key')) return 'Clé API invalide ou expirée';
  if (e.message.includes('429')) return '⏳ Trop de requêtes — attends quelques secondes et réessaie';
  return 'Erreur : ' + e.message;
}

// ── APPEL GROQ FORCÉ (bypass du check provider) ────────────
async function _callGroqDirect(prompt, { maxTokens = 2000, temperature = 0.7 } = {}) {
  return _groqAvecBascule(localStorage.getItem('sc_key') || '', prompt, maxTokens, temperature);
}

// ── AUTO-FALLBACK : Gemini → Groq (ou l'inverse selon les clés dispo) ──
// Retourne { text, provider } — bascule automatiquement sur 429 / quota
async function callAIAuto(prompt, options = {}) {
  const hasGemini = !!((localStorage.getItem('sc_gemini_pro_key') && iaActive('gemini-pro'))
                    || (localStorage.getItem('sc_gemini_key')     && iaActive('gemini')));
  const groqKey   = iaActive('groq') ? (localStorage.getItem('sc_key') || '') : '';

  const queue = [];
  if (hasGemini) queue.push({ name: 'Gemini', model: modeleGeminiRetenu() || GEMINI_MODELES[0], fn: () => callGemini(prompt, options) });
  if (groqKey)   queue.push({ name: 'Groq',   model: modeleGroqRetenu() || GROQ_MODELES[0], fn: () => _callGroqDirect(prompt, options) });

  if (!queue.length) throw new Error('Aucune IA disponible — vérifie tes clés et les interrupteurs dans la barre de gauche');

  const errs = [];
  for (const p of queue) {
    try {
      const text = await p.fn();
      return { text, provider: p.name, model: p.model };
    } catch (e) {
      const msg = (e.message || '').toLowerCase();
      const isLimit = msg.includes('429') || msg.includes('rate') || msg.includes('quota') || msg.includes('resource_exhausted') || msg.includes('too many') || msg.includes('tronqu');
      console.warn(`[AI] ${p.name} ${isLimit ? 'rate limit' : 'erreur'}: ${e.message}`);
      errs.push(`${p.name}: ${e.message}`);
      // Toujours essayer le provider suivant (rate limit OU autre erreur)
      continue;
    }
  }
  throw new Error('Tous les providers ont échoué — ' + errs.join(' | '));
}

// ── AFFICHAGE « DERNIÈRE IA » (barre de gauche) ────────────
function renderDerniereIA() {
  const ancre = document.getElementById('api-keys-panel');
  if (!ancre) return;
  let el = document.getElementById('derniere-ia');
  if (!el) {
    el = document.createElement('div');
    el.id = 'derniere-ia';
    el.className = 'derniere-ia';
    ancre.insertAdjacentElement('afterend', el);
  }
  let info = null;
  try { info = JSON.parse(localStorage.getItem(CLE_DERNIERE_IA) || 'null'); } catch {}
  if (!info) {
    el.innerHTML = `<span class="derniere-ia-label">Dernière IA</span><span class="derniere-ia-vide">aucune action pour l'instant</span>`;
    return;
  }
  const d = new Date(info.quand);
  const heure = isNaN(d) ? '' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const jour  = isNaN(d) || d.toDateString() === new Date().toDateString()
    ? '' : ' · ' + d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  const nom = NOMS_MODELES[info.modele] || info.modele || info.fournisseur;
  el.innerHTML = `<span class="derniere-ia-label">Dernière IA</span>
    <span class="derniere-ia-nom">${nom}</span>
    <span class="derniere-ia-heure">${heure}${jour}</span>`;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderDerniereIA);
} else {
  renderDerniereIA();
}
