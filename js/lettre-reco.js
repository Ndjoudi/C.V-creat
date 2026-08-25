// ── LETTRE DE RECOMMANDATION ───────────────────────────────
// Tu déposes ton PDF une fois : on en extrait le texte, qui devient
// une vraie page 2 du CV (texte sélectionnable, lisible par les ATS).
//
// Stocké dans le profil :
//   P.lettreReco       { nom, texte, pages, ajouteeLe }
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

// ── RENDU FIDÈLE DES PAGES ─────────────────────────────────
// On dessine chaque page telle quelle : mise en page, puces, signature,
// en-tête — tout est conservé à l'identique.
async function _rendPagesPdf(doc, largeurCible = 1240) {
  const images = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page  = await doc.getPage(p);
    const base  = page.getViewport({ scale: 1 });
    const scale = Math.min(largeurCible / base.width, 3);
    const vp    = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width  = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Certains navigateurs bridés n'arrivent pas à dessiner un PDF :
    // on ne reste pas bloqué, on laisse la solution de repli prendre le relais.
    const tache = page.render({ canvasContext: ctx, viewport: vp });
    await Promise.race([
      tache.promise,
      new Promise((_, rej) => setTimeout(() => {
        try { tache.cancel(); } catch {}
        rej(new Error('rendu de la page ' + p + ' trop long'));
      }, 15000))
    ]);

    // JPEG de bonne qualité : bien plus léger que PNG, sans perte visible sur du texte
    images.push(canvas.toDataURL('image/jpeg', 0.92));
  }
  return images;
}

// ── EXTRACTION DU TEXTE ────────────────────────────────────
// Sert de couche invisible sous l'image, pour que les ATS lisent la lettre.
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
  //    Sinon les lignes sont recollées : le texte se remettra en forme
  //    tout seul à la largeur de la page, comme un vrai courrier.
  let texte = lignes[0].txt;
  for (let i = 1; i < lignes.length; i++) {
    const memePage = lignes[i].page === lignes[i - 1].page;
    const ecart    = lignes[i - 1].y - lignes[i].y;
    const nouveauParagraphe = !memePage || ecart > interligne * 1.5;
    texte += nouveauParagraphe ? '\n\n' + lignes[i].txt : ' ' + lignes[i].txt;
  }

  // Renvoie une chaîne : le nombre de pages est déjà connu via doc.numPages
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
    const pdfjs  = await _chargePdfJs();
    const buffer = await f.arrayBuffer();
    const doc    = await pdfjs.getDocument({ data: buffer }).promise;

    // Le texte d'abord : il sert de couche ATS, et de repli si le rendu échoue
    const texte = await _texteDuDocument(doc);

    // Puis l'image fidèle de chaque page — l'essentiel, pour garder la mise en page
    let images = [];
    try {
      images = await _rendPagesPdf(doc);
    } catch (err) {
      console.warn('[Lettre] rendu image indisponible, repli sur le texte :', err.message);
    }
    if (!images.length && (!texte || texte.length < 40)) {
      throw new Error('Ni image ni texte exploitable dans ce PDF');
    }

    const poids = Math.round(images.reduce((n, i) => n + i.length, 0) / 1024);
    if (poids > 4300) {
      throw new Error(`Lettre trop lourde (${poids} Ko) — réduis le nombre de pages`);
    }

    P.lettreReco = {
      nom: f.name, pages: doc.numPages, images, texte,
      poidsKo: poids, ajouteeLe: new Date().toISOString()
    };
    if (P.lettreRecoActive === undefined) P.lettreRecoActive = true;

    try {
      ss('sc_profile', P);
    } catch {
      delete P.lettreReco;
      throw new Error('Espace de stockage saturé — essaie un PDF plus léger');
    }

    renderLettreReco();
    toast(images.length
      ? `✓ Lettre ajoutée — ${doc.numPages} page${doc.numPages > 1 ? 's' : ''} à l'identique (${poids} Ko)`
      : '✓ Lettre ajoutée en texte — la mise en page d\'origine n\'a pas pu être reproduite');
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
}

