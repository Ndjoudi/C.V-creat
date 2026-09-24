// ── SAUVEGARDE ET RESTAURATION ─────────────────────────────
// Tout le site est enregistré dans le navigateur (localStorage). Vider les
// données de navigation, changer de navigateur ou d'ordinateur, et tout est
// perdu. Ce module télécharge un fichier qui contient TOUT, et sait le
// remettre en place.
//
//   • bouton ⬆ (barre de gauche) → sauvegardeMaintenant()
//   • bouton ⬇ (barre de gauche) → restaureDepuisFichier()
//   • au chargement : sauvegarde automatique si la dernière date de plus de
//     7 jours (verifieSauvegardeHebdo)
//
// Le fichier contient aussi tes clés API : ne le partage pas.

const SAUVEGARDE_PREFIXE = 'sc_';
const SAUVEGARDE_DATE    = 'sc_derniere_sauvegarde';
const SAUVEGARDE_JOURS   = 7;

function _jourISO(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Toutes les données du site, telles qu'elles sont stockées
function _contenuSauvegarde() {
  const donnees = {};
  Object.keys(localStorage)
    .filter(k => k.startsWith(SAUVEGARDE_PREFIXE) && k !== SAUVEGARDE_DATE)
    .forEach(k => { donnees[k] = localStorage.getItem(k); });
  return {
    _avertissement: 'Fichier de sauvegarde Supply Copilot — contient tes clés API, ne le partage pas.',
    version: 1,
    date: new Date().toISOString(),
    donnees
  };
}

function _telecharge(nom, texte) {
  const blob = new Blob([texte], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sauvegardeMaintenant(auto = false) {
  const contenu = _contenuSauvegarde();
  const nbCands = (ls('sc_cands', []) || []).length;
  _telecharge(`supply-copilot-${_jourISO()}.json`, JSON.stringify(contenu, null, 2));
  localStorage.setItem(SAUVEGARDE_DATE, _jourISO());
  if (typeof toast === 'function') {
    toast(auto
      ? `✓ Sauvegarde hebdomadaire téléchargée (${nbCands} candidature${nbCands > 1 ? 's' : ''})`
      : `✓ Sauvegarde téléchargée (${nbCands} candidature${nbCands > 1 ? 's' : ''})`);
  }
  if (auto) _bandeauSauvegarde(nbCands);
}

// Bandeau après une sauvegarde automatique : certains navigateurs bloquent
// un téléchargement non demandé, il faut donc pouvoir le relancer à la main.
function _bandeauSauvegarde(nbCands) {
  document.getElementById('sauvegarde-bandeau')?.remove();
  const b = document.createElement('div');
  b.id = 'sauvegarde-bandeau';
  b.className = 'sv-bandeau';
  b.innerHTML = `
    <span>💾 Sauvegarde hebdomadaire téléchargée — <strong>supply-copilot-${_jourISO()}.json</strong>
      (${nbCands} candidature${nbCands > 1 ? 's' : ''}). Range-la ailleurs que dans « Téléchargements ».</span>
    <button class="btn btn-g sv-mini" onclick="sauvegardeMaintenant()">Retélécharger</button>
    <button class="btn btn-g sv-mini" onclick="this.parentElement.remove()">OK</button>`;
  document.body.appendChild(b);   // flottant : ne perturbe pas la mise en page
}

// ── RESTAURATION ───────────────────────────────────────────
function restaureDepuisFichier() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = e => {
    const f = e.target.files?.[0];
    if (!f) return;
    const lecteur = new FileReader();
    lecteur.onload = ev => {
      try {
        appliqueSauvegarde(JSON.parse(ev.target.result));
      } catch (err) {
        if (typeof toast === 'function') toast('⚠ ' + (err.message || 'Fichier illisible'));
        else alert('Fichier illisible');
      }
    };
    lecteur.readAsText(f);
  };
  input.click();
}

// Remplace toutes les données par celles de la sauvegarde.
// Accepte le format actuel (toutes les clés) et l'ancien (profil + candidatures).
function appliqueSauvegarde(data) {
  const donnees = data.donnees || (data.profile ? {
    sc_profile: JSON.stringify(data.profile),
    sc_cands:   JSON.stringify(data.candidatures || []),
    sc_history: JSON.stringify(data.historique  || [])
  } : null);
  if (!donnees) throw new Error('Fichier de sauvegarde non reconnu');

  const cands = JSON.parse(donnees.sc_cands || '[]');
  const quand = data.date ? new Date(data.date).toLocaleDateString('fr-FR') : 'date inconnue';
  if (!confirm(`Remplacer TOUTES tes données actuelles par cette sauvegarde du ${quand} `
    + `(${cands.length} candidature${cands.length > 1 ? 's' : ''}) ?`)) return false;

  Object.keys(localStorage)
    .filter(k => k.startsWith(SAUVEGARDE_PREFIXE))
    .forEach(k => localStorage.removeItem(k));
  Object.entries(donnees).forEach(([k, v]) => localStorage.setItem(k, v));

  alert('Sauvegarde restaurée. La page va se recharger.');
  location.reload();
  return true;
}

// ── SAUVEGARDE AUTOMATIQUE HEBDOMADAIRE ────────────────────
function verifieSauvegardeHebdo() {
  // Rien à sauvegarder tant que le profil est vide
  const profil = ls('sc_profile', null);
  if (!profil || !(profil.firstName || profil.lastName || (ls('sc_cands', []) || []).length)) return;

  const derniere = localStorage.getItem(SAUVEGARDE_DATE);
  if (derniere) {
    const jours = Math.round((new Date(_jourISO()) - new Date(derniere)) / 86400000);
    if (jours < SAUVEGARDE_JOURS) return;
  }
  sauvegardeMaintenant(true);
}

// Au démarrage, une fois l'app affichée
setTimeout(verifieSauvegardeHebdo, 2500);
