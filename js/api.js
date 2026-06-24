// ── AI API LAYER ───────────────────────────────────────────
// Supporte Groq (llama) et Gemini (Google)
// Provider actif : localStorage 'sc_ai_provider' = 'groq' | 'gemini'

function getProvider() {
  return localStorage.getItem('sc_ai_provider') || 'groq';
}

async function callGroq(prompt, { maxTokens = 2000, temperature = 0.7, model = 'llama-3.3-70b-versatile' } = {}) {
  const _p = getProvider();
  if (_p === 'gemini' || _p === 'gemini-pro') {
    return callGemini(prompt, { maxTokens, temperature });
  }

  const key = localStorage.getItem('sc_key') || '';
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens, temperature })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return (d.choices?.[0]?.message?.content || '').trim();
}

async function _callGeminiWithKey(key, prompt, maxTokens, temperature) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: Math.max(maxTokens * 2, 8000),
          temperature,
          thinkingConfig: { thinkingBudget: 0 }
        }
      })
    }
  );
  const d = await r.json();
  if (d.error) throw new Error(`Gemini: ${d.error.message} (code: ${d.error.code})`);
  const text = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) throw new Error(`Gemini: réponse vide — finish reason: ${d.candidates?.[0]?.finishReason || 'inconnu'}`);
  console.log('🔵 Gemini raw response:', text);
  return text.trim();
}

async function callGemini(prompt, { maxTokens = 2000, temperature = 0.7 } = {}) {
  const proKey  = localStorage.getItem('sc_gemini_pro_key') || '';
  const persoKey = localStorage.getItem('sc_gemini_key') || '';
  if (!proKey && !persoKey) throw new Error('Clé Gemini manquante — ajoute-la dans les paramètres');

  if (proKey) {
    try {
      return await _callGeminiWithKey(proKey, prompt, maxTokens, temperature);
    } catch (e) {
      const msg = (e.message || '').toLowerCase();
      const isLimit = msg.includes('429') || msg.includes('rate') || msg.includes('quota') || msg.includes('resource_exhausted') || msg.includes('too many');
      if (isLimit && persoKey) {
        console.warn('[AI] Gemini Pro rate limit — bascule sur Gemini perso');
        return await _callGeminiWithKey(persoKey, prompt, maxTokens, temperature);
      }
      throw e;
    }
  }
  return await _callGeminiWithKey(persoKey, prompt, maxTokens, temperature);
}

function groqErrorMessage(e) {
  if (e.message.includes('401') || e.message.includes('API key')) return 'Clé API invalide ou expirée';
  if (e.message.includes('429')) return '⏳ Trop de requêtes — attends quelques secondes et réessaie';
  return 'Erreur : ' + e.message;
}

// ── APPEL GROQ FORCÉ (bypass du check provider) ────────────
async function _callGroqDirect(prompt, { maxTokens = 2000, temperature = 0.7, model = 'llama-3.3-70b-versatile' } = {}) {
  const key = localStorage.getItem('sc_key') || '';
  if (!key) throw new Error('Clé Groq manquante — ajoute-la dans les paramètres');
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens, temperature })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return (d.choices?.[0]?.message?.content || '').trim();
}

// ── AUTO-FALLBACK : Gemini → Groq (ou l'inverse selon les clés dispo) ──
// Retourne { text, provider } — bascule automatiquement sur 429 / quota
async function callAIAuto(prompt, options = {}) {
  const hasGemini = !!(localStorage.getItem('sc_gemini_pro_key') || localStorage.getItem('sc_gemini_key'));
  const groqKey   = localStorage.getItem('sc_key') || '';

  const queue = [];
  if (hasGemini) queue.push({ name: 'Gemini', model: 'gemini-2.5-flash', fn: () => callGemini(prompt, options) });
  if (groqKey)   queue.push({ name: 'Groq',   model: 'llama-3.3-70b',   fn: () => _callGroqDirect(prompt, options) });

  if (!queue.length) throw new Error('Aucune clé API configurée — ajoute une clé Gemini ou Groq dans les paramètres');

  const errs = [];
  for (const p of queue) {
    try {
      const text = await p.fn();
      return { text, provider: p.name, model: p.model };
    } catch (e) {
      const msg = (e.message || '').toLowerCase();
      const isLimit = msg.includes('429') || msg.includes('rate') || msg.includes('quota') || msg.includes('resource_exhausted') || msg.includes('too many');
      console.warn(`[AI] ${p.name} ${isLimit ? 'rate limit' : 'erreur'}: ${e.message}`);
      errs.push(`${p.name}: ${e.message}`);
      // Toujours essayer le provider suivant (rate limit OU autre erreur)
      continue;
    }
  }
  throw new Error('Tous les providers ont échoué — ' + errs.join(' | '));
}
