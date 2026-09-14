// ── LETTRE DE RECOMMANDATION ───────────────────────────────
// Tu déposes ton PDF une fois : on en extrait le texte, qui devient la
// page 2 de chaque CV, en TEXTE VISIBLE (lisible par les ATS et par l'œil).
//
// Pourquoi pas une image de la lettre avec son texte caché dessous ?
// Les ATS extraient le texte sans les couleurs : un texte invisible est
// vu comme du « texte blanc caché » et peut faire écarter la candidature.
//
// Stocké dans le profil :
//   P.lettreReco       { nom, pages, texte, ajouteeLe }
//   P.lettreRecoActive true/false — l'interrupteur

// pdf.js est embarqué dans le site (js/vendor) : pas de dépendance externe,
// ça marche hors ligne et rien n'est envoyé à un tiers.
const PDFJS_BASE = 'js/vendor';
let _pdfjsPret = null;

// Chargé à la demande, pas au démarrage du site (1,4 Mo)
function _chargePdfJs() {
  if (_pdfjsPret) return _pdfjsPret;
  _pdfjsPret = new Promise((resolve, reject) => {
    if (window.pdfjsLib) return resolve(window.pdfjsLib);
    const s = document.createElement('script');
    s.src = `${PDFJS_BASE}/pdf.min.js`;
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.js`;
      resolve(window.pdfjsLib);
    };
    s.onerror = () => reject(new Error('Lecteur PDF introuvable (js/vendor manquant ?)'));
    document.head.appendChild(s);
  });
  return _pdfjsPret;
}

// ── NETTOYAGE DES ANCIENNES LETTRES ────────────────────────
// Les versions précédentes stockaient aussi l'image de chaque page
// (plusieurs centaines de Ko). On ne s'en sert plus : on libère la place.
(function nettoieAnciennesLettres() {
  if (typeof P === 'undefined' || !P.lettreReco) return;
  if (!P.lettreReco.images && P.lettreReco.poidsKo === undefined) return;
  delete P.lettreReco.images;
  delete P.lettreReco.poidsKo;
  try { ss('sc_profile', P); } catch {}
})();

// ── EXTRACTION DU TEXTE ────────────────────────────────────
async function _texteDuDocument(doc) {
  // 1) Reconstruit les lignes en s'appuyant sur la position verticale des mots
  const lignes = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const c    = await page.getTextContent();

    let txt = '', dernierY = null;
    for (const item of c.items) {
      const y = Math.round(item.transform[5]);
      if (dernierY !== null && Math.abs(y - dernierY) > 3) {
        if (txt.trim()) lignes.push({ txt: txt.trim(), y: dernierY, page: p });
        txt = '';
      }
      txt += item.str;
      dernierY = y;
    }
    if (txt.trim()) lignes.push({ txt: txt.trim(), y: dernierY, page: p });
  }
  if (!lignes.length) return '';

  // 2) Interligne courant = écart le plus fréquent entre deux lignes
  const ecarts = [];
  for (let i = 1; i < lignes.length; i++) {
    if (lignes[i].page !== lignes[i - 1].page) continue;
    const d = lignes[i - 1].y - lignes[i].y;
    if (d > 0) ecarts.push(d);
  }
  ecarts.sort((a, b) => a - b);
  const interligne = ecarts.length ? ecarts[Math.floor(ecarts.length / 2)] : 12;

  // 3) Un écart nettement plus grand = changement de paragraphe.
  //    Sinon les lignes sont recollées : le texte se remet en forme
  //    tout seul à la largeur de la page, comme un vrai courrier.
  let texte = lignes[0].txt;
  for (let i = 1; i < lignes.length; i++) {
    const memePage = lignes[i].page === lignes[i - 1].page;
    const ecart    = lignes[i - 1].y - lignes[i].y;
    const nouveauParagraphe = !memePage || ecart > interligne * 1.5;
    texte += nouveauParagraphe ? '\n\n' + lignes[i].txt : ' ' + lignes[i].txt;
  }

  return texte
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── DÉPÔT DU FICHIER ───────────────────────────────────────
async function _lettreRecoImporte(input) {
  const f = input.files?.[0];
  if (!f) return;
  input.value = '';                       // permet de redéposer le même fichier

  if (!/\.pdf$/i.test(f.name)) { toast('Dépose un fichier PDF'); return; }
  if (f.size > 12 * 1024 * 1024) { toast('PDF trop lourd (12 Mo maximum)'); return; }

  const bloc = document.getElementById('lettre-reco-bloc');
  if (bloc) bloc.innerHTML = `<div class="ldg" style="padding:14px"><div class="sp"></div>
    <span style="font-size:12.5px;color:var(--ink3)">Lecture de ${esc(f.name)}…</span></div>`;

  try {
    const pdfjs = await _chargePdfJs();
    const doc   = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise;
    const texte = await _texteDuDocument(doc);
    if (!texte || texte.length < 40) {
      throw new Error('Aucun texte trouvé — ce PDF est probablement un scan');
    }

    P.lettreReco = { nom: f.name, pages: doc.numPages, texte, ajouteeLe: new Date().toISOString() };
    if (P.lettreRecoActive === undefined) P.lettreRecoActive = true;
    ss('sc_profile', P);

    renderLettreReco();
    toast(`✓ Lettre ajoutée — ${texte.length} caractères. Relis le texte dans « Aperçu ».`);
  } catch (e) {
    renderLettreReco();
    toast('⚠ ' + e.message);
  }
}

function _lettreRecoBascule() {
  P.lettreRecoActive = !P.lettreRecoActive;
  ss('sc_profile', P);
  renderLettreReco();
}

function _lettreRecoSupprime() {
  if (!confirm('Supprimer la lettre de recommandation ?')) return;
  delete P.lettreReco;
  ss('sc_profile', P);
  renderLettreReco();
  toast('Lettre supprimée');
}

function _lettreRecoSauveTexte(val) {
  if (!P.lettreReco) return;
  P.lettreReco.texte = val;
  ss('sc_profile', P);
  const apercu = document.getElementById('lettre-reco-apercu');
  if (apercu) apercu.innerHTML = _lettreRecoCorpsHtml(val);
}

function _lettreRecoToggleEdition() {
  const z = document.getElementById('lettre-reco-edit');
  if (!z) return;
  z.style.display = z.style.display !== 'none' ? 'none' : 'block';
}

// Paragraphes du texte → HTML (partagé par l'aperçu et le PDF)
function _lettreRecoCorpsHtml(texte) {
  return (texte || '')
    .split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
    .map(p => `<p style="margin:0 0 9px">${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

// ── AFFICHAGE DU BLOC ──────────────────────────────────────
function renderLettreReco() {
  const el = document.getElementById('lettre-reco-bloc');
  if (!el) return;
  const L = P.lettreReco;

  if (!L) {
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--bg);
        border:1.5px dashed var(--border);border-radius:10px;padding:10px 14px">
        <span style="font-size:10px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.08em">
          Lettre de recommandation
        </span>
        <span style="font-size:12px;color:var(--ink3);flex:1;min-width:150px">
          Ajoute-la une fois : elle sera jointe en page 2 de chaque CV
        </span>
        <label class="btn btn-g" style="font-size:12px;cursor:pointer;margin:0">
          + Déposer un PDF
          <input type="file" accept="application/pdf,.pdf" style="display:none"
            onchange="_lettreRecoImporte(this)"/>
        </label>
      </div>`;
    return;
  }

  const actif = P.lettreRecoActive !== false;
  const date  = new Date(L.ajouteeLe);
  const quand = isNaN(date) ? '' : date.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'2-digit' });

  el.innerHTML = `
    <div style="background:var(--bg);border:1.5px solid ${actif ? 'var(--teal-border)' : 'var(--border)'};
      border-radius:10px;padding:10px 14px">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span onclick="_lettreRecoBascule()" title="${actif ? 'Ne plus joindre' : 'Joindre au CV'}"
          style="cursor:pointer;user-select:none;flex-shrink:0;width:38px;height:21px;border-radius:100px;
          background:${actif ? 'var(--teal-d)' : 'var(--border)'};position:relative;transition:background .18s">
          <span style="position:absolute;top:2.5px;left:${actif ? '19px' : '2.5px'};width:16px;height:16px;
            border-radius:50%;background:#fff;transition:left .18s;box-shadow:0 1px 3px rgba(0,0,0,.25)"></span>
        </span>
        <div style="flex:1;min-width:150px">
          <div style="font-size:12.5px;font-weight:700;color:var(--ink)">
            ${esc(L.nom)}
            <span style="font-weight:400;color:var(--ink3);font-size:11px">
              · ${L.pages} page${L.pages > 1 ? 's' : ''} · ajoutée le ${quand}
            </span>
          </div>
          <div style="font-size:11.5px;color:${actif ? 'var(--teal-d)' : 'var(--ink3)'};font-weight:600;margin-top:1px">
            ${actif ? '✓ Jointe en page 2 de chaque CV' : 'Non jointe — CV seul'}
          </div>
        </div>
        <button class="btn btn-g" style="font-size:11.5px;padding:4px 10px" onclick="_lettreRecoToggleEdition()">Aperçu et correction</button>
        <label class="btn btn-g" style="font-size:11.5px;padding:4px 10px;cursor:pointer;margin:0">
          Remplacer
          <input type="file" accept="application/pdf,.pdf" style="display:none" onchange="_lettreRecoImporte(this)"/>
        </label>
        <button class="btn btn-g" style="font-size:11.5px;padding:4px 10px;color:var(--red);border-color:#fecaca"
          onclick="_lettreRecoSupprime()">Supprimer</button>
      </div>

      <div id="lettre-reco-edit" style="display:none;margin-top:12px">
        <div style="font-size:11px;color:var(--ink3);margin-bottom:6px">
          Texte extrait de ton PDF. Corrige-le si une ligne a été mal coupée : c'est exactement ce texte,
          visible, qui apparaîtra en page 2.
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start">
          <textarea class="inp" style="flex:1;min-width:260px;min-height:220px;font-size:12px;line-height:1.6;resize:vertical"
            oninput="_lettreRecoSauveTexte(this.value)">${esc(L.texte || '')}</textarea>
          <div id="lettre-reco-apercu" class="lettre-reco-corps"
            style="flex:1;min-width:260px;max-height:320px;overflow:auto;background:#fff;border:1px solid var(--border);
            border-radius:6px;padding:14px 16px">${_lettreRecoCorpsHtml(L.texte)}</div>
        </div>
      </div>
    </div>`;
}

// ── PAGE 2 DU PDF ──────────────────────────────────────────
// Texte visible uniquement : aucun élément caché, aucune image.
function lettreRecoHtmlPourPdf() {
  const L = P.lettreReco;
  if (!L || P.lettreRecoActive === false || !L.texte?.trim()) return '';

  // Si la lettre porte déjà son propre titre, on n'en rajoute pas un second
  const aDejaUnTitre = /recommandation|attestation|qui de droit/i.test(L.texte.slice(0, 70));

  return `
    <div class="cv-doc lettre-reco-page lettre-reco-texte">
      ${aDejaUnTitre ? '' : '<div class="cv-stitle" style="margin-bottom:12px">Lettre de recommandation</div>'}
      <div class="lettre-reco-corps">${_lettreRecoCorpsHtml(L.texte)}</div>
    </div>`;
}
