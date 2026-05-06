// ── GROQ API LAYER ────────────────────────────────────────
// Single entry point for all Groq calls — no duplication across modules

async function callGroq(prompt, { maxTokens = 2000, temperature = 0.7, model = 'llama-3.3-70b-versatile' } = {}) {
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

function groqErrorMessage(e) {
  if (e.message.includes('401')) return '❌ Clé API invalide ou expirée — vérifie ta clé Groq';
  if (e.message.includes('429')) return '⏳ Trop de requêtes — attends quelques secondes et réessaie';
  return 'Erreur : ' + e.message;
}
