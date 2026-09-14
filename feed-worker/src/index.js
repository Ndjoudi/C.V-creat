// ═══════════════════════════════════════════════════════════
//  JOB FEED — veille automatique d'offres d'emploi
//  Tourne 2×/jour sur Cloudflare, détecte les nouvelles offres
//  et envoie un email récapitulatif.
// ═══════════════════════════════════════════════════════════

// ── LES SOURCES ────────────────────────────────────────────
// Pour ajouter une entreprise : copier un bloc et adapter.
const SOURCES = [
  {
    id: 'stef',
    nom: 'STEF',
    url: 'https://stef.jobs/fr/postuler/',
    type: 'html',
    selectors: {
      card:     '.bloc',     // le conteneur d'une offre
      title:    'h3',        // le titre du poste
      location: '.lieu',     // le lieu
      sector:   '.type',     // le métier / secteur
      contract: '.contrat',  // CDI, CDD, Alternance...
      link:     'a'          // le lien pour postuler
    },
    // Page de détail : d'où extraire la description complète
    detail: {
      hosts:    ['apply.stef.jobs', 'stef.jobs'],
      selector: '[itemprop="description"], .jobdescription'
    }
  },
  {
    id: 'staffu',
    nom: 'Staff’U',
    url: 'https://staffu.nicoka.com/public/jobs/',
    type: 'html',
    selectors: {
      card:     '.job',
      title:    '.job-title',
      // Pas de métier chez eux — on compose le lieu : région · département · ville
      // (on cible des fragments sans accent pour rester robuste)
      location: 'li[class*="gion"], li[class*="partement"], li[class*="ville"]',
      contract: 'li[class*="contrat"]',
      link:     '.job-title a'
    },
    detail: {
      hosts:    ['staffu.nicoka.com'],
      selector: '.nk-html-content'
    }
  },
  {
    id: 'geodis',
    nom: 'GEODIS',
    type: 'rss',
    // Ils publient un vrai flux RSS, plafonné à 20 offres par flux.
    // On en combine deux (France + Île-de-France) pour ne rien rater
    // près de chez toi ; les doublons sont supprimés automatiquement.
    // "zone" : leur propre classement régional. Indispensable ici car ils
    // écrivent souvent la ville sans code postal ("Gennevilliers"), ce qui
    // rendrait le filtre Île-de-France aveugle.
    // Chaque flux départemental étiquette ses offres, ce qui rend les
    // raccourcis 94 / Île-de-France exacts même sans code postal.
    urls: [
      { u: 'https://injob.geodis.com/handlers/offerRss.ashx?LCID=1036&Rss_JobCountry=12880' },
      { u: 'https://injob.geodis.com/handlers/offerRss.ashx?LCID=1036&Rss_JobRegion=13403',     zone: 'idf' },
      { u: 'https://injob.geodis.com/handlers/offerRss.ashx?LCID=1036&Rss_JobDepartment=14302', zone: 'idf', dept: '75' },
      { u: 'https://injob.geodis.com/handlers/offerRss.ashx?LCID=1036&Rss_JobDepartment=14303', zone: 'idf', dept: '77' },
      { u: 'https://injob.geodis.com/handlers/offerRss.ashx?LCID=1036&Rss_JobDepartment=14307', zone: 'idf', dept: '78' },
      { u: 'https://injob.geodis.com/handlers/offerRss.ashx?LCID=1036&Rss_JobDepartment=14300', zone: 'idf', dept: '91' },
      { u: 'https://injob.geodis.com/handlers/offerRss.ashx?LCID=1036&Rss_JobDepartment=14301', zone: 'idf', dept: '92' },
      { u: 'https://injob.geodis.com/handlers/offerRss.ashx?LCID=1036&Rss_JobDepartment=14304', zone: 'idf', dept: '93' },
      { u: 'https://injob.geodis.com/handlers/offerRss.ashx?LCID=1036&Rss_JobDepartment=14305', zone: 'idf', dept: '94' },
      { u: 'https://injob.geodis.com/handlers/offerRss.ashx?LCID=1036&Rss_JobDepartment=14306', zone: 'idf', dept: '95' }
    ],
    url: 'https://injob.geodis.com/offre-de-emploi/liste-offres.aspx',
    detail: {
      hosts:    ['injob.geodis.com'],
      selector: '#contenu-ficheoffre, .ts-offer-page__content-details'
    }
  }
  // { id:'carrefour', nom:'Carrefour', ... }  ← bloqué par leur anti-robot
];

