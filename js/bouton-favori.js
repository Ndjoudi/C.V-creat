// ── BOUTON FAVORI « ENVOYER À SUPPLY COPILOT » ─────────────
// Un favori (bookmarklet) à glisser dans la barre du navigateur.
// Sur une offre Indeed ou LinkedIn déjà ouverte, un clic lit l'annonce
// DANS TON NAVIGATEUR (donc sans blocage anti-robot ni connexion requise),
// la copie dans le presse-papiers et ouvre l'app qui la reçoit.
// Format d'échange : voir import-annonce.js (IMPORT_MARQUEUR + base64url).

function _boutonFavoriCode(appUrl) {
  // Code autonome exécuté sur la page Indeed/LinkedIn : aucune dépendance.
  return `(function(){
var APP=${JSON.stringify(appUrl)},MARQ='@@SUPPLY-COPILOT@@';
function nettoie(e){if(!e)return'';var c=e.cloneNode(true);c.querySelectorAll('style,script,button,svg').forEach(function(x){x.remove()});return c.textContent.replace(/\\s+/g,' ').trim();}
function t(sels){for(var i=0;i<sels.length;i++){var v=nettoie(document.querySelector(sels[i]));if(v)return v;}return'';}
function bloc(sels){for(var i=0;i<sels.length;i++){var e=document.querySelector(sels[i]);if(e&&e.innerText&&e.innerText.trim().length>50)return e.innerText.trim();}return'';}
var h=location.hostname,q=new URLSearchParams(location.search),d={};
if(/indeed\\./.test(h)){
d.source='indeed';
d.title=t(['[data-testid="jobsearch-JobInfoHeader-title"]','.jobsearch-JobInfoHeader-title','h1']).replace(/\\s*-\\s*job post$/i,'');
d.company=t(['[data-testid="inlineHeader-companyName"]','[data-company-name="true"]']);
d.location=t(['[data-testid="inlineHeader-companyLocation"]','[data-testid="job-location"]','#jobLocationText']);
var sj=t(['#salaryInfoAndJobType']);
if(sj){var p=sj.split(/\\s+-\\s+/);if(p.length>1){d.salary=p[0];d.contract=p.slice(1).join(' - ');}else if(/€/.test(sj)){d.salary=sj;}else{d.contract=sj;}}
var jk=q.get('vjk')||q.get('jk');
d.url=jk?location.origin+'/viewjob?jk='+jk:location.href;
d.descText=bloc(['#jobDescriptionText','.jobsearch-jobDescriptionText']);
}else if(/linkedin\\./.test(h)){
d.source='linkedin';
var id=q.get('currentJobId')||((location.pathname.match(/\\/jobs\\/view\\/(\\d+)/)||[])[1]);
d.title=t(['.job-details-jobs-unified-top-card__job-title','.jobs-unified-top-card__job-title','.top-card-layout__title','h1']);
d.company=t(['.job-details-jobs-unified-top-card__company-name','.jobs-unified-top-card__company-name','.topcard__org-name-link']);
d.location=t(['.job-details-jobs-unified-top-card__primary-description-container .tvm__text','.topcard__flavor--bullet']);
d.url=id?'https://www.linkedin.com/jobs/view/'+id:location.href;
d.descText=bloc(['#job-details','.jobs-description__content','.jobs-box__html-content','.show-more-less-html__markup']);
}else{alert('Ouvre d\\'abord une offre Indeed ou LinkedIn, puis clique sur ce favori.');return;}
if(!d.descText){alert('Description introuvable : clique d\\'abord sur l\\'offre pour afficher son détail, puis réessaie.');return;}
var oct=new TextEncoder().encode(JSON.stringify(d)),s='';for(var i=0;i<oct.length;i++)s+=String.fromCharCode(oct[i]);
var b64=btoa(s).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
function copie(txt){try{navigator.clipboard.writeText(txt);return;}catch(e){}var ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');}catch(e){}ta.remove();}
copie(MARQ+b64);
if(/^https?:/.test(APP)){window.open(APP+'#import='+b64,'_blank');}
else{alert('✓ Annonce copiée : '+d.title+'\\n\\nDans Supply Copilot, clique sur « Coller ».');}
})();`;
}

function _boutonFavoriLien() {
  // L'app se retrouve elle-même : marche en local comme une fois publiée
  const appUrl = /^https?:/.test(location.protocol)
    ? location.origin + location.pathname
    : '';
  return 'javascript:' + encodeURIComponent(_boutonFavoriCode(appUrl));
}

function renderBoutonFavori() {
  if (document.getElementById('bouton-favori-bloc')) return;
  const ancre = document.getElementById('dash-paste-status');
  if (!ancre) return;

  const bloc = document.createElement('div');
  bloc.id = 'bouton-favori-bloc';
  bloc.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:8px 0 2px;' +
    'padding:8px 12px;background:var(--bg);border:1.5px dashed var(--border);border-radius:10px;font-size:12px;color:var(--ink3)';
  bloc.innerHTML = `
    <span>Indeed ou LinkedIn bloque le lien ?</span>
    <a href="${_boutonFavoriLien()}" draggable="true"
      onclick="event.preventDefault();toast('Glisse ce bouton dans ta barre de favoris, puis clique-le sur une offre Indeed ou LinkedIn');"
      style="display:inline-flex;align-items:center;gap:5px;background:#111;color:#fff;text-decoration:none;
      border-radius:100px;padding:4px 12px;font-weight:700;cursor:grab"
      title="Glisse-moi dans ta barre de favoris">📥 Envoyer à Supply Copilot</a>
    <span>← glisse-le dans ta barre de favoris, puis clique-le sur l'offre ouverte.</span>`;
  ancre.insertAdjacentElement('afterend', bloc);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderBoutonFavori);
} else {
  renderBoutonFavori();
}
