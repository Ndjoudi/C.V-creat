# README — WordCode

> **Document de référence unique.** Toute décision de code doit s'y conformer.
> Si une information manque ici, elle doit y être ajoutée avant d'être codée.

---

## SOMMAIRE

1. [Principe](#1-principe)
2. [Les six sections](#2-les-six-sections)
3. [Sources de vocabulaire](#3-sources-de-vocabulaire)
4. [Boucle d'apprentissage](#4-boucle-dapprentissage)
5. [Moteur de répétition espacée](#5-moteur-de-répétition-espacée)
6. [Schémas de données](#6-schémas-de-données)
7. [Stockage](#7-stockage)
8. [Contenu enfichable](#8-contenu-enfichable)
9. [Le générateur hors ligne](#9-le-générateur-hors-ligne)
10. [Architecture technique](#10-architecture-technique)
11. [Design tokens](#11-design-tokens)
12. [Inventaire des composants](#12-inventaire-des-composants)
13. [Écrans](#13-écrans)
14. [Services](#14-services)
15. [Spécifications d'interaction](#15-spécifications-dinteraction)
16. [API externe](#16-api-externe)
17. [Règles anti-duplication](#17-règles-anti-duplication)
18. [Roadmap](#18-roadmap)
19. [Hors périmètre v1](#19-hors-périmètre-v1)
20. [Points ouverts](#20-points-ouverts)

---

## 1. Principe

Application web d'apprentissage du vocabulaire anglais pour un francophone.

L'écran principal est un **tableau de bord découpé en neuf sections**. Il n'y a
plus de session guidée : l'utilisateur entre où il veut, quand il veut. Chaque
section fait **une seule chose**.

| # | Section | Rôle |
|---|---|---|
| 01 | **Traduire** | capturer un mot rencontré dans la vraie vie |
| 02 | **Découverte** | trier : *je connais* / *je ne connais pas* |
| 03 | **Quizz** | vérifier : retrouver le mot à partir de sa définition |
| 04 | **Apprendre** | travailler les mots inconnus ou ratés |
| 05 | **La grille** | codeword sur les mots validés |
| 06 | **Mots croisés** | même règle, mots différents |
| 07 | **Histoire du jour** | lecture d'une page en vocabulaire connu |
| 08 | **Écrire** | dictée, traduction, rédaction libre |
| 09 | **Vidéo** | une conférence TED, phrase par phrase |

**Les jeux ne sont pas le cours, ils sont l'examen.** Un codeword ne transmet
aucun sens : il fait *retrouver* un mot déjà connu. Les sections 05, 06 et 07
ne servent qu'à réviser. Aucun mot nouveau n'y entre jamais.

**Le quizz est la seule porte.** Un mot n'entre dans les trois sections de
révision qu'après l'avoir franchi. Se déclarer sûr de soi en découverte ne
suffit pas : c'est une intention, pas une preuve.

### Les trois usages sont complémentaires

| Section | Ce qu'elle travaille |
|---|---|
| **Grille** (codeword) | orthographe, reconnaissance, association chiffre → lettre |
| **Mots croisés** | sens → mot : production réelle à partir d'un indice |
| **Histoire** | reconnaissance en contexte, à la vitesse de la lecture |

Un mot n'est pas su tant qu'il n'a pas été rencontré dans les trois. Le
codeword le fait écrire, les mots croisés le font produire, l'histoire le fait
reconnaître sans support.

### Contraintes produit

- **100% hors ligne** sauf deux appels réseau : la traduction (§01) et le
  secours de génération d'histoire (§06)
- **Aucune génération de grille à l'exécution** : toutes les grilles sont
  pré-générées et vérifiées (voir §9)
- **Mono-appareil**, localStorage, avec export/import manuel obligatoire
- **Publié sur GitHub Pages** — pas de build step, pas de serveur
- **Component-driven** — chaque élément d'interface existe en un seul exemplaire
- **Mobile portrait** en cible principale

---

## 2. Les neuf sections

### 01 — Traduire / Ajouter un mot

Trois blocs sur un même écran :

1. **Champ de saisie libre.** L'utilisateur tape un mot ou une phrase rencontrés
   en lecture. L'app traduit **la phrase entière** (§16), l'utilisateur
   sélectionne ce qu'il garde.
2. **Confirmation en un tap** avant enregistrement.
3. **Liste des mots ajoutés**, en deux groupes : *en attente de découverte* et
   *déjà découverts*. Sans cette distinction, on ne sait pas si un ajout a
   servi à quelque chose.

Un **micro** permet de dicter la phrase plutôt que de la taper (§15.8). La voix
ajoute au champ : on peut dicter une phrase, puis une autre.

Un mot ajouté ici entre dans la file de **Découverte** (§02), jamais directement
dans les jeux.

### 02 — Découverte

Un mot par écran : forme écrite, phrase d'exemple traduite, et la
prononciation **à la demande** — le son ne part jamais tout seul, une voix
qui se déclenche sans prévenir rend l'app inutilisable en public. Deux boutons,
rien d'autre.

```
                    ┌─────────────────────┐
                    │       reluctant      │
                    │      /rɪˈlʌk.tənt/   │
                    │                      │
                    │  She was reluctant   │
                    │     to speak.        │
                    └─────────────────────┘
        [ Je connais ]            [ Je ne connais pas ]
```

| Réponse | Effet |
|---|---|
| **Je connais** | le mot part au **quizz** (§03). Il n'est pas encore « connu » : il doit être vérifié. |
| **Je ne connais pas** | le mot passe en `attente`. Il réapparaît **2 jours plus tard** dans *Apprendre* (§04). |

La file se remplit dans cet ordre : mots ajoutés en §01, puis mots du palier
courant **dans l'ordre du fichier**.

Cet ordre n'est pas celui de la fréquence, et c'est délibéré : le générateur
groupe les mots d'un palier par blocs de cinq, et chaque bloc devient une
partie (§9). Servir la découverte dans le même ordre fait qu'au bout de cinq
mots triés, une grille exactement devient jouable. Un tri par fréquence
disperserait les mots entre les blocs et laisserait §04 et §05 verrouillées
pendant des dizaines de mots — alors que les 50 mots d'un palier sont de toute
façon de même rang de fréquence.

**Aucun exercice ici.** La découverte trie, elle n'évalue pas.

### 03 — Quizz

La **porte unique** vers les sections 05, 06 et 07.

L'énoncé n'est pas la traduction française du mot, c'est sa **définition
périphrasée en anglais** — exactement celle qui servira d'indice dans les
grilles (§6.1). L'utilisateur choisit le mot parmi quatre.

```
        You drink it when you are thirsty
   [ WATER ]  [ WANT ]  [ WAIT ]  [ WARM ]
```

**Pourquoi la définition et pas la traduction.** Reconnaître *eau* → WATER ne
teste que l'appariement de deux étiquettes, dans les deux sens et sans
compréhension. Lire une phrase anglaise et en retrouver le mot, c'est
comprendre de l'anglais — et c'est précisément ce que la grille demandera.

**Chaque mot de l'énoncé est tappable** (§15.4). Un mot inconnu rencontré dans
une définition part dans la file de découverte : l'énoncé devient lui-même une
source de vocabulaire.

| Verdict | Effet |
|---|---|
| **Juste** | boîte 3, statut `connu`. Le mot entre dans §05, §06 et §07. |
| **Faux** | boîte 1, statut `attente`. Le mot part en *Apprendre* dans 2 jours. |

Un mot sans définition ne peut pas être quizzé : il est promu directement,
faute de moyen de le vérifier.

### 04 — Apprendre

Reçoit **deux flux** : les mots marqués *je ne connais pas* en découverte, et
les mots ratés au quizz. Dans les deux cas **après le délai de 2 jours**. Ce
délai est volontaire : revoir un mot deux jours après l'avoir rencontré est ce
qui le fait entrer en mémoire, le revoir immédiatement ne fait que le
reconnaître.

Deux exercices, dans cet ordre :

| Exercice | Forme | Ce qu'il teste |
|---|---|---|
| **QUIZ** | QCM 4 options, distracteurs proches graphiquement (*MENU / MEAL / MEET / MELT*) | reconnaissance |
| **Écriture** | FR → EN à taper, sans aide | production |

Réussite des deux → le mot monte d'une boîte Leitner (§5). Échec de l'un des
deux → retour boîte 1, revu dans 2 jours.

Un mot qui atteint la boîte 3 **retourne au quizz**, il ne file pas dans les
jeux. Le quizz reste la seule porte : ce qu'on a appris ici doit encore être
prouvé là-bas.

L'écran donne aussi accès au **suivi** en trois groupes — *en attente*,
*en cours*, *appris*. « En attente » n'est pas une file morte : c'est le délai
de deux jours qui court, et le dire évite de croire qu'un mot a été oublié.

### 05 — La grille (codeword)

Grille numérotée où chaque chiffre représente une lettre. Elle est construite
à partir des seuls mots **validés au quizz** (§03).

**La grille démarre complètement vide.** Aucune lettre n'est donnée d'avance :
pas de mot-amorce, pas de lettres offertes. Le point d'entrée n'est pas
logique, il est **lexical** — l'utilisateur reconnaît un mot à son indice, le
tape, et le mapping chiffre → lettre se propage dans toute la grille.

C'est ce qui rend le jeu utile : il ne récompense pas la déduction, il
récompense le fait de connaître le mot.

**La phrase cachée reste.** Elle est écrite en chiffres sous la grille et se
révèle au fur et à mesure. C'est la récompense de fin de partie : une expression
idiomatique avec sa traduction et son contexte.

**Indices : trois lettres par partie, pas une de plus** (§15.7). Un bouton
révèle la lettre de la case active. Le budget est volontairement petit — trois
lettres sur cinq mots aident à démarrer, jamais à finir. Le mot aidé **ne monte
pas de boîte** : c'est le signal de maîtrise de la §5.

### 06 — Mots croisés

Grille 2D classique, indice horizontal / vertical, même règle de constitution
que §05 : uniquement des mots validés au quizz, grille entièrement vide au départ.

**Contrainte propre à cette section : jamais les mêmes mots que la grille.** Un
mot servi par le codeword est marqué comme tel et devient indisponible pour les
mots croisés, et réciproquement. Quand le vivier est épuisé pour l'un des deux
jeux, les marques de ce jeu sont remises à zéro et le cycle recommence.

Différence de fond avec le codeword : ici, **l'indice est le seul point
d'entrée**. Il n'y a pas de chiffres pour aider. C'est le seul endroit de l'app
où le sens doit produire le mot sans aucun support formel.

### 07 — Histoire du jour

Une histoire par jour, de la longueur d'une page — **250 à 350 mots** demandés
au modèle, acceptés à partir de **220** (§16).

Elle est composée **à partir des mots découverts et appris** : au moins 95% de
son vocabulaire doit être déjà connu de l'utilisateur. C'est le seuil au-delà
duquel la lecture reste fluide et les mots inconnus se devinent au contexte.

Deux formes possibles, indiquées dans le contenu :

| Forme | Quand |
|---|---|
| **Continuation** | l'histoire de la veille avait une suite : on la reprend |
| **Nouveauté** | début d'un nouvel arc, ou aucun arc en cours |

Chaque mot du texte est tappable : un tap affiche la traduction (§15.4). Les
mots connus qui apparaissent dans l'histoire comptent comme une révision et
font monter leur boîte Leitner en cas de lecture sans consultation de la
traduction.

**Origine du texte** : un stock rédigé hors ligne dans `/content/histoires/`, et
en secours la génération par l'API (§16) quand le stock ne propose plus rien
d'assez adapté au vocabulaire courant.

---

### 08 — Écrire

La seule section où l'utilisateur **produit** une phrase entière sans modèle
sous les yeux. Trois modes, un seul corpus.

**Dictée.** L'application prononce une phrase, l'utilisateur l'écrit.

L'audio est un **enregistrement humain**, jamais une synthèse vocale : une voix
de synthèse ne reproduit ni les liaisons, ni le rythme, ni les élisions, c'est-
à-dire précisément ce que l'oreille doit apprendre. Les phrases viennent du
corpus Tatoeba, filtrées pour n'employer que du vocabulaire déjà vu (§6.7).

C'est aussi le seul exercice dont la correction est **incontestable** : il n'y a
qu'une bonne réponse, c'est ce qui a été prononcé.

**Traduction.** Le français est affiché, l'utilisateur écrit l'anglais. **Aucun
mot n'est fourni** : la phrase se compose entièrement.

Limite mesurée sur le corpus : 79% des phrases n'ont qu'une seule traduction
enregistrée. Une formulation correcte mais différente sera donc parfois
refusée. L'écran affiche **toujours** la phrase attendue, juste ou faux — voir
la forme visée vaut mieux qu'un verdict sec.

**Rédaction libre.** Une consigne, cinq mots imposés tirés de ceux que
l'utilisateur a validés au quizz, un texte libre.

Deux contrôles de nature différente :

| Contrôle | Où | Quand |
|---|---|---|
| Les mots imposés sont-ils employés ? | en local, à chaque frappe | toujours, même hors ligne |
| La langue est-elle correcte ? | API (§16) | à la demande |

L'exercice garde donc du sens sans réseau. **La rédaction n'entre pas dans le
Leitner** : une boîte ne sait pas représenter « compréhensible mais maladroit ».

### Ce que l'écriture fait progresser

Une dictée ou une traduction réussie fait monter d'une boîte les mots **connus**
que la phrase contient : les avoir écrits sans modèle prouve plus que de les
avoir reconnus. Un échec ne fait rien redescendre — en dictée, se tromper vient
souvent de l'oreille, pas du vocabulaire.

---

### 09 — Vidéo

Une conférence TED se joue **une phrase, puis s'arrête**. Deux jeux sur cette
phrase, au choix à tout moment :

| Jeu | Composant | Ce qu'il travaille |
|---|---|---|
| **Remettre dans l'ordre** | `WordOrder` | la structure de la phrase |
| **Écrire la phrase** | `InputAnswer` | l'orthographe et l'oreille |

**Pas de micro ici.** L'utilisateur reconstruit, il ne parle pas.

### Le quizz de fin de conférence

Une fois la conférence **regardée en entier**, un quizz de huit questions
s'ouvre. Il est composé **hors ligne**, à partir de la seule transcription déjà
en mémoire : aucun appel réseau, aucun jeton Gemini — la génération d'histoires
montre assez ce que coûte une dépendance au quota.

| Forme | Ce qu'elle demande | Ce qu'elle travaille |
|---|---|---|
| **trou** | un mot de contenu est masqué dans une phrase entendue | le vocabulaire en contexte |
| **suite** | laquelle de ces quatre phrases suit celle-ci ? | le fil du discours |

Les deux formes alternent : huit fois le même exercice lasse. Les mauvaises
réponses sont **tirées de la conférence elle-même** — un leurre venu d'ailleurs
se repère sans réfléchir. Les mots-outils (`the`, `with`, `about`…) ne sont
jamais masqués : les cacher ne teste rien.

**Le déblocage ne dépend pas des exercices.** Les phrases s'arrêtent une à une,
on ne peut donc pas « voir la conférence » en les enchaînant : un bouton
*Regarder la conférence en entier* lit le flux sans borne. Le lecteur rapporte
sa position, et la conférence est notée vue au-delà de **97 %** de sa durée —
pas 100 %, parce que le générique de fin et les applaudissements ne sont pas du
contenu. La date est conservée dans `progression.videos_vues`.

Une conférence de moins de 12 phrases n'a pas de quizz : il n'y aurait ni assez
de leurres, ni assez de matière.

### Deux sources vidéo, et la seule dépendance du projet

Environ **une conférence sur trois** a son mp4 verrouillé chez TED : le fichier
est bien listé dans la page, mais le CDN répond `403 AccessDenied`. Ce n'est pas
une protection anti-hotlink — un `Referer` de ted.com n'y change rien — et
aucune autre piste mp4 n'est proposée. Le **flux HLS**, lui, répond `200` avec
`access-control-allow-origin: *` pour toutes les conférences mesurées.

Le serveur renvoie donc les deux : `video` (le mp4, **seulement s'il répond**,
vérifié par une requête `HEAD`) et `hls`, **débarrassé de son générique**. Le
lecteur prend **le flux**, et le mp4 seulement à défaut.

**Le générique décalait tout.** `hlsUrl` porte `?intro_master_id=…`, qui ajoute
3,5 s d'habillage TED en tête de flux (mesuré : kelly 855,18 s avec contre
851,68 sans ; yat_siu 647,40 contre 643,89). Les horodatages du transcript, eux,
sont écrits **sans** ce générique — la première phrase commence à 0,84 s, ce qui
serait impossible si le flux débutait par 3,5 s d'habillage. La vidéo courait
donc 3,5 s en retard sur la phrase affichée. On retire le paramètre.

**Preuve par l'image.** Les flux HLS sont servis avec CORS ouvert, on peut donc
lire leurs images (pas celles du mp4). Mesuré sur kelly_mcgonigal : à 0,84 s,
instant où commence la première phrase, le flux avec générique affiche
l'écran-titre TED (luminosité moyenne 232) et le flux sans générique déjà la
scène (43). Et « sans » à *t* correspond à « avec » à *t* + 3,5 s : écart moyen
de 3 à 6 sur 255, contre 16 à 190 au même instant. Le mp4 ayant la durée du flux
avec générique (855,2 s) et démarrant sur le même écran-titre, **il est décalé
lui aussi** : c'est pourquoi le lecteur préfère le flux dès qu'il existe.

> **Piège à ne pas refaire.** J'avais d'abord conclu que tout était aligné parce
> que le mp4 et le flux faisaient la même durée. Deux durées égales ne disent
> rien de l'endroit où tombent les mots. Pour juger d'un alignement, regarder ce
> qui est à l'écran à l'instant de la **première phrase**, jamais les durées.

Deux filets de sécurité, parce qu'un mp4 vivant aujourd'hui peut être verrouillé
demain :

- **Le flux passe avant le mp4.** Dès qu'une conférence a un flux, un mp4
  verrouillé (403) ou décalé (générique) ne peut plus gêner.
- **Les conférences enregistrées se réparent.** Une entrée est périmée si elle
  n'a aucun champ `hls` (elle date d'avant le repli) **ou** si son flux porte
  encore `intro_master_id` (elle date d'avant le retrait du générique). Dans les
  deux cas, à la première ouverture, l'écran la recharge depuis son lien TED
  d'origine et remplace l'entrée. Personne n'a à savoir qu'il faut recoller le
  lien — et sans cette règle, un correctif serveur resterait invisible pour qui
  a déjà ouvert la conférence.

Lire du HLS impose **hls.js**, seule bibliothèque externe du projet — dérogation
à la règle « pas de framework, pas de npm », acceptée en connaissance de cause
parce qu'il n'existe aucune autre façon de lire ces conférences hors de Safari.
Trois précautions la rendent supportable :

- **Chargée à la demande**, jamais au démarrage : seule l'ouverture d'une
  conférence la déclenche.
- **Build complet minifié, 529 Ko**, injecté par une balise `<script>` — le
  build ES module n'existe pas en version minifiée (845 Ko).

  Le build `light`, 184 Ko plus léger, a d'abord été choisi : il retire les
  sous-titres, le DRM… et **les pistes audio alternatives**. Or TED livre
  précisément l'audio comme piste séparée — chaque rendition porte
  `AUDIO="audio0"`, pointant vers un `EXT-X-MEDIA:TYPE=AUDIO`. Résultat mesuré
  sur la même conférence : `light` → 0 piste audio, seul `video` mis en tampon ;
  complet → 3 pistes, `audio` en tampon. Le light donnait l'image sans le son.
  **Ne pas y revenir pour gagner 184 Ko.**
- **Jamais téléchargée sur iPhone** : le lecteur tente d'abord la lecture
  native, que Safari et iOS assurent seuls. `canPlayType` ne peut pas servir à
  ce test — mesuré, Chromium répond « maybe » pour le HLS puis échoue avec
  `MEDIA_ERR_SRC_NOT_SUPPORTED` — donc on essaie vraiment de charger, et on
  bascule sur l'échec.

Une barre segmentée montre le chapitrage : une case par phrase, verte quand
elle est réussie. Une phrase n'est marquée **que** si elle est juste — un échec
la laisse à refaire, sans pénalité.

**Rien n'entre dans le Leitner.** Le vocabulaire d'une conférence TED sort
largement des 1000 mots du catalogue ; compter ces phrases fausserait les
boîtes. Cette section est un entraînement, pas une évaluation.

### D'où viennent la vidéo et les phrases

L'utilisateur colle un lien TED, ou le lien YouTube d'une conférence TED — le
pont passe par le titre, et la recherche TED rend la bonne conférence en
premier résultat.

Trois choses, mesurées avant d'être retenues :

- **La transcription vient de TED, jamais de YouTube.** YouTube ne livre aucun
  sous-titre : son point d'entrée non officiel renvoie zéro octet, et l'API
  officielle exige d'être propriétaire de la vidéo. TED, lui, publie le texte
  **déjà découpé en phrases et horodaté à la milliseconde**.
- **La vidéo est lue depuis TED, pas depuis YouTube.** Une balise `<video>`
  native saute à la seconde exacte et se commande. Le lecteur embarqué de TED,
  lui, n'expose aucune API : on ne pourrait pas le piloter.
- **Les horodatages collent au flux TED sans générique — pas au mp4.** Le mp4
  et le flux `?intro_master_id=…` commencent tous deux par 3,5 s d'écran-titre
  que le transcript ignore ; seul le flux sans ce paramètre démarre avec la
  première phrase. Voir « Le générique décalait tout » plus bas.

Un seul appel serveur est nécessaire, pour la transcription : `ted.com`
n'envoie aucun en-tête CORS (§16).

**Licence.** Les conférences TED sont en **CC BY-NC-ND 4.0**. Le crédit est
affiché à l'écran, et l'usage reste **personnel et non commercial** — décision
prise en connaissance de cause, la clause ND interdisant de transformer l'œuvre.
Les transcriptions récupérées vivent en `localStorage`, **jamais** dans
`/content`.

---

## 3. Sources de vocabulaire

Le champ `source` pilote l'écran de découverte et l'éligibilité aux jeux.

| `source` | Origine | Éligible grille |
|---|---|---|
| `palier` | listes de fréquence, puis thèmes | oui |
| `perso` | saisie manuelle par l'utilisateur (§01) | non |
| `organique` | mot tapé dans un indice ou une histoire | non |
| `verbe` | verbes irréguliers | non (hors écran principal) |
| `phrasal` | phrasal verbs | non (hors écran principal) |

### 3.1 Progression générale

| Paliers | Contenu | Volume |
|---|---|---|
| 1 → 20 | **les 1000 mots les plus fréquents**, dans l'ordre de fréquence | 50 mots par palier |
| 21+ | thèmes (cuisine, voyage, corps, travail…) | 50 mots par palier |

**Les thèmes n'arrivent qu'après les 1000 mots.** Justification : les 1000 mots
les plus fréquents couvrent environ 75 à 80% d'un texte courant. C'est là que le
rendement de l'apprentissage est maximal. Le vocabulaire spécifique ne sert à
rien tant que la base n'est pas acquise.

Repères de couverture (Paul Nation) :

| Mots connus | Couverture | Ce que ça permet |
|---|---|---|
| 1 000 | ~75% | suivre le sujet d'une conversation |
| 2 000 | ~85% | converser au quotidien |
| 5 000 | ~95% | seuil de la lecture autonome |

**Traitement des mots-outils.** Le haut de la liste de fréquence (*the, of, and,
to, a, in, that, is*) ne se traduit pas isolément et ne peut pas être mis en
indice. Ces mots passent **uniquement par la phrase cachée** du codeword et par
les histoires, jamais par les indices ni les mots croisés.

Déblocage de palier : **80% des mots en boîte 3+**, pas la complétion.

### 3.2 Verbes irréguliers — des mots comme les autres

Sur les 68 irréguliers usuels, **53 figurent déjà dans les 1000 mots**, avec leur
palier, leur indice et leur éligibilité aux jeux : ils se découvrent, se quizzent
et se jouent déjà comme n'importe quel mot. Les **15 autres** manquaient
purement et simplement — dont `be`, `have`, `do` et `go`, absents du catalogue
sous toutes leurs formes, ce qui est un défaut d'une liste des 1000 mots les
plus fréquents. `content/verbes.json` les ajoute, mis en forme comme des mots
ordinaires.

**Ils gardent un espace d'identifiants séparé** (`v_00xx`). Ceux du catalogue
sont positionnels (`w_<palier><rang>`) : insérer un mot dans un palier
décalerait tous les suivants, et la progression, indexée par identifiant,
désignerait alors d'autres mots. Le chargement les fusionne au catalogue palier
par palier, exactement comme les mots.

`groupe_verbe` reste renseigné — la famille de pattern éclaire le contenu — mais
plus aucun écran ne l'exploite :

| Groupe | Pattern | Exemples |
|---|---|---|
| G1 | A-A-A, invariables | cut, put, let, hit, cost |
| G2 | en `-ought` / `-aught` | think, bring, buy, catch, teach |
| G3 | A-B-B | have, say, make, get, keep, leave |
| G4 | A-B-C | be, go, see, take, give, write |

**Le prétérit et le participe ne sont plus travaillés séparément.** La section
09 et son `VerbTriad` suivaient chaque forme dans une fiche Leitner distincte ;
elle a été retirée au profit d'un parcours unique. Un verbe est un mot : il
passe par Découverte, puis par le quizz, puis par les jeux.

### 3.3 Phrasal verbs

**Pas encore branchés.** Le contenu et l'écran existent, mais la filière n'a pas
d'entrée dans l'écran principal. `get` + particule donne sept sens sans rapport :
modes dédiés prévus — complétion du mot-clé, remise en ordre, discrimination de
particule. Le rappel actif « tape l'expression entière » est trop punitif : ne
jamais l'utiliser pour `phrasal`.

### 3.4 Organique

Dans un indice de grille ou dans une histoire, **chaque mot est tappable**. Un
tap affiche la traduction contextuelle (pré-calculée, aucun appel réseau). Un
second tap sur `+` ajoute le mot à la file de découverte (§02). Voir §15.4.

---

### 3.5 Mots rapportés d'une conversation

La source la plus utile, parce que c'est la seule qui soit **prouvée** : ce
qu'on a séché à dire à l'oral. Les 1000 mots et le TOEIC sont des listes
génériques ; celle-ci est la trace d'un manque réel.

Le parcours est délibérément bête : on parle, on récupère un fichier JSON, on
le dépose dans §01 par **Importer une liste de mots**. Les mots entrent comme
des ajouts manuels — `source: "conversation"` — et partent en file de
découverte.

**Le format d'entrée tient en cinq champs**, et c'est volontaire :

```json
{ "version": 1,
  "mots": [{ "en": "to make up for",
             "fr": "compenser",
             "type": "expr",
             "def_en": "To do something good to balance a mistake",
             "exemple_en": "I worked late to make up for the delay." }] }
```

Une fiche interne en compte vingt-cinq (`famille`, `sens_index`, `rang_freq`,
`eligible_grille`…). Les faire produire ailleurs serait une invitation à
l'erreur : tout le reste est calculé à l'import.

**`def_en` n'est pas décoratif.** Le quizz (§03) choisit le mot par sa
définition et ne retient que les fiches dont `indice.segments` est rempli — il
promeut les autres **sans les tester**. L'import range donc la définition là où
le quizz la cherche, et compte à voix haute les mots qui n'en ont pas : « 3 sans
définition : ils n'iront pas au quizz. »

Les entrées sans `en` ou sans `fr` sont écartées, comme les doublons — y compris
avec les mots déjà ajoutés.

## 4. Boucle d'apprentissage

Ordre non négociable : **on découvre, on vérifie, on joue.** Un mot ne peut
jamais sauter le quizz.

```
   §01 Traduire          §02 Découverte
   (mot capturé)  ──────►  je connais ? ─── oui ──┐
                                │                 │
                               non                │
                                ▼                 ▼
                    ATTENTE (2 jours)      ┌─────────────┐
                                │          │  §03 QUIZZ  │◄────┐
                                ▼          │ définition  │     │
                       §04 Apprendre       │  → le mot   │     │
                       QUIZ + Écriture     └─────────────┘     │
                                │             │        │       │
                                │           juste     faux     │
                        boîte 3 ├─────────────┘        │       │
                                │             │        ▼       │
                                │             │   ATTENTE (2 j)│
                                └─────────────┼────────────────┘
                                              ▼
                               ┌──────────────────────────┐
                               │  vivier des mots validés │
                               └──────────────────────────┘
                                 │         │          │
                                 ▼         ▼          ▼
                               §05       §06        §07
                             grille   croisés    histoire
```

### 4.1 Ce qui fait progresser un mot

| Événement | Effet Leitner |
|---|---|
| *Je connais* en découverte (§02) | boîte 2, en attente de quizz |
| *Je ne connais pas* en découverte | boîte 1, `attente`, revu dans 2 jours |
| **Quizz réussi** (§03) | boîte 3, `connu` — les jeux s'ouvrent |
| **Quizz raté** | boîte 1, `attente`, revu dans 2 jours |
| QUIZ **et** écriture réussis (§04) | boîte +1 ; à la boîte 3, retour au quizz |
| QUIZ ou écriture raté (§04) | boîte 1, `attente` |
| Mot complété dans la grille (§05) | boîte +1 |
| Mot complété dans les mots croisés (§06) | boîte +1 |
| Mot lu sans consulter la traduction (§07) | boîte +1 |
| Traduction consultée, ou **lettre révélée** (§15.7) | **pas de montée de boîte** |

### 4.2 Ce qui ne fait rien progresser

Voir un mot en découverte ne le fait pas progresser. Se déclarer sûr de soi non
plus. Consulter une traduction au tap ne le fait pas progresser. Seule une
**production sans aide** compte.

---

## 5. Moteur de répétition espacée

Leitner à 5 boîtes. C'est le moteur **unique** : il décide de ce qui apparaît
dans *Apprendre*, des mots que les deux jeux tirent, et du vocabulaire que
l'histoire du jour peut employer.

| Boîte | Délai | Signification |
|---|---|---|
| 1 | **2 jours** | à apprendre |
| 2 | 3 jours | fragile |
| 3 | 7 jours | **connu** — entre dans les jeux et les histoires |
| 4 | 21 jours | solide |
| 5 | 40 jours | acquis — mais toujours revu |

```
succès → boite++, prochaine_revision = today + DELAIS[boite]
échec  → boite = 1, prochaine_revision = today + 2
```

Deux délais méritent leur justification.

**Boîte 1 : 2 jours.** C'est le même délai que celui qui sépare *« je ne
connais pas »* de la première apparition dans *Apprendre*. Il n'y a qu'une
règle, pas deux.

**Boîte 5 : 40 jours, pas un an.** Un délai d'un an revient à sortir le mot du
circuit : entre-temps il aura disparu, et la seule chose que l'application
constatera, c'est l'échec. Quarante jours restent assez longs pour ne pas peser
— un mot acquis revient neuf fois par an — et assez courts pour rattraper un
oubli pendant qu'il est encore réparable. Un mot en boîte 5 continue donc
d'alimenter la grille, les mots croisés et les histoires.

**Requête unique**, commune à toutes les sections :
```js
words.filter(w => w.statut === "actif" && w.prochaine_revision <= today)
     .sort((a,b) => a.prochaine_revision - b.prochaine_revision)
```

### 5.1 Comment chaque section utilise Leitner

| Section | Ce qu'elle demande à Leitner |
|---|---|
| **03 Quizz** | les mots au statut `quizz` dont l'échéance est atteinte |
| **04 Apprendre** | les mots aux statuts `attente` et `actif` dont l'échéance est atteinte |
| **05 Grille** | les mots `connu`/`acquis` non encore servis par la grille |
| **06 Mots croisés** | les mêmes, non encore servis par les croisés |
| **07 Histoire** | l'ensemble des mots `connu`/`acquis`, pour choisir un texte couvert à 95% |

**Le statut n'est plus une fonction de la boîte.** Un mot en boîte 2 peut
attendre le quizz ou être en cours d'apprentissage : ce sont deux endroits
différents. Chaque service pose donc le statut explicitement.

**Signal de maîtrise :** si l'utilisateur a eu besoin de la traduction FR pour
résoudre un mot, ce mot **ne monte pas d'une boîte**.

---

## 6. Schémas de données

### 6.1 `word` — entité unifiée

Une seule structure encaisse toutes les sources. Les champs non pertinents
restent `null`.

**Nouveauté v3 : l'indice vit sur le mot, pas sur la partie.** C'est ce qui
permet au générateur de composer n'importe quelle grille sans réécrire de
contenu.

```json
{
  "id": "w_00147",
  "en": "reluctant",
  "fr": "réticent",
  "type": "adj",
  "source": "palier",
  "phonetique": "/rɪˈlʌk.tənt/",

  "famille": "reluctant",
  "sens_index": 1,

  "rang_freq": 847,
  "palier": 17,
  "themes": ["emotion"],
  "exemple_en": "She was reluctant to speak.",
  "exemple_fr": "Elle était réticente à parler.",

  "indice": {
    "en": "Not willing to do something",
    "segments": [
      { "txt": "Not",       "trad": null },
      { "txt": "willing",   "trad": "disposé",       "ref": null },
      { "txt": "to",        "trad": null },
      { "txt": "do",        "trad": null },
      { "txt": "something", "trad": "quelque chose", "ref": null }
    ]
  },

  "phrase_en": null,
  "phrase_fr": null,
  "date_capture": null,
  "origine_partie": null,

  "preterit": null,
  "participe": null,
  "groupe_verbe": null,

  "verbe_base": null,
  "particule": null,
  "litteral": null,

  "eligible_grille": true,
  "eligible_croises": true
}
```

| Champ | Règle |
|---|---|
| `id` | préfixe : `w_` mot, `v_` verbe, `x_` phrasal, `p_` perso |
| `type` | `n / v / adj / adv / prep / conj / pron / det` — filtre les mots-outils hors indices |
| `famille` + `sens_index` | polysémie : **une entrée par sens** (§6.2) |
| `indice.en` | définition périphrasée, en anglais, avec segments tappables |
| `indice.segments[].trad` | `null` = mot-outil, non tappable |
| `indice.segments[].ref` | id du mot au catalogue, ou `null` |
| `eligible_grille` | longueur 3-8, `[A-Z]` uniquement, sans espace ni tiret |
| `eligible_croises` | idem + possède un `indice` non vide |

### 6.2 Polysémie

**Une entrée par sens.** En rappel actif, une entrée multi-sens n'affiche rien
de testable et le Leitner ne peut pas suivre « connaît *droite* mais pas
*correct* ».

| Moment | Action |
|---|---|
| Import du palier | 1 entrée, le sens le plus fréquent |
| Capture d'un autre sens | nouvelle entrée, même `famille` |

Détection de doublon à la saisie : *« Tu connais déjà right = droite. Ajouter le
sens "correct" ? »*

### 6.3 `phrase` — réservoir partagé

Les phrases cachées sont **séparées des paliers**. Le générateur y pioche selon
la compatibilité alphabétique, jamais selon le thème.

> **Constat de conception :** dans les jeux de référence, les mots de la grille
> n'ont aucun lien sémantique avec la phrase cachée. Le lien est purement
> alphabétique — la phrase sert de réservoir de lettres. C'est ce qui rend la
> génération possible.

```json
{
  "id": "ph_042",
  "en": "WHEN LIFE GIVES YOU LEMONS",
  "fr": "Quand la vie te donne des citrons",
  "contexte_fr": "Proverbe américain. Rester optimiste face aux difficultés. Équivalent : faire de nécessité vertu.",
  "lettres": ["W","H","E","N","L","I","F","G","V","S","Y","O","U","M"],
  "utilisee_par": null
}
```

`lettres` est pré-calculé pour accélérer l'appariement.
`utilisee_par` est rempli par le générateur avec l'id de la partie produite,
pour qu'une phrase ne serve qu'une fois.

### 6.4 `partie` — produite par le générateur

```json
{
  "id": "p_012",
  "palier": 3,
  "ordre": 2,
  "jeu": "grille",
  "phrase_id": "ph_042",
  "phrase_en": "WHEN LIFE GIVES YOU LEMONS",
  "phrase_fr": "Quand la vie te donne des citrons",
  "contexte_fr": "Proverbe américain…",

  "mots": ["w_00012","w_00089","w_00301","w_00455","w_00877"],
  "alphabet": { "1": "W", "2": "H", "4": "E" },

  "croises": {
    "grille": [[null,"w_00012",null],["w_00089",null,null]],
    "placements": [
      { "mot": "w_00012", "x": 1, "y": 0, "dir": "H", "num": 1 },
      { "mot": "w_00089", "x": 0, "y": 1, "dir": "V", "num": 2 }
    ],
    "largeur": 11,
    "hauteur": 9
  },

  "verifie": true
}
```

- La partie **référence** les mots par id, ne duplique jamais leur contenu
- Les indices ne sont **pas** dans la partie : ils sont sur les mots (§6.1)
- `alphabet` et `croises` sont pré-calculés : l'app ne génère rien
- `jeu` vaut `grille` ou `croises` — une partie n'alimente qu'un seul des deux,
  c'est ce qui garantit la règle « jamais les mêmes mots » (§05)
- `verifie` : une partie non vérifiée n'est **jamais** servie

**Supprimés en v4 :** `mot_amorce` et `lettres_offertes`. La grille démarre
vide (§04), il n'y a plus rien à offrir.

### 6.5 `histoire` — lecture du jour

```json
{
  "id": "h_014",
  "arc": "marta",
  "ordre": 3,
  "titre_en": "The Letter",
  "titre_fr": "La lettre",
  "texte_en": "Marta opened the door…",
  "texte_fr": "Marta ouvrit la porte…",
  "nb_mots": 287,
  "lexique": ["w_01001","w_01047","w_02015"],
  "hors_lexique": ["envelope","stamp"],
  "suite_de": "h_013",
  "source": "contenu"
}
```

| Champ | Règle |
|---|---|
| `arc` | identifiant de série ; `null` pour une histoire isolée |
| `ordre` | rang dans l'arc, à lire dans l'ordre |
| `nb_mots` | 220 à 350 |
| `lexique` | ids des mots du catalogue employés — sert au calcul de couverture |
| `hors_lexique` | mots hors catalogue employés dans le texte, avec leur traduction dans `texte_fr` |
| `suite_de` | id de l'histoire précédente, ou `null` |
| `source` | `contenu` (stock hors ligne) ou `api` (générée, §16) |

**Règle de sélection.** L'app retient l'histoire dont la couverture est la plus
haute parmi celles ≥ 95%, en privilégiant la continuation d'un arc déjà entamé.
Si aucune histoire du stock n'atteint 95%, elle demande une génération à l'API.
Si l'API est indisponible, elle sert la meilleure histoire disponible en
signalant le taux de couverture réel.

### 6.7 `phrase de dictée` — corpus externe

> **La dictée ne vient plus de ce corpus.** Elle se fait désormais sur les
> **conférences** (§10) : une phrase, son segment, son horodatage. L'audio
> humain de Tatoeba imposait de télécharger un fichier par phrase, et aucun ne
> l'a jamais été — `content/audio` n'en contenait qu'un seul, si bien que la
> dictée était muette. Les conférences apportent le son gratuitement, déjà
> découpé.
>
> Ce corpus reste **la source de la traduction guidée**, qui a besoin du
> français : une conférence n'est pas traduite. Les champs `audio`, `lecteur`
> et `licence` ne sont donc plus lus.

```json
{
  "id": "d_01038",
  "tatoeba_id": "220629",
  "en": "This word is new to me.",
  "fr": ["Ce mot est nouveau pour moi."],
  "en_alt": [],
  "audio": "audio/220629.mp3",
  "lecteur": "CK",
  "licence": "CC BY-NC-ND 3.0"
}
```

| Champ | Règle |
|---|---|
| `fr` | toutes les traductions du corpus ; la première sert d'énoncé |
| `en_alt` | autres formulations anglaises du même sens, toutes acceptées |
| `lecteur` + `licence` | **obligation de licence**, affichés dans l'écran |

**Contraintes de licence.** Les enregistrements sont pour l'essentiel en
CC BY-NC-ND 3.0 : usage **non commercial**, **aucune modification** du fichier
audio, **crédit** du lecteur et de Tatoeba. Ces trois points ne sont pas
négociables et l'écran §08 les respecte. Si le projet devient commercial, il
faut changer de source.

Le fichier n'est **pas écrit à la main** : `tools/contenu/construire-dictees.mjs`
le produit à partir des exports Tatoeba, en ne gardant que les phrases dont
tout le vocabulaire est déjà connu.

**Un palier lit aussi tous les précédents.** `chargerDictees` cumule les
fichiers des paliers 1 à N. Puisque le générateur garantit qu'un fichier de
palier N n'emploie que du vocabulaire de N ou d'avant, tout ce qui précède
reste dictable — et le stock grandit au lieu d'être remplacé. Sans ce cumul,
atteindre un palier dont le fichier n'est pas encore livré vidait la section et
**verrouillait la carte « Écrire »** : un palier absent n'est pas une anomalie,
la filière est livrée progressivement.

### 6.6 `state` — données mutables

localStorage. Clés courtes : sur 1000 mots ça divise le poids par trois.

**localStorage ne suffit pas.** Sur iPhone, Safari efface le stockage d'un site
qui n'a pas été ouvert depuis **sept jours** : toute la progression partirait
avec lui. Trois protections, dans cet ordre :

1. **L'app est installable** (`manifest.webmanifest`). Ajoutée à l'écran
   d'accueil, elle sort du périmètre de cette purge. C'est la mesure la plus
   efficace, et elle ne coûte rien.
2. **`navigator.storage.persist()`** est demandé au démarrage. Un refus
   n'empêche rien.
3. **Recopie en ligne** (`services/sync.js`), décrite ci-dessous.

Le rappel de sauvegarde manuelle est réglé sur `RAPPEL_SAUVEGARDE_JOURS = 5`,
**sous** le seuil des sept jours : à 30 jours, il arrivait trois semaines après
la perte.

#### Recopie en ligne

L'état complet est écrit dans Supabase sous un **identifiant long et
aléatoire**, à chaque changement, avec un délai de 4 s pour regrouper la rafale
d'enregistrements d'une séance.

Cet identifiant n'est **pas un secret** : il est seulement introuvable par
hasard. C'est assumé — une liste de mots appris n'a rien de confidentiel, le
risque à écarter était qu'un tiers puisse **écraser** la progression. La table
n'est donc accessible par aucune requête directe (RLS sans policy, vérifié :
une lecture renvoie `[]`) ; deux fonctions `security definer` sont les seules
portes, et elles exigent l'identifiant.

Recopier cet identifiant sur un second appareil y restaure la même progression.

**Un état vide n'écrase jamais la sauvegarde.** Sur un appareil neuf, ou après
une purge, l'app démarre sans rien : sans ce garde-fou, la recopie automatique
détruirait la sauvegarde distante avant qu'on ait pu la restaurer.

```json
{
  "v": 4,
  "words": {
    "w_00147": { "b": 3, "r": "2026-09-09", "s": 4, "e": 1, "d": "2026-09-02", "st": "connu" }
  },
  "verbes": {
    "v_0012": {
      "preterit":  { "b": 2, "r": "2026-09-04", "s": 3, "e": 0 },
      "participe": { "b": 1, "r": "2026-09-03", "s": 1, "e": 2 }
    }
  },
  "progression": {
    "palier_actuel": 2,
    "paliers_valides": [1],
    "file_decouverte": ["w_01247"],
    "parties_servies": { "grille": ["p_0101"], "croises": ["p_0203"] },
    "histoires_lues": ["h_012","h_013"],
    "derniere_histoire": "2026-09-07",
    "dictees_faites": ["d_01038"],
    "phrases_video": { "kelly_mcgonigal_how_to_make_stress_your_friend": [0, 1, 2] },
    "videos_vues": { "kelly_mcgonigal_how_to_make_stress_your_friend": "2026-09-30" },
    "ajouts_aujourdhui": 2,
    "derniere_session": "2026-09-07",
    "derniere_sauvegarde": "2026-09-01",
    "objectif_quotidien": 5
  },
  "perso": []
}
```

| Clé | Signification |
|---|---|
| `b` | boîte Leitner (1-5) |
| `r` | prochaine révision (ISO) |
| `s` / `e` | succès / échecs |
| `d` | date dernière réponse |
| `st` | statut du mot, voir ci-dessous |

**Statuts (`st`)**

| Statut | Sens | Où le mot apparaît |
|---|---|---|
| `nouveau` | jamais présenté | file de découverte (§02) |
| `quizz` | déclaré connu, ou sorti d'apprentissage : à vérifier | Quizz (§03) |
| `attente` | marqué inconnu ou raté au quizz, délai de 2 jours en cours | nulle part |
| `actif` | en cours d'apprentissage | Apprendre (§04) |
| `connu` | **validé au quizz** | grille, croisés, histoire |
| `acquis` | boîte 5 | histoire, grille, croisés |
| `suspendu` | mis de côté par l'utilisateur | nulle part |

`parties_servies` garantit la règle §05 : une partie servie par un jeu n'est
plus proposée par l'autre. Quand la liste d'un jeu couvre tout le vivier, elle
est vidée et le cycle recommence.

**Supprimés en v4 :** `defis_faits`, `streak` et `parties_jouees`. Ils
n'existaient que pour le défi quotidien, retiré du produit.

---

## 7. Stockage

| Donnée | Nature | Emplacement |
|---|---|---|
| mots, phrases, parties, verbes, phrasal, histoires | statique | `/content/**.json` |
| état de progression | mutable | `localStorage['wordcode_state']` |
| mots perso | mutable | `localStorage['wordcode_perso']` |
| histoires générées par l'API (§16) | mutable | `localStorage['wordcode_histoires']` |

### Export / import — obligatoire

localStorage se vide au nettoyage du navigateur. **Sans export, des mois de
progression disparaissent.**

- « Sauvegarder ma progression » → `wordcode-backup-YYYY-MM-DD.json`
- « Restaurer » → upload, validation du champ `v`, remplacement
- Rappel automatique tous les 30 jours

### Chargement

Au boot : manifeste, puis **paliers débloqués uniquement**. Ne jamais charger
1000 mots si l'utilisateur est au palier 2.

---

## 8. Contenu enfichable

**Ajouter un palier = déposer deux fichiers + une ligne de manifeste. Aucune
modification de code.**

```
/content
  manifest.json
  phrases.json            ← réservoir partagé
  /paliers
    palier-01.json
  /parties
    parties-01.json       ← produit par le générateur
  verbes.json
  phrasal.json
```

### `manifest.json`

```json
{
  "version": 3,
  "paliers": [
    { "id": 1, "fichier": "paliers/palier-01.json",
      "parties": "parties/parties-01.json",
      "titre": "Les 50 mots les plus fréquents",
      "nb_mots": 50, "type": "frequence" }
  ],
  "phrases": "phrases.json",
  "verbes": "verbes.json",
  "phrasal": "phrasal.json",
  "histoires": "histoires/index.json"
}
```

`type` vaut `frequence` (paliers 1-20) ou `theme` (21+).

### Validation au chargement

`contentLoader` doit **rejeter proprement** un fichier invalide et l'afficher
dans l'écran Réglages, sans casser l'app :

- champs obligatoires présents
- tous les `mots[]` d'une partie existent dans son palier
- `alphabet` cohérent avec `phrase_en` et les mots
- `croises.placements` cohérents avec les mots
- `verifie: true`

---

## 9. Le générateur hors ligne

**Script Node autonome** (`/tools/generateur.js`), exécuté à la main. Il ne fait
pas partie de l'application et n'est jamais appelé depuis le navigateur.

```
palier-XX.json + phrases.json
        ↓  node tools/generateur.js --palier 3
   parties-XX.json  →  /content/parties/
```

### Ce qu'il fait

Pour chaque groupe de 5 mots d'un palier :

1. **Choisir une phrase** du réservoir **dont toutes les lettres apparaissent
   dans les 5 mots**, non encore utilisée
2. **Construire l'alphabet** : lettres de la phrase puis des mots, dans l'ordre
   d'apparition, numérotées à partir de 1
3. **Construire la grille de mots croisés** : placement 2D avec croisements,
   depuis le mot le plus long
4. **Marquer `verifie: true`**

### Le sens de la contrainte a changé en v4

C'est le point le plus important de cette section.

En v3, la grille offrait des lettres de départ et l'utilisateur déduisait le
reste. Il fallait donc que **la phrase couvre les lettres des mots**, pour que
la chaîne de déduction puisse démarrer. Cette contrainte rejetait la grande
majorité des groupes.

En v4 la grille démarre vide (§04) : il n'y a plus de déduction à amorcer. Ce
qu'il faut garantir, c'est que la phrase cachée devienne **lisible** une fois la
grille remplie. Donc :

```
v3 :  lettres(mots)   ⊆  lettres(phrase)      ← abandonné
v4 :  lettres(phrase) ⊆  lettres(mots)        ← règle actuelle
```

**Corollaire :** la simulation de chaîne de déduction, la notion de point
d'entrée et la règle « max 2 lettres nouvelles par mot » **disparaissent**.
Elles n'avaient de sens qu'avec des lettres offertes.

### Contraintes

| Contrainte | Règle |
|---|---|
| Lisibilité de la phrase | chaque lettre de la phrase apparaît dans au moins un des 5 mots |
| Longueur des mots | 3 à 8 lettres |
| Alphabet | ≤ 26 entrées, aucune collision |
| Mots croisés | chaque mot croise au moins un autre |
| Composition | 5 mots du même palier |
| Partition des jeux | une partie porte `jeu: "grille"` ou `jeu: "croises"`, jamais les deux |

### Règle absolue

**Le générateur n'écrit jamais une partie qu'il n'a pas pu vérifier.** S'il
échoue après 50 essais sur un groupe de mots, il l'écrit dans un fichier
`rejets.json` et continue. Aucune partie douteuse n'atteint l'application.

### Mode `--verify`

Relit un fichier de parties existant et confirme, pour chaque partie, que
l'alphabet est cohérent, que la phrase est entièrement lisible depuis les mots,
et que les placements de mots croisés se recoupent correctement.

---

## 10. Architecture technique

### Stack

- **HTML / CSS / JS vanilla**, modules ES natifs — pas de build step.
  Une seule exception, motivée et bornée : **hls.js**, chargé à la demande
  pour lire les conférences TED hors de Safari (§10). Rien d'autre n'entre.
- **GitHub Pages** comme hébergement
- **Vercel serverless** pour l'unique appel Gemini (clé jamais exposée)
- **Web Speech API** (`SpeechSynthesis`) pour l'audio

> **Exception explicite :** `/api/` (fonction Vercel) et `/tools/` (scripts
> Node) sont **hors application**. Un `package.json` y est autorisé et
> nécessaire si le déploiement l'exige. La règle « pas de build step » ne
> concerne que le site servi par GitHub Pages.

### Arborescence

```
/index.html
/app.js                    point d'entrée
/styles
  tokens.css               variables — SEULE source de vérité visuelle
  base.css
  components.css
/components
  /atoms  /molecules  /organisms
/screens
/services
/content
  manifest.json
  /paliers  /parties  /histoires
  phrases.json
/tools
  generateur.js            script Node, hors application
  serveur-dev.py           serveur statique SANS CACHE, développement seulement
  /contenu                 source rédigée des paliers, hors application
```

### Servir le projet en développement

`python3 tools/serveur-dev.py` — et **pas** `python3 -m http.server`.

La raison n'est pas cosmétique : sans en-tête `no-store`, le navigateur garde
les modules ES en cache mémoire. Une correction dans un service reste alors
invisible, et un module fautif continue de tourner après avoir été réparé.
C'est arrivé pendant le développement de la §08 : une boucle infinie corrigée
sur le disque a continué de bloquer l'onglet pendant plusieurs essais, en
donnant l'illusion que le correctif ne marchait pas.

Le site publié reste un dossier de fichiers statiques : ce serveur ne sert
qu'au développement, il n'introduit aucune étape de construction.

### Convention de composant

Un composant = **un fichier**, exportant **une fonction factory** qui retourne
un élément DOM. Pas de framework, pas de classe.

```js
export function Button({ label, variant = "primary", icon = null,
                         disabled = false, onClick }) {
  const el = document.createElement("button");
  el.className = `btn btn--${variant}`;
  return el;
}
```

- un composant ne lit **jamais** le store — tout passe par les props
- un composant n'écrit **jamais** dans le store — il émet via `onXxx`
- aucun style inline, aucune couleur en dur

---

## 11. Design tokens

`styles/tokens.css` est la **seule** source de vérité visuelle.

```css
:root {
  --c-bg:            #f4f7fb;
  --c-surface:       #ffffff;
  --c-surface-alt:   #eaf0f8;
  --c-text:          #2c3e56;
  --c-text-muted:    #7a8ca3;
  --c-primary:       #5b8def;
  --c-primary-dark:  #3f6fd1;
  --c-accent:        #ffb340;
  --c-success:       #3fbf7f;
  --c-error:         #e5544b;
  --c-tile:          #ffffff;
  --c-tile-filled:   #dcecff;
  --c-tile-active:   #ffe4b0;
  --c-tile-offered:  #d6f2e4;
  --c-tile-block:    #c9d6e6;

  --sp-1: 4px;  --sp-2: 8px;  --sp-3: 12px;
  --sp-4: 16px; --sp-5: 24px; --sp-6: 32px; --sp-7: 48px;

  --r-sm: 6px; --r-md: 12px; --r-lg: 20px; --r-full: 999px;

  --f-base: -apple-system, "Segoe UI", Roboto, sans-serif;
  --fs-xs: 12px; --fs-sm: 14px; --fs-md: 16px;
  --fs-lg: 20px; --fs-xl: 26px; --fs-2xl: 34px;
  --fw-regular: 400; --fw-medium: 600; --fw-bold: 800;

  --sh-sm: 0 1px 3px rgba(44,62,86,.10);
  --sh-md: 0 4px 12px rgba(44,62,86,.12);
  --sh-lg: 0 8px 28px rgba(44,62,86,.16);

  --z-popover: 100; --z-keyboard: 200; --z-modal: 300; --z-toast: 400;

  --touch-min: 44px;
}
```

Toute cible tactile ≥ `--touch-min`. Cible : 380px de large.

---

## 12. Inventaire des composants

**Liste fermée.** Tout besoin d'interface doit se résoudre avec un composant de
cette liste, ou par l'ajout documenté d'un nouveau composant dans ce README.
**Il est interdit de créer un composant non listé ici.**

### 12.1 Atoms

| Composant | Fichier | Props | Usage |
|---|---|---|---|
| `Button` | `atoms/button.js` | `label, variant(primary\|secondary\|ghost\|danger), icon, disabled, fullWidth, onClick` | **Tout** bouton textuel |
| `IconButton` | `atoms/icon-button.js` | `icon, label, variant, badge, onClick` | Accueil, menu, audio |
| `Tile` | `atoms/tile.js` | `letter, number, state(empty\|filled\|active\|offered\|error\|revealed\|block), onClick` | **Toute** case lettre : codeword, mots croisés, phrase cachée |
| `Chip` | `atoms/chip.js` | `label, variant` | Thèmes, badges de filière |
| `ProgressDots` | `atoms/progress-dots.js` | `total, current` | Progression dans une phase |
| `ProgressBar` | `atoms/progress-bar.js` | `value, max, variant` | Progression de palier |
| `Counter` | `atoms/counter.js` | `value, icon, label` | Streak, mots dus |
| `Spinner` | `atoms/spinner.js` | `size` | Attente API uniquement |
| `Toast` | `atoms/toast.js` | `message, variant, duration` | Confirmations, erreurs |
| `Divider` | `atoms/divider.js` | `spacing` | Séparation |
| `Icons` | `atoms/icons.js` | — | Objet `ICONS`, SVG inline (§15.5) |

### 12.2 Molecules

| Composant | Fichier | Props | Usage |
|---|---|---|---|
| `TileGroup` | `molecules/tile-group.js` | `tiles[], activeIndex, onTileClick` | Un mot = suite de `Tile` |
| `ClueText` | `molecules/clue-text.js` | `segments[], onWordTap` | Indice EN avec mots tappables |
| `ClueRow` | `molecules/clue-row.js` | `clue, tiles, solved` | Ligne d'indice du codeword |
| `ClueList` | `molecules/clue-list.js` | `items[], onSelect` | Liste numérotée des mots croisés (horizontal / vertical) |
| `TranslationPopover` | `molecules/translation-popover.js` | `word, translation, alreadyKnown, canAdd, onAdd, onClose` | Popover au tap |
| `WordCard` | `molecules/word-card.js` | `word, showAudio, otherSense, onNext` | Carte de découverte |
| `MCQ` | `molecules/mcq.js` | `question(texte ou élément), options[], correctId, onAnswer` | Quizz (§03), apprentissage (§04), particule |
| `InputAnswer` | `molecules/input-answer.js` | `prompt, expected, hint, onAudio, micro, onSubmit` | Rappel actif, dictée et traduction, saisie vocale (§08, §15.8) |
| `ClozeInput` | `molecules/cloze-input.js` | `sentence, blankIndex, expected, translation, onSubmit` | Phrase à trous |
| `VerbTriad` | `molecules/verb-triad.js` | `verb, showBase, onSubmit` | Prétérit + participe |
| `WordOrder` | `molecules/word-order.js` | `tokens[], expected, onSubmit` | Remise en ordre (phrasal) |
| `Keyboard` | `molecules/keyboard.js` | `layout, disabledKeys[], onKey, onBackspace` | **Clavier unique de l'app** |
| `SectionCard` | `molecules/section-card.js` | `numero, titre, compteur, etat(ouvert\|vide\|verrouille), message, onOpen` | **Les six cartes de Home** (§13) |
| `SessionHeader` | `molecules/session-header.js` | `title, onHome, onMenu, progress` | En-tête d'écran |
| `StatRow` | `molecules/stat-row.js` | `label, value, icon` | Écran de progression |
| `WordListItem` | `molecules/word-list-item.js` | `word, showBox, actions[]` | Ligne de mot dans toute liste |

### 12.3 Organisms

| Composant | Fichier | Props | Usage |
|---|---|---|---|
| `CodewordBoard` | `organisms/codeword-board.js` | `partie, words, alphabetState, onLetterInput, onComplete, onAddWord, onHint, hintsMax` | Phrase cachée, indices, révélation de lettres (§15.7) |
| `CrosswordBoard` | `organisms/crossword-board.js` | `partie, words, gridState, activeClue, onLetterInput, onClueSelect` | Grille 2D + `ClueList` |
| `DiscoveryDeck` | `organisms/discovery-deck.js` | `words[], onKnown, onUnknown` | Séquence de `WordCard` avec les deux boutons de tri (§02) |
| `AnchorDeck` | `organisms/anchor-deck.js` | `words[], onComplete` | Séquence de `MCQ` — le QUIZ de §03 |
| `RecallDeck` | `organisms/recall-deck.js` | `items[], onComplete` | Séquence de rappel actif |
| `EndCard` | `organisms/end-card.js` | `partie, words[], actionLabel, onContinue` | Phrase révélée, son contexte, et les mots travaillés |
| `QueueSummary` | `organisms/queue-summary.js` | `words[], onClose` | Ajouts organiques |
| `ManualEntryForm` | `organisms/manual-entry-form.js` | `onTranslate, onSave` | Saisie, dictée vocale (§15.8) et traduction |
| `PalierList` | `organisms/palier-list.js` | `paliers[], current, onSelect` | Choix de palier |
| `StoryReader` | `organisms/story-reader.js` | `histoire, onWordTap, onFinish` | Texte de l'histoire du jour, chaque mot tappable (§07) |
| `WordList` | `organisms/word-list.js` | `groupes[], showBox, actions` | Liste groupée : ajouts (§01), suivi d'apprentissage (§04) |
| `VideoPlayer` | `organisms/video-player.js` | `source, hls, titre, onPret, onFin, onProgres, onErreur` | Lecteur `<video>` piloté phrase par phrase (§10) |
| `CompositionForm` | `organisms/composition-form.js` | `consigne, mots[], onCheck, onCorriger, onTerminer` | Rédaction libre : mots imposés suivis en direct, correction API (§08) |

### 12.4 Composants explicitement uniques

- Tout bouton passe par `Button` ou `IconButton` — **aucun `<button>` brut**
- Toute case lettre passe par `Tile` — codeword, mots croisés et phrase cachée
  partagent le même composant, seul `state` change
- Tout clavier passe par `Keyboard` — un seul dans le DOM
- Tout affichage de mot en liste passe par `WordListItem`
- Toute saisie passe par `InputAnswer`, `ClozeInput`, `VerbTriad` ou
  `WordOrder` — jamais un `<input>` ad hoc

---

## 13. Écrans

| Écran | Fichier | Contenu |
|---|---|---|
| `Home` | `screens/home.js` | **Tableau de bord : les sept sections** |
| `ManualAdd` | `screens/manual-add.js` | §01 — saisie, traduction, liste des ajouts |
| `Discovery` | `screens/discovery.js` | §02 — *je connais* / *je ne connais pas* |
| `Quiz` | `screens/quiz.js` | §03 — définition → le bon mot |
| `Learn` | `screens/learn.js` | §04 — QUIZ puis écriture, et le suivi |
| `Codeword` | `screens/codeword.js` | §05 — la grille |
| `Crossword` | `screens/crossword.js` | §06 — les mots croisés |
| `Game` | `screens/game.js` | **orchestrateur partagé** par §05 et §06 |
| `Story` | `screens/story.js` | §07 — histoire du jour |
| `Writing` | `screens/writing.js` | §08 — dictée, traduction, rédaction |
| `Video` | `screens/video.js` | §09 — conférence phrase par phrase |
| `Phrasal` | `screens/phrasal.js` | phrasal verbs — **pas d'entrée dans l'écran principal** |
| `Progress` | `screens/progress.js` | statistiques, paliers, répartition par boîte |
| `Settings` | `screens/settings.js` | export/import, objectif, erreurs de contenu |

**Supprimé en v4 :** `screens/challenge.js`, `screens/session.js` et
`screens/review.js`. Le défi quotidien est retiré du produit, et la session
guidée est remplacée par les six sections.

**Pourquoi `game.js`.** Les sections §04 et §05 partagent la totalité de leur
déroulé : tirer une partie jouable, afficher un plateau vide, révéler la phrase
au bilan, faire monter les mots d'une boîte. Seul le plateau change. Les deux
écrans sont donc des enveloppes de trois lignes autour d'un orchestrateur
commun — écrire deux fois le même code aurait violé la §17, règle 10.

### Ce que Home affiche par section

Chaque section est une carte, avec son compteur et son état.

| Section | Compteur | État vide |
|---|---|---|
| 01 Traduire | mots ajoutés | *« Aucun mot ajouté pour l'instant. »* |
| 02 Découverte | mots à trier | *« Rien à découvrir : tu es à jour. »* |
| 03 Quizz | mots à vérifier | *« Rien à vérifier. Trie des mots en découverte. »* |
| 04 Apprendre | mots dus aujourd'hui | *« Rien à apprendre aujourd'hui. »* + date du prochain |
| 05 Grille | parties disponibles | *« Il faut au moins 5 mots validés au quizz. »* |
| 06 Mots croisés | parties disponibles | idem |
| 07 Histoire | couverture du texte du jour | *« L'histoire arrive quand tu connaîtras assez de mots. »* |
| 08 Écrire | phrases restantes | *« Aucune phrase enregistrée n'est livrée pour ton palier. »* |
| 09 Vidéo | phrases restantes | *« Colle le lien d'une conférence TED. »* |

### États obligatoires

| État | Traitement |
|---|---|
| **vide** | message explicite + action alternative |
| **verrouillé** | section indisponible : dire **pourquoi** et **quand** elle s'ouvrira |
| **chargement** | `Spinner` (`ManualAdd` et `Story` en secours API) |
| **erreur** | `Toast` + repli fonctionnel |
| **hors ligne** | tout fonctionne sauf `ManualAdd` et le secours API de `Story` |
| **fin** | récapitulatif + action suivante, jamais un cul-de-sac |

### Parcours

```
Home  (six cartes)
 ├─ 01 → ManualAdd     ManualEntryForm → WordList              → Home
 ├─ 02 → Discovery     DiscoveryDeck (connais / connais pas)   → Home
 ├─ 03 → Quiz          MCQ dont l'énoncé est un ClueText       → Home
 ├─ 04 → Learn         MCQ puis InputAnswer, + WordList        → Home
 ├─ 05 → Codeword      CodewordBoard (vide, 3 indices) → EndCard → Home
 ├─ 06 → Crossword     CrosswordBoard (grille vide) → EndCard  → Home
 ├─ 07 → Story         StoryReader → EndCard                   → Home
 ├─ 08 → Writing       InputAnswer (audio, micro) | CompositionForm → Home
 └─ 09 → Video         VideoPlayer + WordOrder | InputAnswer   → Home
```

Chaque section revient à Home. Il n'y a **aucun enchaînement automatique** entre
sections : c'est l'utilisateur qui choisit.

---

## 14. Services

| Service | Fichier | Responsabilité |
|---|---|---|
| `store` | `services/store.js` | localStorage, migration de version |
| `leitner` | `services/leitner.js` | Boîtes, dates, file de révision |
| `contentLoader` | `services/content-loader.js` | Manifeste, chargement paresseux, validation |
| `discoveryBuilder` | `services/discovery-builder.js` | File de découverte, traitement *connais / connais pas* |
| `quizBuilder` | `services/quiz-builder.js` | Compose le quizz (§03) et applique ses verdicts |
| `learnBuilder` | `services/learn-builder.js` | Compose QUIZ + écriture pour les mots dus |
| `gameBuilder` | `services/game-builder.js` | Tire les parties de §04 et §05, applique la partition |
| `storyBuilder` | `services/story-builder.js` | Choisit l'histoire du jour, calcule la couverture |
| `writingBuilder` | `services/writing-builder.js` | Compose dictée, traduction et rédaction (§08) |
| `videoBuilder` | `services/video-builder.js` | Découpe, mélange, suit l'avancement et compose le quizz d'une conférence (§10) |
| `normalize` | `services/normalize.js` | Normalisation unique des réponses (§15.5) |
| `audio` | `services/audio.js` | Synthèse vocale — l'application parle |
| `speech` | `services/speech.js` | Reconnaissance vocale — l'application écoute (§15.8) |
| `api` | `services/api.js` | **Unique** point d'appel réseau |
| `router` | `services/router.js` | Navigation par hash |

**Supprimé en v4 :** `services/challenge-builder.js`.

**Règle :** toute la logique métier vit dans les services. Les écrans
orchestrent, les composants affichent.

### `gameBuilder` — algorithme

```
1. connus = words.filter(w => w.b >= 3)
2. si connus.length < 5 → { verrouille: true, raison: "pas assez de mots connus" }
3. candidates = parties du jeu demandé dont TOUS les mots sont dans connus
4. retirer celles déjà dans progression.parties_servies[jeu]
5. si vide → vider parties_servies[jeu] et reprendre en 3
6. retourner une partie au hasard parmi les candidates
```

Il ne **génère** jamais de grille : il sélectionne (§17 règle 9).

### `storyBuilder` — algorithme

```
1. connus = words.filter(w => w.b >= 3)
2. pour chaque histoire non lue : couverture = |lexique ∩ connus| / |lexique|
3. arc en cours ? privilégier sa continuation à couverture égale
4. si max(couverture) >= 0.95 → servir cette histoire
5. sinon si en ligne → demander une génération à l'API (§16)
6. sinon → servir la meilleure disponible en affichant sa couverture réelle
```

---

## 15. Spécifications d'interaction

### 15.1 Saisie dans le codeword

- **La grille est vide à l'ouverture.** Aucune case pré-remplie, aucune lettre
  offerte. Toutes les cases sont en `state: "empty"` avec leur chiffre visible.
- Le **clavier reste affiché en permanence**. Il ne se masque jamais.
- L'utilisateur **sélectionne une case**, puis **tape une lettre**.
- Toutes les cases portant le **même chiffre** se remplissent simultanément
  dans la grille entière, phrase cachée comprise.
- Le focus avance à la case vide suivante du mot ; si le mot est complet, au mot
  suivant.
- Une lettre déjà attribuée à un autre chiffre est **désactivée** sur le clavier
  (`disabledKeys`) : visible, grisée, non cliquable.
- Retour arrière : vide toutes les cases du chiffre courant.

**Le point d'entrée est l'indice, pas une lettre.** L'utilisateur lit un indice,
reconnaît le mot parce qu'il l'a appris, et le tape. C'est la seule façon de
démarrer, et c'est voulu : le jeu teste le vocabulaire, pas la logique.

Si l'utilisateur reste bloqué, le système d'aide (§15.7) révèle une lettre —
mais le mot concerné ne monte alors pas de boîte (§4.1).

### 15.2 Saisie dans les mots croisés

- Même clavier, même composant `Tile`.
- L'utilisateur sélectionne un mot dans `ClueList`, ou tape directement une case.
- Le focus suit la direction du mot sélectionné (H ou V).
- Une case au croisement de deux mots appartient aux deux : la lettre saisie
  s'affiche dans les deux sens.
- Les cases hors mots ont `state: "block"`.

### 15.3 Validation et erreurs

- **Aucun refus immédiat.** L'utilisateur peut se tromper et corriger librement.
- La vérification se déclenche **quand un mot est complet**, pas à chaque lettre.
- Mot correct → `state: "revealed"`, verrouillé, animation de succès.
- Mot incorrect → `state: "error"` sur le mot entier pendant 600 ms, puis retour
  à `filled`. Les cases restent modifiables.
- Dans le codeword, un chiffre validé par un mot correct est verrouillé partout.

### 15.4 Tap-to-translate

| Action | Effet |
|---|---|
| Tap sur un mot de l'indice | Traduction affichée. **Rien n'est enregistré.** |
| Tap sur `+` | Le mot entre en file de découverte |

Consulter est gratuit et illimité. Ajouter est délibéré.
**Plafond : 3 ajouts par partie.**

Un mot ajouté pendant une grille ne peut pas être inséré dans la session en
cours : il va en file d'attente et sera découvert à la session suivante.

Toutes les traductions sont **pré-calculées** dans `indice.segments`. Aucun appel
réseau pendant le jeu.

### 15.5 Tolérance de saisie

Toute comparaison de réponse passe par `services/normalize.js` :

```js
export function normalize(str) {
  return str.trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}
```

- Insensible à la casse et aux accents
- **Aucune autre tolérance.** Pas de correction orthographique, pas de distance
  de Levenshtein : une faute d'orthographe en anglais est une erreur.
- Les réponses multiples acceptées sont listées explicitement dans le contenu
  (`fr_alt: ["carte","menu"]`), jamais devinées.

### 15.6 Icônes

- **SVG inline**, dans `components/atoms/icons.js`, export d'un objet `ICONS`.
- Style : trait seul, `stroke: currentColor`, `stroke-width: 2`, `fill: none`,
  viewBox `0 0 24 24`.
- Taille par CSS (`width: 1em`), couleur héritée.
- **Aucun CDN, aucune police d'icônes, aucun emoji.**

### 15.7 Système d'aide

Deux aides, de nature très différente.

**Le tap-to-translate est illimité** (§15.4). Lire la traduction d'un mot dans
un indice ou une histoire ne coûte rien : c'est de la lecture, pas de la triche.

**La révélation de lettre est comptée : trois par partie de grille.**

- Le bouton révèle la lettre de la case active, ou de la première case vide
  d'un mot non résolu.
- Comme toute saisie, la lettre se propage à toutes les cases du même chiffre.
- Le compteur s'affiche sur le bouton, qui se désactive à zéro.
- **Le mot aidé ne monte pas de boîte** (§5, signal de maîtrise).

Pourquoi trois et pas plus : sur cinq mots, trois lettres suffisent à débloquer
un départ mais jamais à finir la grille. Une aide illimitée transformerait le
jeu en exercice de recopie.

---

### 15.8 Dicter au lieu d'écrire

Partout où l'application demande d'écrire — §01, §04 et les trois modes de
§08 — un bouton micro permet de **dire** la réponse.

C'est en §01 que la voix sert le plus : on y capture un mot entendu dans la
vraie vie, souvent sans savoir l'écrire. Devoir l'orthographier pour pouvoir le
traduire est exactement l'obstacle qu'on veut lever.

**La voix remplit le champ, elle ne valide jamais.** Un francophone qui parle
anglais sera parfois mal transcrit ; valider directement la transcription
sanctionnerait sa prononciation en prétendant juger son orthographe. Il corrige
donc le texte avant de valider s'il le faut.

En rédaction libre, la voix **ajoute** au texte au lieu de le remplacer : un
paragraphe déjà écrit ne doit pas disparaître au premier essai de dictée.

Trois limites, portées par `services/speech.js` :

| Limite | Conséquence |
|---|---|
| La transcription passe par le réseau sur la plupart des navigateurs | c'est, avec la traduction, la seule fonction qui sort de l'appareil |
| Le micro demande une autorisation | refusée, le message le dit — l'exercice reste faisable au clavier |
| Tous les navigateurs ne savent pas transcrire | le bouton n'apparaît simplement pas, aucune fonction ne disparaît |

### 15.9 Pas de zoom au double-tap

`touch-action: manipulation` est posé sur `html`, `body` et tous les éléments
qu'on tape en rafale.

Sans cela, taper deux fois de suite la **même touche** du clavier — « n » puis
« n » — est interprété comme un double-tap et fait zoomer l'écran au lieu
d'écrire la lettre. Le mot devient impossible à saisir.

**On n'écrit pas `user-scalable=no`** dans la balise viewport. Cet attribut
interdirait aussi le **pincement**, et on ne retire pas le zoom aux gens qui en
ont besoin pour lire. `manipulation` supprime le double-tap et le délai de
300 ms qui l'accompagne, en laissant le pincement intact.

---

## 16. API externe

**Un seul appel dans toute l'application : la traduction en saisie manuelle.**

```
App → fonction Vercel → Gemini → App
```

La clé n'est **jamais** dans le code client.

```json
// requête
{ "texte": "She was reluctant to admit her mistake." }

// réponse
{
  "phrase_fr": "Elle était réticente à admettre son erreur.",
  "mots": [
    { "en": "reluctant", "fr": "réticent", "type": "adj",
      "phonetique": "/rɪˈlʌk.tənt/", "rang_freq": 847,
      "ambigu": false, "confiance": 0.95 }
  ]
}
```

### Fiabilité

1. **Traduire la phrase, pas le mot.** Le contexte force le bon sens.
2. **Vérification de sens dans le même appel.** Le modèle retraduit mentalement
   sa proposition vers l'anglais, hors contexte ; s'il ne retombe pas sur le mot
   d'origine, il lève `ambigu: true`.
3. **Confirmation utilisateur en 1 tap** avant enregistrement.

**Un seul appel, et c'est une contrainte de temps, pas d'élégance.** La v4
faisait deux appels séquentiels — traduction, puis rétro-traduction — pour ne
poser qu'un booléen. Mesuré sur le service déployé : **14 à 19 secondes**. La
réponse ne porte plus non plus `def_en`, `confiance`, `phrasal` ni `retro`, que
personne ne lisait : chaque champ de trop est du texte à générer, donc de
l'attente.

Champs réellement consommés par le client : `en`, `fr`, `type`, `phonetique`,
`rang_freq`, `ambigu`. Rien d'autre ne doit être demandé au modèle.

Si `rang_freq` dépasse largement le palier courant, afficher :
*« Ce mot est au palier 17, tu es au palier 2. »*

### Génération d'une histoire

Second appel, **facultatif**, déclenché seulement quand le stock hors ligne ne
propose aucune histoire couverte à 95% (§6.5).

```json
// requête
{
  "type": "histoire",
  "mots": ["water","night","learn","table","money"],
  "arc": { "id": "marta", "resume_en": "Marta has just moved to a new town." },
  "longueur": 300
}

// réponse
{
  "titre_en": "The Letter",
  "titre_fr": "La lettre",
  "texte_en": "Marta opened the door…",
  "texte_fr": "Marta ouvrit la porte…",
  "hors_lexique": ["envelope","stamp"]
}
```

Contraintes envoyées au modèle : n'employer que les mots fournis plus les
mots-outils, rester entre 250 et 350 mots, et lister explicitement tout mot
sorti du lexique.

**La longueur demandée n'est pas la longueur obtenue.** Mesuré en production :
244, 248, 256 puis 267 mots pour une page demandée — une distribution centrée
sur ~254, qui chevauche le plancher. Gonfler la cible de 40 mots n'a rien
décalé (248/256 en demandant 300, puis 244/267 en demandant 340) : le modèle ne
suit pas cette consigne, inutile de la gonfler. On continue donc à lui demander
250–350, et c'est le client qui **tolère à partir de 220 mots** — refuser 244
revenait à jeter une histoire parfaitement lisible derrière un message d'erreur
générique. Pas de second appel pour rallonger un texte trop court : le quota
gratuit s'épuise dès le troisième (`429 RESOURCE_EXHAUSTED`).

L'histoire reçue est enregistrée dans le state avec `source: "api"` pour ne pas
être re-générée. **Elle n'est jamais écrite dans `/content`** : le contenu livré
reste figé et vérifié hors ligne.

Si l'appel échoue, `storyBuilder` sert la meilleure histoire du stock en
affichant sa couverture réelle. L'application ne reste jamais sans histoire.

### Transcription d'une conférence

Troisième contrat, **sans Gemini** : c'est une lecture de page. Il fonctionne
donc même si la clé est en panne.

```json
// requête
{ "type": "transcription",
  "lien": "https://www.ted.com/talks/… ou https://youtu.be/…" }

// réponse
{
  "slug": "kelly_mcgonigal_how_to_make_stress_your_friend",
  "titre": "How to make stress your friend",
  "video": "https://py.tedcdn.com/…/…-1200k.mp4",
  "hls": "https://hls.ted.com/project_masters/8688/manifest.m3u8",
  "duree": 848,
  "phrases": [{ "i": 0, "debut": 0.8, "fin": 5.0,
                "texte": "I have a confession to make." }],
  "source": "https://www.ted.com/talks/…",
  "licence": "CC BY-NC-ND 4.0 — TED"
}
```

Les blocs de sous-titres de TED sont des **lignes d'affichage**, pas des
phrases : « In the past year, » et « I want you to just raise your hand »
arrivent séparément. Le serveur les recompose jusqu'à une ponctuation finale,
**entre 3 et 16 mots** — au-delà la remise en ordre devient infaisable, en
dessous il n'y a rien à remettre dans l'ordre.

Un lien mal formé rend **400** avec son motif, pas 502 : c'est une erreur de
saisie, pas une panne de passerelle.

### Contenu pré-généré

Tout le reste — mots, indices, segments, phrases — est produit et **vérifié
hors application**. La vérification des sens ambigus (*right, just, mean, get,
run, set, still, like*) est faite à la production, jamais déléguée à
l'utilisateur.

Exigence sur les indices : **périphrases**, pas des définitions de dictionnaire.

- ✅ *« You drink it when you are thirsty »*, *« The Oprah Winfrey ___ »*
- ❌ *« a colourless liquid »*, *« a television programme »*

Les indices doivent être **longs et riches** : chaque mot tappable est une
occasion d'apprentissage.

---

## 17. Règles anti-duplication

1. **Aucun composant hors de l'inventaire §12.** Un besoin non couvert → ajouter
   le composant au README d'abord.
2. **Aucun `<button>`, `<input>` ou case-lettre brut** dans un écran.
3. **Aucune valeur visuelle en dur.** Uniquement `tokens.css`.
4. **Une seule instance de `Keyboard`** dans le DOM.
5. **Un composant ne touche jamais au store.**
6. **Toute logique métier dans `/services`.**
7. **Un seul point d'appel réseau** : `services/api.js`.
8. **Un seul format de date** : ISO `YYYY-MM-DD`.
9. **Aucune génération de grille dans le navigateur.** Jamais.
10. **Avant de créer quoi que ce soit, chercher si ça existe déjà** dans §12.

---

## 18. Roadmap

L'application v3 est fonctionnelle. Cette roadmap décrit le passage à v4.

| # | Étape | Livrable | État |
|---|---|---|---|
| 1 | Tokens, atoms, molecules, organisms existants | catalogue de composants | ✅ acquis |
| 2 | `store`, `leitner`, `contentLoader`, export/import | moteur testable | ✅ acquis |
| 3 | Contenu : 20 paliers, 1000 mots, phrases, parties | `/content` complet | ✅ acquis |
| 4 | `CodewordBoard`, `CrosswordBoard` | les deux plateaux | ✅ acquis |
| 5 | `ManualAdd` + Gemini | capture de vocabulaire | ✅ acquis |
| 6 | **Retrait du défi quotidien** | `challenge.js`, `challenge-builder.js`, `ChallengeSummary`, `defis_faits`, `streak` supprimés | ✅ |
| 7 | **Migration state v3 → v4** | statuts, `parties_servies`, délai boîte 1 à 2 jours | ✅ |
| 8 | **Home en six sections** | tableau de bord + `SectionCard` | ✅ |
| 9 | **§02 Découverte** | `discovery.js` + `discoveryBuilder` | ✅ |
| 10 | **§03 Apprendre** | `learn.js` + `learnBuilder` (QUIZ puis écriture) | ✅ |
| 11 | **Générateur v4** | contrainte inversée, `jeu` grille/croisés, régénération complète | ✅ |
| 12 | **§04 et §05** | `codeword.js`, `crossword.js`, `gameBuilder`, grille vide | ✅ |
| 13 | **Contenu histoires** | `/content/histoires/`, trois arcs | ✅ 7 histoires |
| 14 | **§06 Histoire du jour** | `story.js`, `storyBuilder`, `StoryReader` | ✅ |
| 15 | **Secours API histoire** | second contrat dans `api.js` et `api/translate.js` | ✅ |
| 16 | **Quizz, porte unique** | `quiz.js`, `quizBuilder`, statuts découplés de la boîte | ✅ |
| 17 | **Listes consultables** | `WordList` : ajouts (§01), suivi d'apprentissage (§04) | ✅ |
| 18 | **Indices de grille** | 3 lettres par partie, le mot aidé ne monte pas | ✅ |
| 19 | **Traduction accélérée** | un seul appel Gemini au lieu de deux | ✅ |
| 20 | **§08 Écrire** | corpus Tatoeba, dictée, traduction, rédaction | ✅ |
| 21 | **Blocs** | 50 rédigés dans `content/blocs/`, pas encore branchés | ⚠️ contenu seul |
| 22 | **§09 Verbes irréguliers** | `content/verbes.json` livré, carte sur l'accueil | ✅ |
| 23 | **Saisie vocale** | `speech.js`, micro dans §04 et §08 | ✅ |
| 24 | **Zoom au double-tap** | `touch-action: manipulation` | ✅ |
| 25 | **§10 Vidéo** | contrat `transcription`, `VideoPlayer`, deux jeux | ✅ |
| 26 | **Repli HLS** | mp4 vérifié côté serveur, hls.js à la demande | ✅ |
| 27 | **Synchro des phrases** | flux sans générique préféré au mp4 (3,5 s de décalage) | ✅ |
| 28 | **Réessayer / passer** | une phrase ratée ne défile plus toute seule (§10) | ✅ |
| 29 | **Quizz de conférence** | 8 questions hors ligne, ouvert après visionnage complet (§10) | ✅ |
| 30 | **Dictées cumulées** | « Écrire » ne se verrouille plus au changement de palier (§6.7) | ✅ |
| 31 | **Verbes dans Découverte** | §09 supprimée ; les 15 irréguliers absents des 1000 mots rejoignent le catalogue | ✅ |

### Où en est le contenu

| | Volume | Limite |
|---|---|---|
| Mots | 1000, 20 paliers | complet |
| Parties | **167 sur 200** | 20 blocs contiennent un mot de plus de 8 lettres, donc hors grille (§6.1) ; 13 ne trouvent aucune phrase compatible |
| Phrases cachées | 592 | le facteur limitant reste le nombre de phrases **pauvres en lettres distinctes** |
| Histoires | 7, en trois arcs | lisibles à 95% dès les paliers 2, 4, 8, 11, 15, 16 et 19 |

Le stock d'histoires couvre tous les niveaux, mais à raison d'une par jour il
s'épuise en une semaine : au-delà, la section §06 bascule sur le secours API.

### Écrire une histoire

Le vocabulaire employé décide de qui pourra la lire. `tools/contenu/verifier-histoire.mjs`
compare un brouillon à un plafond de palier et liste les mots qui dépassent :

```
node tools/contenu/verifier-histoire.mjs histoires/lea-01.txt 2
```

Puis `node tools/contenu/construire-histoires.mjs` recalcule lexique,
`hors_lexique` et longueur. **Le lexique est toujours recalculé, jamais saisi** :
les formes fléchies sont ramenées à leur lemme, sinon « went » compterait comme
inconnu pour un lecteur qui connaît « go », et la couverture serait fausse.

---

## 19. Hors périmètre v1

Décidé, mais **reporté**. Ne pas coder, ne pas prévoir de place dans
l'interface.

| Fonctionnalité | Ce que c'est |
|---|---|
| **Îlots** | Construction de phrases par niveaux successifs sur un sujet choisi, méthode *Fluent Forever* |
| **Chunks** | Blocs de langage préassemblés (*How are you*, *I would like to*) |
| **Alphamo** | Troisième jeu, mécanique à définir |
| **Thème sombre** | Prévu par les tokens, à activer plus tard |
| **Synchronisation** | Multi-appareils |
| **Défi quotidien** | Retiré en v4. Ne pas le réintroduire sans mise à jour de ce README. |

**Entré dans le périmètre en v4 :** la *lecture quotidienne*, qui figurait ici
en v3, devient la section §06 « Histoire du jour ».

Ces éléments sont documentés ici pour mémoire. Toute demande de les implémenter
doit passer par une mise à jour de ce README.

---

## 20. Points ouverts

Décisions prises par défaut lors de la rédaction de la v4, à confirmer.

| # | Point | Décision provisoire |
|---|---|---|
| 1 | Boîte d'entrée d'un mot marqué *je connais* | boîte 3, éligible aux jeux immédiatement |
| 2 | Seuil d'entrée dans les jeux et les histoires | boîte 3 |
| 3 | Partition grille / mots croisés | par partie (`jeu`), remise à zéro quand un jeu a épuisé son vivier |
| 4 | Longueur d'une histoire | 250 à 350 demandés, 220 acceptés |
| 5 | Couverture minimale d'une histoire | 95% du lexique déjà connu |
| 6 | Verbes irréguliers | fondus dans le catalogue, §09 supprimée. Les phrasal verbs restent sans entrée |
| 7 | Streak | supprimé avec le défi quotidien. Faut-il le rattacher à l'histoire du jour ? |

Questions restées sans réponse :

- Combien d'arcs d'histoires faut-il écrire pour couvrir les 20 paliers ?
- `Progress` : quel niveau de détail maintenant qu'il n'y a plus de streak ?
- Les paliers thématiques (21+) : combien de thèmes, et lesquels ?