// ═══════════════════════════════════════════════════════════
//  COLLECTE
// ═══════════════════════════════════════════════════════════

const nettoie = (s) => (s || '').replace(/\s+/g, ' ').trim();

// Chaque site écrit le contrat à sa façon ("CDI", "CDI-Temps plein",
// "Contrat d'Alternance", "Contrat d'apprentissage"…). On ramène tout
// à un vocabulaire commun, sinon les filtres du site ne peuvent pas marcher.
function nettoieContrat(c) {
  const t = (c || '').trim();
  if (!t) return '';
  if (/altern|apprentis/i.test(t))  return 'Alternance';
  if (/stage|internship/i.test(t))  return 'Stage';
  if (/int[ée]rim|tempora/i.test(t))return 'Intérim';
  if (/\bCDD\b/i.test(t))           return 'CDD';
  if (/\bCDI\b/i.test(t))           return 'CDI';
  return t;
}

// Retire les mentions de mixité : (H/F), F/H, (H/F/X), (M/W/D)…
function nettoieTitre(t) {
  return (t || '')
    .replace(/\s*[\(\[]?\b(?:[hfwmxd]\s*\/\s*){1,2}[hfwmxd]\b[\)\]]?/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*[-–—·,]\s*$/, '')
    .trim();
}

// Aiguillage selon le type de source
async function collecteSource(src) {
  return src.type === 'rss' ? collecteRss(src) : collecteHtml(src);
}

// Met toutes les sources au même format
function normalise(src, brutes) {
  return brutes
    .map(o => ({
      id:       o.url || `${src.id}:${nettoie(o.title)}:${nettoie(o.location)}`,
      source:   src.id,
      société:  src.nom,
      titre:    nettoieTitre(nettoie(o.title)),
      lieu:     nettoie(o.location),
      secteur:  nettoie(o.sector),
      contrat:  nettoieContrat(nettoie(o.contract)),
      url:      o.url || src.url,
      zone:     o.zone || '',
      dept:     o.dept || ''
    }))
    .filter(o => o.titre);
}

