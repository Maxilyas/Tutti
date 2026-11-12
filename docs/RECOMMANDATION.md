# Tutti — Puzzle musical

**Recommandation technique, design et plan de mise en œuvre (100 % gratuit)**

> Document de cadrage rédigé à partir du croquis « Puzzle musical » et du message de présentation du projet.
> Il sert de base de discussion avec l'équipe artistique, puis de cahier des charges pour l'implémentation.

---

## Sommaire

0. [Résumé](#0-résumé)
1. [Ce que j'ai compris du projet](#1-ce-que-jai-compris-du-projet)
2. [Points à clarifier et incohérences repérées](#2-points-à-clarifier-et-incohérences-repérées)
3. [Règles du jeu proposées](#3-règles-du-jeu-proposées-spécification-fonctionnelle)
4. [Conception des énigmes](#4-conception-des-énigmes-game-design)
5. [Architecture technique](#5-architecture-technique)
6. [Design UX / UI](#6-design-ux--ui)
7. [Musique et scène](#7-musique-et-scène)
8. [Réseau et matériel le jour J](#8-réseau-et-matériel-le-jour-j)
9. [Tests et répétitions](#9-tests-et-répétitions)
10. [Plan d'implémentation](#10-plan-dimplémentation)
11. [Coûts](#11-coûts)
12. [Questions à poser à l'équipe artistique](#12-questions-à-poser-à-léquipe-artistique)

---

## 0. Résumé

| Sujet | Recommandation |
|---|---|
| **Type d'appli** | **Web app** (pas d'appli à installer) : le public scanne un QR code et joue dans son navigateur. iOS et Android, aucun store, aucun compte. |
| **Langage** | **TypeScript** côté client et serveur (un seul langage, types partagés). |
| **Interface** | **Svelte 5 + Vite** : très léger (important avec une 4G faible dans une salle), simple à lire et à maintenir. |
| **Temps réel / serveur** | **Cloudflare Workers + Durable Objects** (offre gratuite) avec la librairie **PartyServer / PartySocket** : un « salon de jeu » unique qui garde l'état de la partie, gère les chronos et diffuse en WebSocket à tous les écrans. |
| **Hébergement** | Gratuit sur `*.workers.dev`, HTTPS inclus, pas de mise en veille, déploiement en une commande. |
| **Plan de secours** | Le même code tourne **en local sur l'ordinateur de régie** (réseau Wi‑Fi de la salle), plus un **mode manuel** piloté par la régie si le réseau tombe. |
| **Écrans** | 4 vues d'une même appli : **Joueur** (smartphone), **Grand écran** (public), **Retour musiciens** (face à la scène), **Régie** (pilotage). |
| **Design** | Interface sombre (salle de concert), 6 couleurs **+ un symbole par couleur** (daltonisme), très gros caractères, clignotements ≤ 3 par seconde. |
| **Point de game design critique** | Les énigmes d'exemple ont **plusieurs solutions possibles**. Il faut soit **montrer la silhouette** de la figure au public, soit ajouter des indices « absolus » (ligne, colonne, registre). Voir §4. |
| **Coût** | **0 €** de logiciel. Seuls frais éventuels : adhésif de marquage au sol, chasubles de couleur, impression des QR codes. |

---

## 1. Ce que j'ai compris du projet

### 1.1 Le concept

- Performance musicale contemporaine en forme de **puzzle** : les musicien·ne·s sont les **pions**, le public est le **joueur**.
- Au sol, une **grille 5×5** : lignes **A → E**, colonnes **1 → 5** (cases A1 … E5).
- **1 musicien·ne = 1 couleur** (vêtement). Le croquis en montre **6** : rouge, jaune, violet, orange, vert, bleu.
- Le public est réparti en **équipes, une par couleur**. Chaque équipe dispose d'une **phrase-énigme** et vote sur smartphone pour la case où doit aller « son » musicien.
- Objectif : reconstituer une **figure cible prédéfinie**.
- Chaque manche se déroule en 3 temps : **vote → affichage → déplacement** (le déplacement fait « muter » la texture sonore).
- Retour visuel : **erreur = la case clignote dans la couleur de l'équipe**, **bonne réponse = la case se grise**, et le musicien ne bouge plus jusqu'à la fin.
- Musique : chaque case correspond à une **boucle** et à une **tessiture** différentes.
- Notes du croquis : « Décision à l'écran toutes les **15 secondes** », « 1 équipe = une énigme ».
- Jauge : **50 à 100 participants**.

### 1.2 Lecture du croquis

**Figure cible** (grande grille) :

```
        1        2        3        4        5
A  (aigu)   .     ROUGE      .        .        .
B           .       .      JAUNE      .        .
C (medium) VIOLET   .        .        .        .
D           .       .        .        .      ORANGE
E (grave)   .      VERT     BLEU      .        .
```

→ Rouge **A2** · Jaune **B3** · Violet **C1** · Orange **D5** · Vert **E2** · Bleu **E3**

**Position initiale** (petite grille en bas à gauche, *lecture à confirmer*) :
Bleu A3 · Orange A5 · Vert B4 · Jaune C2 · Rouge D4 · Violet E1 (aucun pion ne démarre sur sa case cible, c'est bien).

**Énigmes d'exemple** : toutes sont **vraies** pour la figure cible :

| Énigme | Vérification sur la figure |
|---|---|
| Le bleu doit être à côté du vert | E3 touche E2 ✔ |
| Le jaune se trouve à 3 cases du bleu | B3 → E3 = 3 cases en ligne droite ✔ |
| Le rouge doit être plus haut que le vert | A2 est au-dessus de E2 ✔ |
| Le violet veut être seul | C1 n'a aucun voisin ✔ |
| L'orange veut être seul | D5 n'a aucun voisin ✔ |
| Le vert doit être à côté du bleu | E2 touche E3 ✔ |

---

## 2. Points à clarifier et incohérences repérées

Ces points changent la conception. Ils sont à trancher **avant** de développer.

### 2.1 Tessiture : par ligne ou par colonne ?

- **Le croquis** place la flèche *Aigu → Medium → Grave* sur l'**axe vertical** : la **ligne** (A…E) donne la tessiture.
- **Le message** dit l'inverse : « une boucle par ligne et une tessiture par colonne ».

➡️ À trancher. L'appli rendra ce choix **paramétrable**. Par défaut, on suit le croquis : **ligne = tessiture** (A aigu → E grave), **colonne = boucle** (1 → 5). C'est aussi plus intuitif : « plus haut » sur l'écran = plus aigu.

### 2.2 Les énigmes ont plusieurs solutions

« Le bleu doit être à côté du vert » est vrai pour des dizaines de positions. Si l'appli valide **une case exacte** (celle de la figure), le public ne peut pas la **déduire** : il ne peut que la **deviner**. Résultat probable : frustration et partie très longue.

Deux façons de corriger (détails au §4) :

1. **Montrer la silhouette** de la figure (les 6 cases cibles, sans les couleurs). Les énigmes servent alors à savoir **quelle couleur va où**. Avec la silhouette, les énigmes d'exemple résolvent **presque** toute la figure : il manque **un seul indice** pour départager violet et orange.
2. **Écrire des énigmes « ancrées »** (ligne, colonne, registre, bord, coin) qui désignent une case unique.

### 2.3 Le vocabulaire des énigmes doit être défini

« À côté », « à 3 cases », « seul », « plus haut » peuvent être compris de plusieurs façons. Proposition de **lexique officiel**, affiché dans l'aide de l'appli :

| Mot | Définition proposée |
|---|---|
| **à côté de** | la case touche par un **côté** (haut, bas, gauche, droite ; pas en diagonale) |
| **à N cases de** | N cases **en ligne droite** (même ligne ou même colonne) |
| **seul** | aucune des **8 cases autour** n'est occupée (diagonales comprises) |
| **plus haut / plus bas** | sur une **ligne** au-dessus / en dessous (= plus aigu / plus grave) |
| **à gauche / à droite** | dans une **colonne** avant / après |
| **dans l'aigu / le medium / le grave** | ligne A / C / E (B et D = « medium-aigu » et « medium-grave ») |

### 2.4 Autres décisions à prendre

- **Collisions** : deux équipes votent pour la même case, ou une équipe vote pour une case déjà occupée. Une règle est proposée au §3.4.
- **Déplacement même en cas d'erreur** : on suppose que **oui**. Le musicien va sur la case votée même si elle est fausse : c'est ce qui fait évoluer le son à chaque manche.
- **Équipes qui ont trouvé** : que font leurs membres ensuite ? Proposition au §3.8.
- **Durée visée** de la performance : elle détermine la difficulté des énigmes et le nombre de « tableaux ».
- **Énigmes visibles par tous ou seulement par l'équipe concernée** (§4.4).

---

## 3. Règles du jeu proposées (spécification fonctionnelle)

### 3.1 Rôles et écrans

| Vue | Appareil | URL indicative | Rôle |
|---|---|---|---|
| **Joueur** | smartphone du public | `/` | rejoindre une équipe, lire l'énigme, voter |
| **Grand écran** | ordinateur + vidéoprojecteur | `/ecran` | QR code d'accès, grille, chronos, état des équipes |
| **Retour musiciens** | écran ou TV face à la scène | `/scene` | où aller, quand bouger, quelle boucle et quel registre jouer |
| **Régie** | ordinateur ou tablette (code PIN) | `/regie` | lancer, mettre en pause, corriger, donner des indices, superviser |

### 3.2 Cycle d'une manche (machine à états)

```
 ┌────────┐ lancement ┌────────┐ fin chrono ┌───────────┐ fin chrono ┌─────────────┐
 │ ACCUEIL│──────────▶│  VOTE  │───────────▶│ AFFICHAGE │───────────▶│ DÉPLACEMENT │
 └────────┘           └────────┘            └───────────┘            └──────┬──────┘
                          ▲                                                 │
                          │            il reste des pions à placer          │
                          └─────────────────────────────────────────────────┤
                                                                            │ tous placés
                                                                            ▼
            PAUSE (depuis n'importe quel état, via la régie)          ┌──────────┐
                                                                      │  FINAL   │
                                                                      └──────────┘
```

| Phase | Durée par défaut | Ce qui se passe |
|---|---|---|
| **Vote** | 15 s (cf. croquis) | Chaque équipe non résolue vote pour une case. On peut changer d'avis jusqu'à la fin du chrono. |
| **Affichage** | 5 s | Pour chaque équipe : case retenue + flèche depuis la position actuelle. **Grisé** si c'est juste, **clignotement** si c'est faux. |
| **Déplacement** | 10 s | Les musiciens rejoignent leur case et changent de boucle et de registre : la texture sonore mute. |

→ Environ **30 s par manche**. Durées **réglables en direct** depuis la régie. Option : les exprimer **en mesures** pour qu'elles tombent en rythme (§7.2).

Toutes les équipes votent **en même temps** à chaque manche (plutôt qu'un pion après l'autre). C'est plus dynamique et le son mute davantage.

### 3.3 Dépouillement du vote (par équipe)

1. Un appareil = une voix par manche. On peut la modifier pendant la phase de vote ; seule la dernière compte.
2. Les **cases verrouillées** (pions déjà bien placés) ne sont **pas votables**.
3. La case retenue est celle qui a **le plus de voix**.
4. **Égalité** : tirage au sort entre les cases ex æquo.
5. **Aucun vote** : le pion reste sur place.

### 3.4 Résolution des conflits

| Situation | Règle |
|---|---|
| Deux équipes visent **la même case libre** | L'équipe avec **le plus de voix** l'obtient, puis celle avec le plus fort **pourcentage de son équipe**, puis tirage au sort. L'autre pion **reste sur place**, avec la mention « case disputée ». |
| Une équipe vise une case **occupée par un pion qui ne bouge pas** (et non verrouillé) | **Échange** : les deux musiciens permutent. Simple à exécuter sur scène et jamais bloquant. Désactivable. |
| Chaînes et cycles (A va chez B, B chez C, C chez A) | Tout le monde bouge. L'algorithme traite les déplacements par ordre de force du vote ; il est déterministe et couvert par des tests. |

### 3.5 Validation et verrouillage

- **Mode recommandé : « case exacte »**. Un pion est **juste** si sa case après déplacement est **sa case cible**. Il est alors **verrouillé** et sa case est grisée.
- Un pion déplacé par un échange qui tombe sur sa cible est aussi verrouillé (coup de chance assumé).
- *Option future : mode « contraintes ».* Un pion est validé dès que son énigme est vraie. Plusieurs figures finales deviennent possibles, donc chaque représentation est différente. Plus ouvert, mais la figure finale n'est plus maîtrisée par la composition.

### 3.6 Retour visuel (bon ou mauvais choix)

| Événement | Grand écran / retour | Smartphone de l'équipe |
|---|---|---|
| **Juste** | La case **se grise** et affiche un cadenas. Un liseré de la couleur reste visible pour savoir qui est là. | « Bravo ! » plein écran, puis la case grisée avec un cadenas. |
| **Faux** | La case **pulse dans la couleur de l'équipe** pendant l'affichage (≤ 2 pulsations/s). | Pulsation, puis la case reste marquée **✕** dans l'**historique** de l'équipe, pour ne pas revoter la même erreur. |
| **Case disputée / perdue** | Icône ⚔ sur la case | « Une autre équipe a pris cette case » |

L'**historique des cases déjà essayées** (✕) n'est visible que sur les téléphones de l'équipe. C'est l'aide la plus efficace et la moins intrusive.

### 3.7 Indices progressifs (contre le blocage)

Paramétrables dans le scénario et déclenchables à la main depuis la régie :

| Après N échecs | Indice |
|---|---|
| 3 | **Indice texte** complémentaire prévu par l'équipe artistique (ex. « Le vert joue dans le grave »). |
| 5 | **Chaud / froid** affiché après chaque vote (brûlant / tiède / froid selon la distance à la cible). |
| 7 | **2 cases candidates** surlignées sur le téléphone de l'équipe. |

### 3.8 Équipes résolues, fin de partie, tableaux

- **Équipe résolue** : ses membres reçoivent la proposition « **Aider une autre équipe** » (renfort), sinon ils passent en mode spectateur avec la grille complète. Cela garde tout le monde actif jusqu'au bout.
- **Équipe vide** (personne n'a rejoint une couleur) : la régie peut placer ce pion à la main ou l'activer en « pilote automatique ».
- **Fin** : quand tous les pions sont verrouillés, la phase FINAL affiche la figure complète. C'est le *tutti* musical.
- **Tableaux successifs** (option) : plusieurs figures à la suite, comme les **mouvements** d'une pièce. La figure finale d'un tableau devient la position de départ du suivant. C'est la façon la plus naturelle d'allonger la performance.
- **Temps limite** (option) : au-delà de X minutes, la régie peut révéler les pions restants un par un.

### 3.9 Constitution des équipes

Deux modes, tous deux gratuits et sans compte :

| Mode | Fonctionnement | Quand l'utiliser |
|---|---|---|
| **QR unique + répartition automatique** (défaut) | Chaque nouvel arrivant rejoint l'équipe qui a le moins de membres. | Placement libre dans la salle. |
| **Un QR par couleur** | Zones de sièges colorées, chacune avec son QR (`/?equipe=bleu`). | Si on peut regrouper physiquement les équipes. Bien mieux pour discuter entre voisins. |

L'équipe est mémorisée sur le téléphone : un rechargement de page ou une mise en veille ne fait pas changer d'équipe.

---

## 4. Conception des énigmes (game design)

### 4.1 Le principe : un graphe de dépendances

Une bonne grille d'énigmes a :

- des **ancres** : énigmes absolues, résolubles seules (« le violet joue dans le medium, collé au bord gauche » → C1) ;
- des **énigmes relatives** qui s'appuient sur des pions **déjà verrouillés** (« le vert est le voisin de gauche du bleu »).

Les équipes « ancres » trouvent vite, ce qui débloque les autres : la partie a une **progression dramatique**, et la musique se stabilise par couches successives.

### 4.2 Option A — Montrer la silhouette (recommandé)

On affiche les **6 cases cibles en pointillés** (sans couleur) sur tous les écrans. Le raisonnement avec les énigmes d'exemple :

1. Dans la silhouette, la **seule paire de cases qui se touchent** est E2–E3, donc {bleu, vert} = {E2, E3}.
2. « Le jaune à **3 cases en ligne droite** du bleu » : seul B3–E3 convient, donc **bleu = E3**, **vert = E2**, **jaune = B3**.
3. « **Seul** » (diagonales comprises) : A2 touche B3 en diagonale, donc violet et orange vont en **C1 et D5**, et **rouge = A2** (cohérent avec « plus haut que le vert »).
4. ⚠️ **Violet / orange restent interchangeables**. Il faut ajouter un indice, par exemple : *« Le violet joue dans le **medium** »* (ligne C).

Avec ce seul ajout, la figure du croquis a **une solution unique**, en gardant les énigmes d'origine.

### 4.3 Option B — Silhouette cachée : énigmes ancrées

Exemple réécrit pour la même figure, avec une solution unique et des dépendances progressives :

| Pion | Énigme | Dépend de | Niveau |
|---|---|---|---|
| Violet (C1) | « Le violet joue dans le medium, collé au bord gauche. » | — | ancre |
| Bleu (E3) | « Le bleu est dans le grave, pile au centre. » | — | ancre |
| Orange (D5) | « L'orange est contre le bord droit, juste au-dessus du grave. » | — | ancre |
| Vert (E2) | « Le vert est le voisin de gauche du bleu. » | bleu | 2 |
| Jaune (B3) | « Le jaune est 3 cases au-dessus du bleu. » | bleu | 2 |
| Rouge (A2) | « Le rouge est tout en haut, dans la colonne du vert. » | vert | 3 |

### 4.4 Énigmes privées ou publiques ?

- **Privées** (chaque équipe ne voit que la sienne) : plus de mystère, mais les équipes « relatives » dépendent du bon placement des autres.
- **Publiques** (toutes visibles sur le grand écran) : la salle entière coopère, et chaque équipe ne vote que pour son pion. **Recommandé** pour l'énergie collective. C'est un réglage de la régie.

### 4.5 Énigmes structurées et vérificateur

Chaque énigme est saisie **deux fois** : en **texte** (affiché au public) et sous forme de **contrainte structurée** (lue par la machine), par exemple :

```json
{ "type": "aCote", "pion": "bleu", "de": "vert" }
{ "type": "distance", "pion": "jaune", "de": "bleu", "cases": 3, "ligneDroite": true }
{ "type": "plusHaut", "pion": "rouge", "que": "vert" }
{ "type": "seul", "pion": "violet" }
{ "type": "ligne", "pion": "violet", "ligne": "C" }
```

La régie intègre alors un **vérificateur d'énigmes**. Il contrôle que :

- la figure cible satisfait toutes les contraintes (pas d'énigme fausse) ;
- la solution est **unique**, avec ou sans silhouette (avec silhouette, c'est 720 permutations, vérifiées instantanément) ;
- et il signale sinon les pions ambigus (« violet/orange interchangeables »).

C'est un outil précieux pour l'équipe artistique quand elle compose de nouveaux tableaux.

---

## 5. Architecture technique

### 5.1 Contraintes qui guident le choix

1. **Gratuit**, sans limite qui casse le jour J.
2. **100+ connexions simultanées** (public + écrans + régie), avec de la marge.
3. **Temps réel** : tout le monde voit la même chose à la même seconde.
4. **Robuste** : téléphones qui se mettent en veille, 4G instable, rechargements de page.
5. **Aucune installation** pour le public.
6. **Un serveur qui fait autorité** : chronos, dépouillement et validation se font côté serveur, jamais sur un téléphone.
7. Facile à maintenir par une seule personne.

### 5.2 Comparatif des options

| Option | Verdict | Raison |
|---|---|---|
| **Cloudflare Workers + Durable Objects** | ✅ **Recommandé** | Gratuit ; WebSockets natifs ; un « objet » unique et persistant par partie, idéal pour un salon de jeu ; alarmes intégrées pour les chronos ; **pas de mise en veille** ; HTTPS et domaine `workers.dev` inclus. |
| Node.js + Socket.IO **sur l'ordinateur de régie** (réseau local) | ✅ **Secours** | Zéro dépendance à Internet, latence nulle. Mais le public doit rejoindre un Wi‑Fi local, et beaucoup de téléphones quittent automatiquement un Wi‑Fi « sans Internet » pour la 4G. |
| Node.js + Socket.IO sur Render (offre gratuite) | ⚠️ | Mise en veille après 15 min sans trafic (~1 min de réveil) et **redémarrage possible à tout moment** : risque de perdre l'état en plein spectacle. |
| Supabase (offre gratuite) | ⚠️ | ~200 connexions temps réel : suffisant. Mais pas de logique serveur temps réel native (chronos, dépouillement), qu'il faudrait faire tourner dans le navigateur de la régie (fragile). Projet mis en pause après une semaine d'inactivité. |
| Firebase Realtime Database (offre Spark) | ❌ | **100 connexions simultanées maximum, non extensible** : on atteint la limite avec 100 spectateurs + les écrans. |
| Outils clés en main (Kahoot, Mentimeter, Slido, Wooclap…) | ❌ | Ni grille 5×5, ni logique d'équipes et de validation, ni vue musiciens ; versions gratuites bridées. |
| Appli native (App Store / Play Store) | ❌ | Installation obligatoire (friction énorme en salle), compte Apple payant, délais de validation. |

### 5.3 Stack retenue

| Couche | Choix | Pourquoi |
|---|---|---|
| Langage | **TypeScript** | Un seul langage, types partagés client/serveur : moins de bugs de protocole. |
| Interface | **Svelte 5** + **Vite** | Bundle très léger (chargement rapide en 4G faible), réactivité simple. *React fonctionne aussi si c'est la techno maîtrisée.* |
| Serveur | **Cloudflare Worker** + **1 Durable Object `GameRoom`** | Un objet = une partie : état en mémoire et persisté (SQLite intégré), chronos via les *alarms*. |
| Temps réel | **PartyServer** (serveur) + **PartySocket** (client) | Surcouches maintenues par Cloudflare : salons, diffusion, **reconnexion automatique** avec reprise. |
| Outillage | **@cloudflare/vite-plugin** + **Wrangler** | Front et serveur lancés ensemble en local avec `vite dev` ; déploiement avec `wrangler deploy`. |
| QR code | **qrcode** (npm) | Généré directement sur le grand écran : rien à imprimer pour la version de base. |
| Tests | **Vitest** (règles), **Playwright** (parcours multi-écrans), script de **charge** (150 faux joueurs) | Voir §9. |
| CI/CD | **GitHub Actions** → `wrangler deploy` | Gratuit ; chaque merge sur `main` met en ligne. |
| Polices | **Atkinson Hyperlegible** (gratuite), auto-hébergée | Conçue pour la lisibilité maximale ; pas de dépendance à Google Fonts le jour J. |

### 5.4 Schéma d'architecture

```
                         Internet (4G/5G ou Wi‑Fi de la salle)
                                        │
   ┌────────────────┐   HTTPS + WSS     │      ┌──────────────────────────────────────┐
   │ 50–100         │◀─────────────────────────▶│ Cloudflare (offre gratuite)           │
   │ smartphones    │                   │      │                                      │
   │ (vue Joueur)   │                   │      │  Worker : fichiers statiques (Svelte) │
   └────────────────┘                   │      │          + routage WebSocket          │
                                        │      │                 │                    │
   ┌────────────────┐                   │      │                 ▼                    │
   │ Grand écran    │◀─────────────────────────▶│  Durable Object « GameRoom »         │
   │ (vidéoproj.)   │                   │      │   • état de la partie (SQLite)       │
   └────────────────┘                   │      │   • machine à états + chronos        │
   ┌────────────────┐                   │      │   • dépouillement, conflits,         │
   │ Retour scène   │◀─────────────────────────▶│     validation                       │
   └────────────────┘                   │      │   • diffusion aux clients            │
   ┌────────────────┐                   │      └──────────────────────────────────────┘
   │ Régie (PIN)    │◀──────────────────┘
   └────────────────┘

   Secours : le même code tourne sur l'ordinateur de régie (réseau local de la salle).
```

### 5.5 Modèle de données (simplifié)

```ts
type Couleur = 'rouge' | 'orange' | 'jaune' | 'vert' | 'bleu' | 'violet';
type Case = `${'A'|'B'|'C'|'D'|'E'}${1|2|3|4|5}`;
type Phase = 'accueil' | 'vote' | 'affichage' | 'deplacement' | 'pause' | 'final';

interface Scenario {             // écrit par l'équipe artistique (fichier JSON)
  titre: string;
  tessiture: 'ligne' | 'colonne';           // cf. §2.1
  afficherSilhouette: boolean;
  enigmesPubliques: boolean;
  durees: { vote: number; affichage: number; deplacement: number }; // en secondes
  tempo?: { bpm: number; tempsParMesure: number };                  // option §7.2
  pions: Array<{
    couleur: Couleur;
    depart: Case | 'aleatoire';
    cible: Case;                               // JAMAIS envoyée aux téléphones
    enigme: string;
    contraintes: Contrainte[];                 // pour le vérificateur §4.5
    indices: string[];                         // indices progressifs §3.7
  }>;
}

interface EtatPartie {           // détenu par le serveur uniquement
  phase: Phase;
  manche: number;
  finPhase: number;              // horodatage serveur (ms) de fin de phase
  pions: Record<Couleur, { position: Case; verrouille: boolean; essais: Case[]; echecs: number }>;
  votes: Record<Couleur, Record<IdClient, Case>>;   // manche en cours
  equipes: Record<Couleur, { membres: number }>;
}
```

### 5.6 Protocole temps réel

**Principe : le serveur envoie un instantané complet** (≈ 1–2 Ko) à chaque changement de phase et à chaque (re)connexion. C'est plus simple et plus robuste que d'envoyer des différences : un téléphone qui revient de veille est immédiatement à jour.

| Sens | Message | Contenu |
|---|---|---|
| client → serveur | `bonjour` | `idClient` (aléatoire, stocké sur l'appareil), rôle, équipe souhaitée, jeton régie |
| client → serveur | `vote` | `manche`, `case` |
| client → serveur | `ping` | heure locale (synchro des horloges) |
| serveur → client | `etat` | instantané **public** : phase, manche, `finPhase`, positions, verrous, énigmes visibles, effectifs par équipe |
| serveur → client | `moi` | mon équipe, mon vote actuel, historique ✕ de mon équipe |
| serveur → équipe | `tendance` | répartition des votes de **mon** équipe (option carte de chaleur, max 4 envois/s) |
| serveur → client | `pong` | heure serveur |
| régie → serveur | `regie:*` | `lancer`, `pause`, `reprendre`, `suivant`, `prolonger`, `indice`, `deplacer`, `verrouiller`, `reinitialiser`, `chargerScenario` |

### 5.7 Synchronisation des chronos

Le serveur diffuse l'**heure de fin** de la phase (`finPhase`), pas un compte à rebours. Chaque client estime l'écart entre son horloge et celle du serveur avec des `ping`/`pong` : `écart ≈ heureServeur − (t_envoi + t_réception) / 2`. Tous les écrans affichent alors **le même chrono à quelques dizaines de millisecondes près**, même après une reconnexion.

### 5.8 Robustesse

| Risque | Parade |
|---|---|
| Téléphone qui se met en veille | **Screen Wake Lock API** : l'écran reste allumé pendant la partie (Chrome, Safari iOS 16.4+, Firefox récent). |
| Coupure réseau / rechargement | Reconnexion automatique (PartySocket) + instantané complet + identité conservée sur l'appareil. |
| Crash ou redémarrage serveur | État persisté dans le stockage du Durable Object à chaque transition : la partie reprend où elle en était. |
| Musicien mal placé, bug, imprévu | **Régie** : déplacer ou verrouiller un pion à la main, mettre en pause, prolonger un chrono, rejouer une manche. |
| Internet indisponible dans la salle | **Plan B** : serveur local sur l'ordinateur de régie + Wi‑Fi local. **Plan C** : **mode manuel** (la régie clique les cases, le public vote à main levée). Le spectacle continue quoi qu'il arrive. |

### 5.9 Sécurité et anti-triche

- Les **cases cibles ne quittent jamais le serveur** : impossible de tricher en inspectant la page.
- **Toutes** les validations sont faites côté serveur : format de case, appartenance à l'équipe, case non verrouillée, vote dans la bonne manche.
- Un vote par appareil et par manche (le dernier remplace le précédent).
- Régie protégée par un **code PIN** et une URL non publiée.
- ⚠️ **Ne jamais limiter par adresse IP** : derrière le Wi‑Fi d'une salle, tous les téléphones partagent souvent la même IP publique.

### 5.10 RGPD / vie privée

- **Aucune donnée personnelle** : pas de nom, pas de compte, pas d'e-mail, pas de traceur, pas de statistiques tierces.
- Seul un identifiant technique aléatoire est stocké sur l'appareil. Il est strictement nécessaire au service, donc sans bandeau de consentement.
- Données de partie effacées après la représentation.
- Une ligne d'information sur l'écran d'accueil suffit (« Aucune donnée personnelle n'est collectée »). C'est important si le public compte des mineurs.

### 5.11 Quotas gratuits : on est très loin des limites

L'offre gratuite Cloudflare inclut les Durable Objects (stockage SQLite) avec **100 000 requêtes/jour** et **13 000 Go·s de calcul/jour**.

Estimation pour **une représentation** avec 100 joueurs et 40 manches :

- votes et changements d'avis : ~3 messages × 100 joueurs × 40 manches ≈ **12 000 messages** ;
- connexions, reconnexions, pings, alarmes : quelques milliers.

Même en comptant chaque message comme une requête (en pratique les messages WebSocket sont décomptés de façon encore plus favorable), on reste **sous 20 % du quota journalier**. Côté calcul : 1 h d'activité ≈ 3 600 s × 0,128 Go ≈ **460 Go·s sur 13 000**.

### 5.12 Structure du dépôt proposée

```
Tutti/
├── docs/
│   └── RECOMMANDATION.md        ← ce document
├── src/
│   ├── shared/                  ← code partagé client/serveur
│   │   ├── types.ts
│   │   ├── regles.ts            ← moteur de jeu PUR (dépouillement, conflits, validation)
│   │   ├── enigmes.ts           ← contraintes + vérificateur d'unicité
│   │   └── protocole.ts         ← messages typés
│   ├── server/
│   │   ├── index.ts             ← Worker (statique + routage)
│   │   └── GameRoom.ts          ← Durable Object (état, chronos, diffusion)
│   └── client/
│       ├── App.svelte           ← routeur des 4 vues
│       ├── vues/Joueur.svelte
│       ├── vues/Ecran.svelte
│       ├── vues/Scene.svelte
│       ├── vues/Regie.svelte
│       ├── composants/Grille.svelte, Chrono.svelte, Pion.svelte, …
│       └── lib/connexion.ts, horloge.ts, wakelock.ts
├── scenarios/
│   └── tableau-1.json           ← la figure du croquis
├── tests/
│   ├── regles.test.ts           ← Vitest
│   ├── parcours.spec.ts         ← Playwright
│   └── charge.ts                ← 150 faux joueurs
├── wrangler.jsonc
├── vite.config.ts
└── package.json
```

Le **moteur de règles est isolé en fonctions pures** (`shared/regles.ts`) : il se teste sans réseau ni navigateur, et c'est là que se trouvent les cas délicats (égalités, conflits, échanges).

---

## 6. Design UX / UI

### 6.1 Principes

1. **Une salle de concert est sombre** : interface **sombre par défaut** pour ne pas éclairer la salle avec 100 écrans, et pour bien contraster sur le vidéoprojecteur.
2. **La couleur ne suffit jamais** : 6 couleurs dont rouge + vert (le daltonisme touche environ 8 % des hommes). Chaque couleur a un **symbole** et un **nom**.
3. **Lisible à 10 m** sur le grand écran, **utilisable d'une main** sur le téléphone.
4. **Zéro texte inutile** : le public doit comprendre en 3 secondes ce qu'on attend de lui (« VOTEZ ! », « RÉSULTAT », « LES MUSICIENS SE DÉPLACENT »).
5. **Les téléphones restent muets** : la musique est sur scène.

### 6.2 Palette et symboles

| Équipe | Couleur écran | Symbole | Remarque |
|---|---|---|---|
| Rouge | `#FF4D5E` | ■ carré | |
| Orange | `#FF9F1C` | ▲ triangle | |
| Jaune | `#FFE14D` | ★ étoile | |
| Vert | `#2ECC71` | ● rond | |
| Bleu | `#3A86FF` | ◆ losange | |
| Violet | `#A259FF` | ✚ croix | |
| **Verrouillé** | `#3A3A44` + 🔒 + liseré couleur | | « grisé », mais on sait qui est là |
| Fond | `#0E0E14` | | |
| Texte | `#F5F5F7` | | contraste AAA |

Teintes saturées choisies pour **survivre au vidéoprojecteur** (le jaune et l'orange ont tendance à « baver »). À valider **sur place**, avec le vrai projecteur et l'éclairage de scène, en même temps que la couleur des vêtements des musicien·ne·s.

### 6.3 Écran Joueur (smartphone)

**Accueil / attente :**

```
┌──────────────────────────────┐
│          TUTTI               │
│      Puzzle musical          │
│                              │
│  ┌────────────────────────┐  │
│  │  ◆  ÉQUIPE BLEUE       │  │  ← bandeau de la couleur de l'équipe
│  └────────────────────────┘  │
│                              │
│  Ton rôle : déplacer le      │
│  musicien BLEU sur la        │
│  bonne case.                 │
│                              │
│  17 joueurs dans ton équipe  │
│  La partie va commencer…     │
│                              │
│  Aucune donnée personnelle   │
│  n'est collectée.            │
└──────────────────────────────┘
```

**Vote :**

```
┌──────────────────────────────┐
│ ◆ ÉQUIPE BLEUE     MANCHE 4  │
│ VOTEZ !               ⏱ 12 s │
│ ████████████░░░░░░░░         │  ← barre de temps
├──────────────────────────────┤
│ « Le bleu doit être à côté   │
│   du vert. »            (?)  │  ← (?) = lexique §2.3
├──────────────────────────────┤
│       1    2    3    4    5  │
│ aigu A ·    🔒   ·    ·    ·  │
│      B ·    ·    ·    ·    ·  │
│  med C ·    ·    ✕    ·    ·  │  ← ✕ = déjà essayé, faux
│      D ·    ·    ·    ·    ·  │
│ grave E ·   ·   [◆]   ·    ·  │  ← [ ] = mon vote
├──────────────────────────────┤
│ Ton vote : E3 · 41 % de      │
│ l'équipe est d'accord        │
└──────────────────────────────┘
```

- Cases ≥ 56 px, sur toute la largeur de l'écran.
- La **position actuelle** du pion de l'équipe est toujours visible (symbole plein), le vote en cours aussi (cadre).
- Option **carte de chaleur** : intensité de la case selon le nombre de votes de l'équipe.
- Petite vibration au changement de phase (Android ; iOS ne la permet pas).
- Bandeau « Reconnexion… » discret en cas de coupure.

**Affichage du résultat :** « Votre équipe a choisi **E3** », puis plein écran **✔ Bravo !** (grisé) ou **✕ Ce n'est pas la bonne case** (pulsation couleur).

### 6.4 Grand écran (public)

```
┌───────────────────────────────────────────────────────────────────────────┐
│  MANCHE 4 · VOTEZ !                                       ⏱ 12 s  ██████░░ │
├───────────────────┬──────────────────────────────────────┬────────────────┤
│ ÉQUIPES           │        1      2      3      4      5 │  ÉNIGMES        │
│ ■ Rouge   17  ··· │  A     ·    [■?]    ·      ·      · │  (si publiques) │
│ ▲ Orange  15  ✔   │  B     ·      ·    [★?]    ·      · │                 │
│ ★ Jaune   16  ··· │  C   [✚?]     ·      ·      ·      · │  ■ « Le rouge  │
│ ● Vert    18  ··· │  D     ·      ·      ·      ·    🔒▲ │    est plus     │
│ ◆ Bleu    17  ··· │  E     ·    [●?]   [◆?]    ·      · │    haut… »      │
│ ✚ Violet  14  ··· │                                      │  …              │
│                   │  [?] = silhouette (option)           │                 │
└───────────────────┴──────────────────────────────────────┴────────────────┘
```

- **Accueil** : QR code géant + adresse courte + compteur de joueurs par équipe (la salle se remplit en direct, c'est déjà un moment de spectacle).
- **Affichage** : **flèches** animées de l'ancienne case vers la nouvelle, puis grisé ou pulsation.
- **Final** : figure complète, révélation des couleurs, animation sobre « TUTTI ».

### 6.5 Retour musiciens (écran face à la scène)

Vue **épurée** pour être lue en jouant :

```
┌──────────────────────────────────────────────────────┐
│  DÉPLACEMENT                          ⏱ 7 s           │
│                                                      │
│  ■ ROUGE   D4 → A2   Boucle 2 · AIGU          🔒     │
│  ★ JAUNE   C2 → B3   Boucle 3 · MEDIUM-AIGU          │
│  ● VERT    B4 → E1   Boucle 1 · GRAVE         ✕      │
│  …                                                   │
│            (+ mini-grille avec flèches)              │
└──────────────────────────────────────────────────────┘
```

L'appli **traduit les coordonnées en consignes musicales** (« Boucle 3 · medium-aigu »). Les musicien·ne·s n'ont rien à calculer.

### 6.6 Régie

- **Pilotage** : Lancer · Pause/Reprise · Passer à la phase suivante · +10 s · Rejouer la manche · Réinitialiser.
- **Correction** : glisser-déposer un pion, verrouiller ou déverrouiller, envoyer un indice à une équipe.
- **Supervision** : joueurs connectés par équipe, taux de participation au vote, journal des manches, état du réseau.
- **Scénario** : charger un fichier JSON, vérificateur d'énigmes (§4.5), réglage des durées, du tempo et des options.
- **Mode répétition** : faux joueurs simulés pour répéter sans public.
- Raccourcis clavier (Espace = pause, → = phase suivante) et PIN d'accès.

### 6.7 Animations et sécurité photosensible

- Clignotements **≤ 2 Hz** (la norme d'accessibilité WCAG 2.3.1 interdit plus de 3 flashs par seconde). Il s'agit d'une **pulsation** douce plutôt que d'un flash noir/blanc.
- Respect du réglage « réduire les animations » du téléphone (`prefers-reduced-motion`).
- Transitions courtes (200–400 ms) ; les flèches de déplacement durent toute la phase d'affichage.

---

## 7. Musique et scène

*(Hors logiciel, mais cela conditionne l'appli.)*

### 7.1 Matrice musicale de chaque musicien·ne

Chaque musicien·ne dispose d'une **matrice 5×5** : colonne = boucle (1 → 5), ligne = registre (aigu → grave), soit **25 cellules musicales**. Fiche papier sur pupitre, ou affichage par le retour scène. La **figure cible doit être composée comme l'accord ou la texture finale** : le moment où tout le monde est en place est le climax musical (*tutti*).

### 7.2 Caler les phases sur le tempo (option recommandée)

Si les boucles partagent un tempo, on peut exprimer les durées **en mesures** pour que chaque mutation tombe sur un début de mesure. Exemple à 90 BPM en 4/4 (1 mesure ≈ 2,67 s) :

| Phase | Mesures | Durée |
|---|---|---|
| Vote | 6 | 16,0 s |
| Affichage | 2 | 5,3 s |
| Déplacement | 4 | 10,7 s |
| **Manche** | **12** | **32 s** |

Le retour scène peut afficher une **pulsation visuelle** discrète (métronome) pour tenir l'ensemble sans chef. Le changement de boucle se fait au premier temps de la phase suivante.

### 7.3 Mise en scène

- **Grille au sol** : cases d'environ **1 à 1,2 m** (soit 5 à 6 m de côté), adhésif de marquage, coordonnées écrites en grand au sol.
- **Instruments joués assis** (violoncelle…) : prévoir des chaises sur les cases, ou un temps de déplacement plus long.
- **Deux affichages** : le grand écran pour le public (fond de scène) et un **retour face aux musiciens** (TV ou écran au nez de scène), car ceux-ci tournent le dos au fond de scène.
- **Vêtements** : chasubles de sport de couleur (peu chères, très visibles), éventuellement avec le **symbole** imprimé ou cousu.
- **Durée estimée** d'une partie (à affiner en répétition) : 4 à 8 manches avec silhouette (2–4 min), 6 à 15 sans (3–8 min). Pour une pièce plus longue : **enchaîner plusieurs tableaux** (§3.8).

---

## 8. Réseau et matériel le jour J

### 8.1 Réseau

- Chaque téléphone consomme **moins de 1 Mo** pour toute la représentation : la 4G suffit **si la salle capte**.
- ⚠️ **À tester sur place, bien avant** : réception 4G/5G des différents opérateurs dans la salle (les salles en sous-sol ou très isolées captent mal).
- Si la salle a un Wi‑Fi **avec Internet** : afficher un **QR code Wi‑Fi** (format `WIFI:T:WPA;S:<réseau>;P:<mot de passe>;;`) à côté du QR de l'appli. Un point d'accès grand public sature vers 30–50 appareils : vérifier la capacité.
- **Régie et grand écran** sur la connexion la plus fiable (câble si possible), avec un **partage de connexion 4G** en secours.

### 8.2 Matériel

| Élément | Remarque |
|---|---|
| 1 ordinateur de régie | Navigateur récent (Chrome/Firefox) ; sert aussi de serveur local en plan B. |
| 1 vidéoprojecteur ou grand écran (HDMI) | Grand écran public, navigateur en plein écran. |
| 1 écran retour face à la scène | TV ou 2ᵉ ordinateur ou tablette. |
| QR codes imprimés (option) | Sur les programmes, les sièges ou les zones colorées. |
| Adhésif de marquage au sol + chasubles | Quelques dizaines d'euros. |

### 8.3 Check-list du jour J

- [ ] Appli déployée et testée sur l'URL finale la veille
- [ ] Scénario chargé et vérifié (vérificateur d'énigmes au vert)
- [ ] Test de charge passé (150 faux joueurs)
- [ ] Réseau testé dans la salle avec au moins 5 téléphones (iOS et Android)
- [ ] Grand écran et retour scène allumés, plein écran, mise en veille désactivée
- [ ] PIN de régie connu de 2 personnes
- [ ] Plan B (serveur local) et plan C (mode manuel) répétés une fois
- [ ] Couleurs vérifiées sur le vrai projecteur avec l'éclairage de scène

---

## 9. Tests et répétitions

| Niveau | Outil | Ce qu'on vérifie |
|---|---|---|
| **Règles** | Vitest | Dépouillement, égalités, conflits, échanges, cycles, verrouillage, indices, vérificateur d'énigmes. Le cœur du jeu doit être testé à 100 %. |
| **Parcours** | Playwright (navigateur headless) | Une partie complète avec 1 régie, 1 grand écran et 6 joueurs ouverts en parallèle. |
| **Charge** | Script Node (150 WebSockets) | Latence de diffusion, reconnexions massives (on coupe et on relance 100 clients d'un coup). |
| **Terrain** | Vrais téléphones | Safari iOS, Chrome Android, vieux téléphones, mise en veille, passage 4G ↔ Wi‑Fi. |
| **Répétition générale** | Une classe ou un groupe en public | Compréhension des consignes, durée réelle, lisibilité, énergie de la salle. |

Le **mode répétition** de la régie (faux joueurs) permet aux musicien·ne·s de répéter les déplacements sans public, autant de fois que nécessaire.

---

## 10. Plan d'implémentation

Estimations **indicatives** pour une personne (j = jour de travail).

| Lot | Contenu | Taille |
|---|---|---|
| **0. Cadrage** | Réponses aux questions du §12, scénario du tableau 1 finalisé, choix silhouette / énigmes. | — |
| **1. Socle** | Dépôt, Vite + Svelte + Worker + Durable Object, déploiement « bonjour » sur `workers.dev`, CI GitHub Actions. | ~0,5 j |
| **2. Moteur de jeu** | Types, machine à états, dépouillement, conflits, validation (fonctions pures) + tests Vitest. | ~1–1,5 j |
| **3. Temps réel** | `GameRoom`, protocole, instantanés, chronos par alarmes, synchro d'horloge, reconnexion, persistance. | ~1 j |
| **4. Vues MVP** | Joueur, Grand écran (QR inclus), Régie minimale (lancer, pause, suivant, déplacer). | ~2–3 j |
| ✅ **Jalon MVP** | **Une partie jouable de bout en bout, en ligne, gratuitement.** | |
| **5. Finitions** | Animations (flèches, grisé, pulsation), historique ✕, Wake Lock, lexique, indices, renfort des équipes, vue Retour musiciens. | ~1,5–2 j |
| **6. Outils de répétition** | Faux joueurs, test de charge, vérificateur d'énigmes, éditeur de scénario, tableaux enchaînés, option tempo/mesures, mode local (plan B), mode manuel (plan C). | ~1,5–2 j |
| **7. Recette** | Test en salle, répétition générale, corrections, check-list jour J. | selon calendrier |

**Total indicatif : 8 à 10 jours de développement** jusqu'à une version « prête pour la scène », dont **4 à 5 jours** pour un MVP jouable.

---

## 11. Coûts

| Poste | Coût |
|---|---|
| Hébergement + temps réel (Cloudflare, offre gratuite) | **0 €** |
| Nom de domaine | **0 €** (`*.workers.dev`) — optionnel : ~10 €/an pour une adresse personnalisée |
| Code source + CI (GitHub) | **0 €** |
| Bibliothèques (Svelte, Vite, PartyServer, qrcode, Vitest, Playwright…) | **0 €** (open source) |
| Polices (Atkinson Hyperlegible) | **0 €** |
| Marquage au sol, chasubles, impressions | quelques dizaines d'euros (optionnel) |

---

## 12. Questions à poser à l'équipe artistique

1. **Tessiture par ligne** (comme sur le croquis) **ou par colonne** (comme dans le message) ?
2. **Combien de musicien·ne·s / couleurs** ? (6 sur le croquis : rouge, jaune, violet, orange, vert, bleu.)
3. La **silhouette** de la figure est-elle montrée au public ? (Recommandé : oui.)
4. Chaque équipe voit-elle **seulement son énigme** ou **toutes** les énigmes ?
5. Départ **aléatoire** ou **position initiale fixe** (la petite grille du croquis) ?
6. **Durée visée** de la performance ? Un seul tableau ou **plusieurs tableaux** enchaînés ?
7. Durées des phases : **15 s de vote** est-il un choix ferme ? Les boucles ont-elles un **tempo commun** (pour caler les phases en mesures) ?
8. Que deviennent les **équipes qui ont trouvé** (renfort, spectateurs) ?
9. **Le lieu** : réception 4G, Wi‑Fi disponible, vidéoprojecteur, place pour un écran retour, dimensions de la scène ?
10. **Calendrier** : nombre de représentations, dates des répétitions, date de la première ?
11. Certains instruments sont-ils **joués assis** (violoncelle…) ? Cela influe sur le temps de déplacement.
12. **Public** : âge, et tout le monde a-t-il un smartphone ? (Le vote est par appareil : on peut voter à plusieurs sur un même téléphone.)

---

### Sources (vérifiées en novembre 2026)

- Cloudflare — Durable Objects disponibles sur l'offre gratuite (SQLite) et limites : [Pricing · Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/), [Limits](https://developers.cloudflare.com/durable-objects/platform/limits/), [annonce de l'offre gratuite](https://blog.cloudflare.com/building-ai-agents-with-mcp-authn-authz-and-durable-objects)
- Firebase — limite de 100 connexions simultanées sur l'offre Spark : [Realtime Database Limits](https://firebase.google.com/docs/database/usage/limits?hl=fr), [FAQ](https://firebase.google.com/docs/database/faq-and-troubleshooting?hl=en)
- Render — mise en veille après 15 min et redémarrages des instances gratuites : [Deploy for Free](https://render.com/docs/free)
- Supabase — mise en pause des projets gratuits inactifs : [FAQ Supabase](https://supabase.com/kb/faqs/platform/free-project-pausing)
- Accessibilité — seuil de 3 flashs par seconde : WCAG 2.1, critère 2.3.1
