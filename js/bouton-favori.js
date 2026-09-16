// ── BOUTON FAVORI « ENVOYER À SUPPLY COPILOT » ─────────────
// Un favori (bookmarklet) à glisser dans la barre du navigateur.
// Fonctionne aussi en vue « liste à gauche, détail à droite » : le détail
// est parfois dans un cadre interne (iframe), qui est lu lui aussi.
// Sur une offre Indeed ou LinkedIn déjà ouverte, un clic lit l'annonce
// DANS TON NAVIGATEUR (donc sans blocage anti-robot ni connexion requise),
// la copie dans le presse-papiers et ouvre l'app qui la reçoit.
// Format d'échange : voir import-annonce.js (IMPORT_MARQUEUR + base64url).

function _boutonFavoriCode(appUrl) {
  // Code autonome exécuté sur la page Indeed/LinkedIn : aucune dépendance.
  return `(function(){
var APP=${JSON.stringify(appUrl)},MARQ='@@SUPPLY-COPILOT@@';
function nettoie(e){if(!e)return'';var c=e.cloneNode(true);c.querySelectorAll('style,script,button,svg').forEach(function(x){x.remove()});return c.textContent.replace(/\\s+/g,' ').trim();}
function docs(){var L=[document],f=document.querySelectorAll('iframe');
for(var i=0;i<f.length;i++){try{var dd=f[i].contentDocument;if(dd&&dd.body)L.push(dd);}catch(e){}}
return L;}
function t(sels){var D=docs();for(var j=0;j<D.length;j++){for(var i=0;i<sels.length;i++){var v=nettoie(D[j].querySelector(sels[i]));if(v)return v;}}return'';}
function bloc(sels){var D=docs();for(var j=0;j<D.length;j++){for(var i=0;i<sels.length;i++){var e=D[j].querySelector(sels[i]);if(e&&e.innerText&&e.innerText.trim().length>50)return e.innerText.trim();}}return'';}
function blocSecours(){var D=docs(),m='';
for(var j=0;j<D.length;j++){var c=D[j].querySelectorAll('[id*="escription"],[class*="escription"],[id*="job-details"],[class*="job-details"],[class*="jobDescription"]');
for(var i=0;i<c.length;i++){var t=c[i].innerText?c[i].innerText.trim():'';if(t.length>m.length&&t.length<40000)m=t;}}
return m.length>200?m:'';}
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
if(!d.descText)d.descText=blocSecours();
if(!d.descText){alert('Description introuvable sur cette page.\\n\\nLu : '+(d.title||'(pas de titre)')+' / '+(d.company||'(pas d\\'entreprise)')+'\\n\\nOuvre l\\'offre en plein écran (pas la liste de résultats), attends qu\\'elle s\\'affiche, puis réessaie.');return;}
var oct=new TextEncoder().encode(JSON.stringify(d)),s='';for(var i=0;i<oct.length;i++)s+=String.fromCharCode(oct[i]);
var b64=btoa(s).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
function copie(txt){try{navigator.clipboard.writeText(txt);return;}catch(e){}var ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');}catch(e){}ta.remove();}
var fen=null;
if(/^https?:/.test(APP)){var L=440,H=300,x=Math.max(0,Math.round((screen.width-L)/2)),y=Math.max(0,Math.round((screen.height-H)/2));
fen=window.open(APP+'#import='+b64+'&auto=1','supplycopilot_import','popup=yes,width='+L+',height='+H+',left='+x+',top='+y);}
if(!fen){copie(MARQ+b64);alert('✓ Annonce copiée : '+d.title+'\\n\\nOuvre Supply Copilot et clique sur « Coller ».');}
})();`;
}

function _boutonFavoriLien() {
  // L'app se retrouve elle-même : marche en local comme une fois publiée
  const appUrl = /^https?:/.test(location.protocol)
    ? location.origin + location.pathname
    : '';
  return 'javascript:' + encodeURIComponent(_boutonFavoriCode(appUrl));
}

// Placé dans la barre latérale, sous les clés API : on l'installe une fois,
// il n'a pas à encombrer le tableau de bord.
function renderBoutonFavori() {
  if (document.getElementById('bouton-favori-bloc')) return;
  const ancre = document.getElementById('api-keys-panel');
  if (!ancre) return;

  const bloc = document.createElement('div');
  bloc.id = 'bouton-favori-bloc';
  bloc.style.cssText = 'margin-top:10px;padding:10px;background:var(--bg);border-radius:10px;border:1px solid var(--border)';
  bloc.innerHTML = `
    <div style="font-size:10.5px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">📥 Import d'annonces</div>
    <a href="${_boutonFavoriLien()}" draggable="true"
      onclick="event.preventDefault();toast('Glisse ce bouton dans ta barre de favoris, puis clique-le sur une offre Indeed ou LinkedIn');"
      style="display:flex;align-items:center;justify-content:center;gap:5px;background:#111;color:#fff;text-decoration:none;
      border-radius:8px;padding:6px 10px;font-size:11.5px;font-weight:700;cursor:grab"
      title="Glisse-moi dans ta barre de favoris">Envoyer à Supply Copilot</a>
    <div style="font-size:10.5px;color:var(--ink3);margin-top:6px;line-height:1.4">
      À glisser une fois dans ta barre de favoris, puis à cliquer sur une offre Indeed ou LinkedIn.
    </div>`;
  ancre.insertAdjacentElement('afterend', bloc);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderBoutonFavori);
} else {
  renderBoutonFavori();
}