// ── SOURCES RSS ────────────────────────────────────────────
const _decodeXml = (s) => (s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&');

const _champXml = (bloc, tag) => {
  const m = bloc.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? _decodeXml(m[1]).replace(/\s+/g, ' ').trim() : '';
};

async function collecteRss(src) {
  // Plusieurs flux possibles (ex: France + Île-de-France) → fusionnés et dédoublonnés
  const urls   = src.urls || [src.url];
  const parCle = new Map();   // clé stable → offre (permet de compléter un doublon)

  for (const entree of urls) {
    const u    = typeof entree === 'string' ? entree : entree.u;
    const zone = typeof entree === 'string' ? ''     : (entree.zone || '');
    const dept = typeof entree === 'string' ? ''     : (entree.dept || '');
    const res = await fetch(u, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} sur ${u}`);
    const xml   = await res.text();
    const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];

    for (const it of items) {
      const lien = _champXml(it, 'link');
      if (!lien) continue;
      // Clé stable : l'identifiant de l'offre plutôt que l'URL complète
      const cle = (lien.match(/idOffre=(\d+)/i) || [])[1] || lien;
      if (parCle.has(cle)) {
        // Déjà vue via un autre flux : on complète ses étiquettes
        const dejaVue = parCle.get(cle);
        if (zone && !dejaVue.zone) dejaVue.zone = zone;
        if (dept && !dejaVue.dept) dejaVue.dept = dept;
        continue;
      }

      const cats = [...it.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi)]
        .map(m => _decodeXml(m[1]).replace(/\s+/g, ' ').trim())
        .filter(Boolean);

      parCle.set(cle, {
        // Le titre est préfixé d'une référence type "2026-18011 - " → on l'enlève
        title:    _champXml(it, 'title').replace(/^\s*\d{4}\s*-\s*\d+\s*-\s*/, ''),
        sector:   cats.length > 1 ? cats[0] : '',
        contract: cats.find(c => /CDI|CDD|Altern|Stage|Intérim|Apprentis/i.test(c)) || '',
        location: cats.length ? cats[cats.length - 1] : '',
        url:      lien,
        zone, dept
      });
    }
  }
  return normalise(src, [...parCle.values()]);
}

// Récupère et parse une source HTML
async function collecteHtml(src) {
  const res = await fetch(src.url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'Accept-Language': 'fr-FR,fr;q=0.9'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${src.url}`);

  const offres = [];
  let cur = null;
  const S = src.selectors;

  const rw = new HTMLRewriter()
    .on(S.card, {
      element() {
        cur = { title: '', location: '', sector: '', contract: '', url: '' };
        offres.push(cur);
      }
    });

  // Un champ peut viser plusieurs éléments (ex: ville + département).
  // On insère alors un séparateur entre chaque bloc rencontré.
  const champ = (cle, sel) => {
    if (!sel) return;
    rw.on(`${S.card} ${sel}`, {
      element() { if (cur && cur[cle].trim()) cur[cle] += ' · '; },
      text(t)   { if (cur) cur[cle] += t.text; }
    });
  };
  champ('title',    S.title);
  champ('location', S.location);
  champ('sector',   S.sector);
  champ('contract', S.contract);

  rw.on(`${S.card} ${S.link}`, {
    element(el) {
      const href = el.getAttribute('href');
      if (cur && !cur.url && href) cur.url = href;
    }
  });

  // Déclenche réellement le parsing
  await rw.transform(res).arrayBuffer();

  return normalise(src, offres);
}

// ═══════════════════════════════════════════════════════════
//  DESCRIPTION COMPLÈTE D'UNE OFFRE (page de détail)
// ═══════════════════════════════════════════════════════════

// Sécurité : on n'accepte que les domaines déclarés dans SOURCES.
// Sans ça, le worker deviendrait un proxy ouvert vers n'importe quel site.
function _sourcePourUrl(urlStr) {
  let h;
  try { h = new URL(urlStr).hostname.toLowerCase(); } catch { return null; }
  return SOURCES.find(s =>
    (s.detail?.hosts || []).some(d => h === d || h.endsWith('.' + d))
  ) || null;
}

async function descriptionOffre(urlStr) {
  const src = _sourcePourUrl(urlStr);
  if (!src) throw new Error('Domaine non autorisé');

  const res = await fetch(urlStr, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'Accept-Language': 'fr-FR,fr;q=0.9'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  let texte = '';
  const rw = new HTMLRewriter()
    .on(src.detail.selector, {
      text(t) { texte += t.text; },
      element(el) { if (texte) texte += '\n'; }
    });
  await rw.transform(res).arrayBuffer();

  texte = texte
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n').map(l => l.trim()).join('\n')
    .trim();

  return { source: src.id, description: texte, longueur: texte.length };
}

// ═══════════════════════════════════════════════════════════
//  EMAIL (via Resend)
// ═══════════════════════════════════════════════════════════

async function envoieEmail(env, sujet, html) {
  if (!env.RESEND_API_KEY) {
    console.log('Pas de clé Resend — email ignoré');
    return;
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL || 'Job Feed <onboarding@resend.dev>',
      to: [env.TO_EMAIL],
      subject: sujet,
      html
    })
  });
  if (!r.ok) console.log('Erreur envoi email:', await r.text());
}