function _lettreRecoToggleEdition() {
  const z = document.getElementById('lettre-reco-edit');
  if (!z) return;
  const ouvert = z.style.display !== 'none';
  z.style.display = ouvert ? 'none' : 'block';
  if (!ouvert) z.querySelector('textarea')?.focus();
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
        <button class="btn btn-g" style="font-size:11.5px;padding:4px 10px" onclick="_lettreRecoToggleEdition()">Aperçu</button>
        <label class="btn btn-g" style="font-size:11.5px;padding:4px 10px;cursor:pointer;margin:0">
          Remplacer
          <input type="file" accept="application/pdf,.pdf" style="display:none" onchange="_lettreRecoImporte(this)"/>
        </label>
        <button class="btn btn-g" style="font-size:11.5px;padding:4px 10px;color:var(--red);border-color:#fecaca"
          onclick="_lettreRecoSupprime()">Supprimer</button>
      </div>

      <div id="lettre-reco-edit" style="display:none;margin-top:12px">
        <div style="font-size:11px;color:var(--ink3);margin-bottom:7px">
          Voilà exactement ce qui sera ajouté à ton PDF — mise en page, puces et signature comprises.
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          ${(L.images || []).map((src, i) => `
            <div style="flex:0 0 auto">
              <img src="${src}" alt="Page ${i + 1}"
                style="width:230px;border:1px solid var(--border);border-radius:6px;display:block;
                box-shadow:0 2px 8px rgba(0,0,0,.08)"/>
              <div style="text-align:center;font-size:10.5px;color:var(--ink3);margin-top:4px">Page ${i + 1}</div>
            </div>`).join('')}
        </div>

        <details style="margin-top:12px">
          <summary style="cursor:pointer;font-size:11.5px;color:var(--ink3);font-weight:600">
            Texte lu par les robots de recrutement (modifiable)
          </summary>
          <div style="font-size:11px;color:var(--ink3);margin:6px 0 5px">
            Ce texte est invisible dans le PDF : il double l'image pour que les ATS puissent lire ta lettre.
          </div>
          <textarea class="inp" style="width:100%;min-height:150px;font-size:12px;line-height:1.6;resize:vertical"
            oninput="_lettreRecoSauveTexte(this.value)">${esc(L.texte || '')}</textarea>
        </details>
      </div>
    </div>`;
}

// ── PAGES À JOINDRE AU PDF ─────────────────────────────────
// Chaque page de ta lettre est reproduite telle quelle. Sous l'image,
// une couche de texte invisible (le même contenu) permet aux ATS de
// lire la lettre — c'est le principe d'un PDF scanné "recherchable".
function lettreRecoHtmlPourPdf() {
  const L = P.lettreReco;
  if (!L || P.lettreRecoActive === false) return '';
  const images = L.images || [];

  // Cas normal : les pages telles quelles
  if (images.length) {
    return images.map((src, i) => `
      <div class="lettre-reco-page">
        ${i === 0 && L.texte ? `<div class="lettre-reco-ats">${esc(L.texte)}</div>` : ''}
        <img class="lettre-reco-img" src="${src}" alt="Lettre de recommandation"/>
      </div>`).join('');
  }

  // Repli : le navigateur n'a pas pu dessiner les pages → version texte
  if (!L.texte?.trim()) return '';
  const paragraphes = L.texte
    .split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
    .map(p => `<p style="margin:0 0 9px">${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  const aDejaUnTitre = /recommandation|attestation|qui de droit/i.test(L.texte.slice(0, 70));

  return `
    <div class="cv-doc lettre-reco-page lettre-reco-texte">
      ${aDejaUnTitre ? '' : '<div class="cv-stitle" style="margin-bottom:12px">Lettre de recommandation</div>'}
      <div class="lettre-reco-corps">${paragraphes}</div>
    </div>`;
}
