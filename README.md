# Supply Copilot

Application web personnelle de recherche d'emploi en supply chain : profil, CV,
analyse d'offres par IA, suivi des candidatures et veille automatique d'offres.

Site statique (HTML + CSS + JavaScript, sans framework). Les données restent
dans le navigateur (`localStorage`). Une partie tourne sur Cloudflare (le Feed).

**Avant toute modification, lire les sections « Règles communes » et
« CV lisible par les ATS ».** Elles existent parce que des écarts entre les
pages et un CV mal lu par les ATS ont déjà coûté du temps et des candidatures.

---

## Sommaire

1. [Lancer le site](#1-lancer-le-site)
2. [Structure des fichiers](#2-structure-des-fichiers)
3. [Règles communes](#3-règles-communes)
4. [CV lisible par les ATS](#4-cv-lisible-par-les-ats)
5. [Tester le CV avant de livrer](#5-tester-le-cv-avant-de-livrer)
6. [Le Feed (veille d'offres)](#6-le-feed-veille-doffres)
7. [Import d'annonces Indeed / LinkedIn](#7-import-dannonces-indeed--linkedin)
8. [Décisions prises](#8-décisions-prises)
9. [Chantiers ouverts](#9-chantiers-ouverts)

---

## 1. Lancer le site

```bash
npx serve . -l 4173
```

Puis ouvrir http://localhost:4173.

Ouvrir `index.html` directement (`file://`) fonctionne en grande partie, mais
le bouton favori ne peut pas ouvrir l'app dans ce cas (voir section 7).

**Publication (GitHub)** : envoyer `index.html`, `css/`, `js/` (y compris
`js/vendor/`) et `tools/`. Le dossier `feed-worker/` n'est pas nécessaire au
site : il est déployé séparément sur Cloudflare.

---

## 2. Structure des fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Toutes les pages (écrans `sc-*`) et l'ordre de chargement des scripts |
| `css/base.css` | Variables de couleur, typographie, `box-sizing` global |
| `css/components.css` | Composants partagés : boutons, cartes, champs, Feed |
| `css/cv.css` | Le CV à l'écran **et** à l'impression PDF |
| `js/app.js` | État global (`P` = profil), outils `ls` / `ss` / `esc` / `toast`, tableau de bord, navigation `goTo` |
| `js/api.js` | Appels IA (Gemini puis Groq en secours) |
| `js/profile.js` | Écran « Mon Profil » |
| `js/import-cv.js` | Import d'un CV existant dans le profil |
| `js/cv.js` | **Rendu du CV (`renderCV`) et PDF (`printCV`)** — le seul moteur de CV |
| `js/analyze.js` | Analyse d'une offre |
| `js/tracker.js` | Candidatures, récupération d'annonces, **fenêtre d'annonce** (split view) |
| `js/lettre-reco.js` | Lettre de recommandation ajoutée en page 2 du PDF |
| `js/feed.js` | Écran « Feed » |
| `js/navigation.js` | Bouton retour du navigateur dans l'app |
| `js/import-annonce.js` | Réception d'une annonce envoyée par le bouton favori |
| `js/bouton-favori.js` | Le bouton favori « Envoyer à Supply Copilot » |
| `js/history.js`, `js/modal.js` | Historique d'analyses, fenêtres modales |
| `js/vendor/` | pdf.js embarqué (lecture des PDF, sans dépendance externe) |
| `tools/test-ats.html` | Page de test du CV (section 5) — ne fait pas partie de l'app |
| `feed-worker/` | Worker Cloudflare du Feed (section 6) |

Données du navigateur (`localStorage`) : `sc_profile` (profil), `sc_cands`
(candidatures), `sc_cv_target` (poste ciblé), `sc_feed_*` (état du Feed), plus
les clés IA (`sc_key`, `sc_gemini_key`…).

---

## 3. Règles communes

### 3.1 Toujours changer la version d'un fichier modifié

Chaque fichier CSS et JS est chargé avec un numéro : `js/cv.js?v=82`.
**Après toute modification, augmenter ce numéro dans `index.html`.**
Sinon le navigateur garde l'ancienne version en cache — même après
`Cmd + Shift + R` — et la correction semble ne pas marcher.

### 3.2 Vérifier la syntaxe avant de livrer

Une erreur de syntaxe bloque tout le fichier sans message visible :

```bash
node -e "['js/app.js','js/cv.js','js/tracker.js'].forEach(f=>{new Function(require('fs').readFileSync(f,'utf8'));console.log('OK',f)})"
```

### 3.3 Un seul moteur par fonctionnalité

- **Un seul rendu de CV** : `renderCV()` dans `js/cv.js`. La page « Mon CV »
  et la fenêtre d'annonce affichent ce même rendu (la fenêtre en fait une copie,
  `#cv-doc-split`). Ne jamais écrire un second rendu de CV ailleurs.
- **Un seul PDF** : `printCV()`. Tous les boutons PDF passent par
  `loadCVForCand(id, true)`, qui appelle `printCV()` et fait passer le statut
  « À traiter » à « Envoyé ».
- Avant d'ajouter une fonction, chercher si elle existe déjà (`grep`).

### 3.4 Style : réutiliser, ne pas réinventer

- **Boutons** : classes existantes `.btn` + `.btn-p` (principal) ou `.btn-g`
  (secondaire), `.btn-icon`, `.btn-icon-sm`, `.btn-del`. Pas de nouveau bouton
  stylé à la main.
- **Couleurs** : variables de `css/base.css` — `--ink`, `--ink2`, `--ink3`
  (textes), `--border`, `--border2`, `--bg`, `--card`, `--teal`, `--teal-d`,
  `--teal-bg`, `--teal-border`, `--red`, `--red-bg`, `--red-border`.
  Pas de nouvelle couleur écrite en dur (`#6366f1`…).
- **Pas de nouveau `style="…"` dans le code.** Créer ou réutiliser une classe
  dans le fichier CSS concerné. (Il en reste beaucoup d'anciens : voir section 9.)

### 3.5 Commentaires

Expliquer **pourquoi**, pas ce que fait la ligne — surtout quand une règle
corrige un bug constaté (exemple : les règles ATS de `css/cv.css`).

---

## 4. CV lisible par les ATS

Un ATS (logiciel de recrutement) ne voit pas le CV : il **extrait le texte du
PDF**, sans couleurs ni mise en page. Tout ce qui suit a été vérifié en
extrayant le texte des PDF générés par l'app.

### 4.1 Règles obligatoires

| Règle | Pourquoi (défaut constaté) |
|---|---|
| Une seule colonne | En deux colonnes, les compétences arrivaient en fin de document, détachées de leur titre |
| **Poste visé en première ligne**, puis nom, puis coordonnées (choix de l'utilisateur, 14/09/2026) | Risque connu : certains ATS prennent la première ligne pour le nom. Une inversion en CSS ne l'évite pas — Chrome écrit le texte du PDF dans l'ordre affiché (vérifié avec pdf.js). Pour revenir au nom en tête : échanger les deux lignes dans `renderCV()` (`js/cv.js`) |
| Coordonnées **écrites en texte**, LinkedIn compris | Une icône seule n'est pas lue : le LinkedIn disparaissait |
| Séparateurs **écrits dans le texte** (` \| `) | Un séparateur ajouté par le CSS (`::before`) n'existe pas pour l'ATS : l'e-mail était collé au téléphone |
| Intitulé du poste **seul sur sa ligne** | Collé au contrat et au rattachement, il était lu « Poste CDI Rattaché au… » |
| Pas d'espacement de lettres (`letter-spacing`) sur les libellés | L'ATS lisait « D O M A I N E S » |
| Pas de `display:flex` sur des lignes de texte | En flex, les espaces entre deux morceaux de texte disparaissent (« Fin de cursusMaster ») |
| Pas d'icônes ni de symboles (✉ ☎ ▸ ×) | Ils polluent le texte extrait |
| Aucun bouton ni élément d'interface dans le PDF | Les `<button>` sont retirés par `printCV()` ; tout autre élément cliquable doit l'être aussi |
| **Jamais de texte caché** (couleur transparente, blanche, taille minuscule) | Les ATS le détectent comme une tentative de tromperie ; risque d'écartement du candidat |
| Titres de section standard | Profil, Expériences professionnelles, Formation, Compétences, Langues |

### 4.2 Où se trouvent ces règles

- Rendu : `renderCV()` et `buildProfileHighlight()` dans `js/cv.js`.
- Style : bloc « MODÈLE UNIQUE — RÈGLES DE LISIBILITÉ PAR LES ATS » à la fin de
  `css/cv.css`, chaque règle commentée avec le défaut qu'elle corrige.

---

## 5. Tester le CV avant de livrer

**Obligatoire après toute modification de `js/cv.js`, `css/cv.css` ou
`js/lettre-reco.js`.**

`tools/test-ats.html` affiche le CV d'un profil fictif complet avec le **vrai
code** du site et la **vraie mise en page d'impression**.

1. Générer le PDF :

   ```bash
   cd tools && "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --no-pdf-header-footer --virtual-time-budget=5000 --print-to-pdf="$PWD/_resultat-ats.pdf" "file://$PWD/test-ats.html"
   ```

2. Ouvrir `tools/_resultat-ats.pdf`, tout sélectionner (`Cmd + A`), copier et
   coller dans un éditeur de texte brut : **c'est ce que lit un ATS.**

3. Vérifier :
   - [ ] La première ligne est le nom
   - [ ] Le LinkedIn apparaît en toutes lettres
   - [ ] E-mail, téléphone, ville et LinkedIn sont séparés par ` | `
   - [ ] Chaque intitulé de poste est seul sur sa ligne
   - [ ] Les dates d'expérience sont complètes
   - [ ] Les libellés de compétences sont lisibles (« Domaines : … »)
   - [ ] Aucun symbole parasite (✉ ☎ ▸ ×)
   - [ ] Aucune catégorie de compétences vide
   - [ ] La lettre de recommandation apparaît en page 2, en texte lisible

Le fichier `_resultat-ats.pdf` est ignoré par Git.

---

## 6. Le Feed (veille d'offres)

Le worker Cloudflare `feed-worker/` collecte les offres de plusieurs
entreprises **deux fois par jour** (7 h et 13 h UTC, soit 8 h / 14 h en hiver
et 9 h / 15 h en été à Paris), détecte les nouvelles et envoie un e-mail.

- Adresse : `https://job-feed.djoudi-feed.workers.dev`
- Sources : tableau `SOURCES` dans `feed-worker/src/index.js`
  (STEF et Staff'U en HTML, GEODIS en flux RSS)
- Ajouter une entreprise : ajouter une fiche dans `SOURCES`, puis déployer :

  ```bash
  cd feed-worker && npx wrangler deploy
  ```

- Jeton de lecture : dans `js/feed.js` (visible, inévitable pour un site
  statique) et dans `feed-worker/.feed-token.txt` (ignoré par Git).
- Historique des collectes : bouton « Historique » de l'écran Feed.

---

## 7. Import d'annonces Indeed / LinkedIn

**Coller le lien d'une annonce ne fonctionne pas de façon fiable**, et ce n'est
pas corrigeable côté serveur :

- **Indeed** : plus d'API de lecture depuis 2023, protection anti-robot
  Cloudflare, et la fiche seule d'une offre exige d'être connecté.
- **LinkedIn** : limite fortement les requêtes venant de Cloudflare
  (environ 1 sur 6 passe) ; l'app réessaie quelques fois puis abandonne.
- **Carrefour** : bloqué en permanence (défi anti-robot).

**Solution : le bouton favori « Envoyer à Supply Copilot »** (barre latérale,
sous les clés API). Glissé une fois dans la barre de favoris, il lit l'offre
**dans le navigateur de l'utilisateur**, ouvre une petite fenêtre de l'app qui
enregistre la candidature puis se referme. L'onglet principal se met à jour et
lance l'analyse IA.

Il ne peut pas enregistrer sans ouvrir de fenêtre : Indeed et LinkedIn
interdisent à leurs pages d'envoyer des données vers un autre site (règles CSP
vérifiées). Le bouton doit être installé **depuis le site publié** : il retient
l'adresse du site où il a été pris.

Fichiers : `js/bouton-favori.js` (le favori), `js/import-annonce.js` (la réception).

---

## 8. Décisions prises

| Date | Décision | Raison |
|---|---|---|
| 2026-09-14 | **Un seul modèle de CV**, conçu pour les ATS (Classique et Moderne supprimés) | Le Moderne, en deux colonnes, cassait la lecture ; un seul rendu à maintenir |
| 2026-09-14 | **Photo conservée** sur le CV | Choix personnel ; elle ne perturbe pas l'extraction du texte |
| 2026-09-14 | **PDF uniquement** (pas d'export Word) | Un PDF texte bien construit passe la grande majorité des ATS |
| 2026-09-14 | **Lettre de recommandation en texte visible** en page 2 | La version image + texte caché risquait d'être signalée comme tromperie |
| 2026-09-14 | Import Indeed/LinkedIn par **bouton favori** | Toute lecture côté serveur est bloquée (section 7) |

---

## 9. Chantiers ouverts

- ~~Outils réservés à la fenêtre d'annonce~~ — **fait** : les outils du CV
  (barre « Mettre en avant », mode édition, masquer / réafficher un poste,
  ajouter / retirer / réordonner des missions, supprimer une compétence) sont
  écrits une seule fois dans `js/tracker.js` (bloc « OUTILS DU CV — COMMUNS »)
  et servent aux deux vues : `toggleCVEditMode('cv-doc')` pour « Mon CV »,
  `toggleCVEditMode('cv-doc-split')` pour l'annonce. Tout est enregistré dans
  le profil ; il n'y a plus de modifications propres à une offre
  (`cv_overrides` n'est plus lu). Un poste masqué porte `cvMasque: true` :
  absent du CV, conservé dans « Mon Profil ».
- **Styles écrits en dur** : environ 800 `style="…"` (surtout dans
  `js/tracker.js` et `index.html`) et des couleurs répétées au lieu des
  variables. À convertir progressivement en classes en touchant chaque écran
  (règle 3.4).
- **Sélecteurs LinkedIn du bouton favori** non vérifiés sur une session connectée.