function htmlEmail(nouvelles) {
  const lignes = nouvelles.map(o => `
    <tr>
      <td style="padding:12px 14px;border-bottom:1px solid #eee">
        <div style="font-size:15px;font-weight:700;color:#111">${esc(o.titre)}</div>
        <div style="font-size:13px;color:#666;margin-top:3px">
          ${esc(o.société)} &middot; ${esc(o.lieu)}
        </div>
        <div style="font-size:12px;color:#888;margin-top:2px">
          ${esc(o.secteur)}${o.contrat ? ' &middot; ' + esc(o.contrat) : ''}
        </div>
        <a href="${esc(o.url)}" style="display:inline-block;margin-top:8px;background:#111;color:#fff;
           text-decoration:none;border-radius:6px;padding:6px 14px;font-size:13px;font-weight:600">
          Voir l'offre &rarr;
        </a>
      </td>
    </tr>`).join('');

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto">
    <h2 style="font-size:19px;color:#111;margin-bottom:4px">
      ${nouvelles.length} nouvelle${nouvelles.length > 1 ? 's' : ''} offre${nouvelles.length > 1 ? 's' : ''}
    </h2>
    <p style="font-size:13px;color:#666;margin-top:0">Job Feed — veille automatique</p>
    <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:8px">
      ${lignes}
    </table>
  </div>`;
}

const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ═══════════════════════════════════════════════════════════
//  LE CYCLE DE VEILLE
// ═══════════════════════════════════════════════════════════

async function lanceVeille(env, origine = 'auto') {
  const debut = Date.now();
  const maintenant = new Date().toISOString();
  const toutesNouvelles = [];
  const alertes = [];
  const rapport = [];

  for (const src of SOURCES) {
    try {
      const offres = await collecteSource(src);

      // Garde-fou : 0 offre alors qu'on en avait avant = connecteur cassé
      const ancien = await env.FEED_KV.get(`feed:${src.id}`, 'json');
      const avant  = ancien?.offres?.length || 0;
      if (offres.length === 0 && avant > 0) {
        alertes.push(`${src.nom} : 0 offre récupérée (il y en avait ${avant}). Connecteur à vérifier.`);
        await env.FEED_KV.put(`meta:${src.id}`, JSON.stringify({
          ok: false, derniereCollecte: maintenant, erreur: 'Aucune offre trouvée'
        }));
        rapport.push({ source: src.id, ok: false, count: 0 });
        continue;
      }

      // Détection des nouveautés
      const vues = (await env.FEED_KV.get(`seen:${src.id}`, 'json')) || {};
      const premierPassage = Object.keys(vues).length === 0;
      const nouvelles = [];

      for (const o of offres) {
        if (!vues[o.id]) {
          vues[o.id] = maintenant;
          o.vueLe = maintenant;
          if (!premierPassage) nouvelles.push(o);
        } else {
          o.vueLe = vues[o.id];
        }
      }

      // Purge les offres disparues (évite que la mémoire gonfle)
      const idsActuels = new Set(offres.map(o => o.id));
      for (const id of Object.keys(vues)) {
        if (!idsActuels.has(id)) delete vues[id];
      }

      await env.FEED_KV.put(`seen:${src.id}`, JSON.stringify(vues));
      await env.FEED_KV.put(`feed:${src.id}`, JSON.stringify({
        offres, derniereCollecte: maintenant
      }));
      await env.FEED_KV.put(`meta:${src.id}`, JSON.stringify({
        ok: true, derniereCollecte: maintenant, count: offres.length,
        premierPassage
      }));

      toutesNouvelles.push(...nouvelles);
      rapport.push({
        source: src.id, ok: true, count: offres.length,
        nouvelles: nouvelles.length, premierPassage
      });

    } catch (e) {
      alertes.push(`${src.nom} : ${e.message}`);
      await env.FEED_KV.put(`meta:${src.id}`, JSON.stringify({
        ok: false, derniereCollecte: maintenant, erreur: e.message
      }));
      rapport.push({ source: src.id, ok: false, erreur: e.message });
    }
  }

  // Emails
  if (toutesNouvelles.length) {
    await envoieEmail(
      env,
      `${toutesNouvelles.length} nouvelle${toutesNouvelles.length > 1 ? 's' : ''} offre${toutesNouvelles.length > 1 ? 's' : ''} — Job Feed`,
      htmlEmail(toutesNouvelles)
    );
  }
  if (alertes.length) {
    await envoieEmail(
      env,
      '⚠️ Job Feed — un connecteur ne répond plus',
      `<div style="font-family:Arial,sans-serif">
         <h3>Problème détecté</h3>
         <ul>${alertes.map(a => `<li>${esc(a)}</li>`).join('')}</ul>
       </div>`
    );
  }

  // ── Journal : on garde la trace des 40 dernières collectes ──
  const entree = {
    quand:   maintenant,
    origine,                                   // 'auto' (cron) ou 'manuel' (bouton)
    duree:   Date.now() - debut,               // en millisecondes
    sources: rapport,
    nouvelles: toutesNouvelles.length,
    // Les 12 premiers titres détectés — pour vérifier ce qui a déclenché l'email
    titres:  toutesNouvelles.slice(0, 12).map(o => `${o.société} — ${o.titre}`),
    alertes
  };
  try {
    const journal = (await env.FEED_KV.get('historique', 'json')) || [];
    journal.unshift(entree);
    await env.FEED_KV.put('historique', JSON.stringify(journal.slice(0, 40)));
  } catch (e) {
    console.log('Journal non enregistré:', e.message);
  }

  return { maintenant, rapport, nouvelles: toutesNouvelles.length, alertes };
}

// ═══════════════════════════════════════════════════════════
//  POINTS D'ENTRÉE
// ═══════════════════════════════════════════════════════════

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

export default {
  // Déclenché par le cron (2×/jour)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(lanceVeille(env, 'auto'));
  },

  // Appelé par ton site pour lire le feed
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    // Vérification du jeton
    const jeton = url.searchParams.get('token')
               || (request.headers.get('Authorization') || '').replace('Bearer ', '');
    if (env.FEED_TOKEN && jeton !== env.FEED_TOKEN) {
      return Response.json({ erreur: 'Jeton invalide' }, { status: 401, headers: CORS });
    }

    // Forcer une collecte manuellement (bouton "Actualiser")
    if (url.pathname === '/collecte') {
      const r = await lanceVeille(env, 'manuel');
      return Response.json(r, { headers: CORS });
    }

    // Journal des collectes (pour diagnostiquer)
    if (url.pathname === '/historique') {
      const journal = (await env.FEED_KV.get('historique', 'json')) || [];
      return Response.json({ journal }, { headers: CORS });
    }

    // Description complète d'une offre (appelée au clic sur "+ Suivre")
    if (url.pathname === '/offre') {
      const cible = url.searchParams.get('url');
      if (!cible) return Response.json({ erreur: 'Paramètre url manquant' }, { status: 400, headers: CORS });
      try {
        const d = await descriptionOffre(cible);
        return Response.json(d, { headers: CORS });
      } catch (e) {
        return Response.json({ erreur: e.message }, { status: 502, headers: CORS });
      }
    }

    // Vérifier que l'email fonctionne (envoie un exemple)
    if (url.pathname === '/test-email') {
      const exemple = [{
        titre: 'CHEF D\'EQUIPE LOGISTIQUE H/F',
        société: 'STEF', lieu: 'FRANCE, RUNGIS, 94150',
        secteur: 'Opérations logistiques', contrat: 'CDI',
        url: 'https://stef.jobs/fr/postuler/'
      }];
      await envoieEmail(env, '✅ Test — Job Feed fonctionne', htmlEmail(exemple));
      return Response.json({ envoyé: true, vers: env.TO_EMAIL }, { headers: CORS });
    }

    // Lire le feed
    const offres = [];
    const sources = [];
    for (const src of SOURCES) {
      const f = await env.FEED_KV.get(`feed:${src.id}`, 'json');
      const m = await env.FEED_KV.get(`meta:${src.id}`, 'json');
      if (f?.offres) offres.push(...f.offres);
      sources.push({ id: src.id, nom: src.nom, ...(m || { ok: null }) });
    }

    // Les plus récemment vues en premier
    offres.sort((a, b) => (b.vueLe || '').localeCompare(a.vueLe || ''));

    const journal = (await env.FEED_KV.get('historique', 'json')) || [];
    return Response.json({ offres, sources, total: offres.length, journal }, { headers: CORS });
  }
};
