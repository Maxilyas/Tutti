# Tutti — Puzzle musical

**Cadrage, décisions et conception** · version 2, après les retours de l'équipe artistique

> La version 1 de ce document proposait une conception. Cette version 2 intègre les retours reçus
> et décrit **ce qui a été construit**. L'application est dans ce dépôt ; pour l'utiliser, voir le
> [README](../README.md) et le [guide de régie](GUIDE-REGIE.md).

---

## Sommaire

0. [Résumé](#0-résumé)
1. [Le projet](#1-le-projet)
2. [Les retours et ce qu'ils ont changé](#2-les-retours-et-ce-quils-ont-changé)
3. [Trois points à confirmer](#3-trois-points-à-confirmer)
4. [Les règles du jeu](#4-les-règles-du-jeu)
5. [Les énigmes](#5-les-énigmes)
6. [Les écrans](#6-les-écrans)
7. [Architecture technique](#7-architecture-technique)
8. [Scène, réseau et jour J](#8-scène-réseau-et-jour-j)
9. [Tests](#9-tests)
10. [Ce qui reste à faire avant le concert](#10-ce-qui-reste-à-faire-avant-le-concert)
11. [Coûts](#11-coûts)

---

## 0. Résumé

| Sujet | Décision |
|---|---|
| **Type d'appli** | Web app : le public scanne un QR code et joue dans son navigateur. Rien à installer, aucun compte. |
| **Musiciens** | **7 pions** : rouge, orange, jaune, vert, bleu, violet et **rose**. Un musicien absent se gère d'une case à cocher. |
| **Grille** | 5 × 5. **Lettre (A → E) = colonne = boucle**, **chiffre (1 → 5) = rangée = registre** (1 très aigu, 5 très grave). |
| **Figure** | La **silhouette** est montrée (cases en pointillés, sans couleur). Les énigmes servent à trouver quelle couleur va où. |
| **Énigmes** | De **placement** au départ, affichées à tous. Des **indices musicaux** arrivent après des échecs. |
| **Équipes** | QR code unique, répartition **automatique et aléatoire**, équipes égales à un joueur près. |
| **Manche** | Vote (20 s) → Résultat (15 s) → Déplacement (15 s). Durées réglables en direct, pause et avance manuelle possibles. |
| **Durée** | 3 à 5 minutes visées, soit 3 à 5 manches. Au-delà de 4 min 30, la régie est invitée à révéler les pions restants. |
| **Écrans** | **Téléphone** du public, **grand écran** unique (vu par le public et par les musiciens), **régie**. |
| **Technique** | TypeScript, Svelte 5, Cloudflare Workers + Durable Objects (offre gratuite). |
| **Coût** | **0 €** de logiciel et d'hébergement. |

---

## 1. Le projet

Une performance musicale contemporaine en forme de puzzle, pour un concert de fin d'année
(salle Louise Labé, Saint-Symphorien-d'Ozon) devant un public familial de 50 à 100 personnes.

- Au sol, une **grille de 5 × 5 cases** de 70 cm de côté (3,50 m × 3,50 m).
- **7 élèves musiciens** (violons, flûtes, violoncelles joués debout) sont les **pions**. Chacun porte une couleur.
- Le public est réparti en **7 équipes**, une par couleur. Chaque équipe vote sur smartphone pour déplacer
  « son » musicien, à l'aide d'une **énigme**.
- Le but : reconstituer une **figure** prédéfinie.
- À chaque déplacement, la musique change : la **lettre** de la case donne la boucle jouée, le **chiffre**
  donne le registre. Les musiciens connaissent leur partie par cœur.

### 1.1 La grille

```
            A      B      C      D      E        ← la lettre : la boucle
        ┌──────┬──────┬──────┬──────┬──────┐
   1    │      │ROUGE │      │      │      │     très aigu
        ├──────┼──────┼──────┼──────┼──────┤
   2    │      │      │JAUNE │      │      │     aigu
        ├──────┼──────┼──────┼──────┼──────┤
   3    │VIOLET│      │      │      │      │     medium
        ├──────┼──────┼──────┼──────┼──────┤
   4    │      │      │ ROSE │      │ORANGE│     grave
        ├──────┼──────┼──────┼──────┼──────┤
   5    │      │ VERT │ BLEU │      │      │     très grave
        └──────┴──────┴──────┴──────┴──────┘
   ↑ le chiffre : le registre                    La figure à reconstituer
```

« **B1** » désigne donc la deuxième case de la rangée du haut.

### 1.2 Le scénario du concert

| Pion | Départ | À trouver | Énigme de placement | Indices musicaux |
|---|---|---|---|---|
| Rouge ■ | D4 | **B1** | Le rouge est plus haut que le vert. | Le rouge joue dans le très aigu. · Le rouge joue la boucle B. |
| Orange ▲ | E1 | **E4** | L'orange veut être seul. | L'orange joue dans le grave. · L'orange joue la boucle E. |
| Jaune ★ | B3 | **C2** | Le jaune se trouve à 3 cases du bleu. | Le jaune joue dans l'aigu. · Le jaune joue la boucle C. |
| Vert ● | D2 | **B5** | Le vert est à côté du bleu. | Le vert joue dans le très grave. · Le vert joue la boucle B. |
| Bleu ◆ | C1 | **C5** | Le bleu est à côté du vert. | Le bleu joue dans le très grave. · Le bleu joue la boucle C. |
| Violet ✚ | A5 | **A3** | Le violet veut être seul, tout à gauche. | Le violet joue dans le medium. · Le violet joue la boucle A. |
| Rose ♥ | E4 | **C4** | Le rose est au-dessus du bleu. | Le rose joue dans le grave. · Le rose joue la boucle C. |

Ce scénario est dans le fichier [`scenarios/concert.json`](../scenarios/concert.json). Tout se modifie
depuis la régie (onglet **Scénario**), sans toucher au code.

---

## 2. Les retours et ce qu'ils ont changé

| Retour | Ce qui a été fait |
|---|---|
| **Numérotation** : lettre A → E et chiffre 1 → 5, « la boucle A est très aiguë en 1 et très grave en 5 ». | La lettre est la colonne (la boucle), le chiffre est la rangée (le registre, aigu en haut). Les cases du croquis d'origine ont été renommées sans bouger : voir §3.1. |
| **Un 7ᵉ musicien, rose.** Figure en C4, départ en E4, énigme « le rose est au-dessus du bleu ». | Ajouté. C4 est juste au-dessus du bleu (C5) : l'énigme est exacte. |
| **Un musicien absent le jour J ?** | Une case à cocher dans la régie. Le pion devient un « fantôme » posé sur sa case : les énigmes des autres restent justes, et son équipe est répartie dans les autres. Voir §4.7. |
| **Montrer la silhouette** de la figure. | Fait : les 7 cases apparaissent en pointillés sur tous les écrans. |
| **Durée : 3 à 5 minutes.** | Une manche dure 50 s et la partie se joue en 3 à 5 manches (voir §4.8). Une alerte s'affiche en régie à 4 min 30 et propose de révéler les pions restants. Durées réglables. |
| **Pas besoin d'afficher la boucle et le registre** à jouer. | L'écran ne montre que les cases (« D4 → B1 »). Les registres ne figurent que comme repère discret, pour que le public comprenne les indices musicaux. |
| **Un seul écran**, vu de tous (vidéoprojecteur ou panneaux LED). | L'écran « retour musiciens » a été supprimé. Le grand écran affiche chaque déplacement en très gros, par couleur. |
| **Un affichage plus long**, pour que les enfants anticipent ; **pouvoir reprendre la main**. | Résultat affiché 15 s, puis 15 s pour se déplacer (réglables). La régie a Pause, +10 s, Phase suivante, et un mode où chaque phase attend son feu vert. |
| **Pas de mesures ni de tempo** : tout est hors tempo. | L'option « caler les phases sur le tempo » a été abandonnée. |
| **Énigmes de placement au départ, indices musicaux ensuite.** | Chaque pion a une énigme et jusqu'à 4 indices, révélés tous les 2 échecs ou à la main par la régie. |
| **Répartition aléatoire**, pas de choix de couleur ; pas d'équipe vide. | Chaque arrivant rejoint l'équipe la moins nombreuse, au hasard en cas d'égalité. Les 7 premiers forment 7 équipes. |
| **Temps limite** au-delà duquel la régie révèle les pions restants. | Fait : bouton « Révéler les pions restants », rappelé par une alerte quand la durée visée est dépassée. |
| **QR code unique.** | Fait. Il s'affiche en grand sur l'écran avant le lancement. |
| **Énigmes publiques** sur le grand écran, en plus de celle de son équipe sur le téléphone. | Fait. Le téléphone donne aussi accès à toutes les énigmes et à un lexique. |
| **Position de départ fixe**, celle de la petite grille du croquis. | Fait (voir §1.2). |
| **Vote par appareil.** | Fait : une voix par téléphone et par manche, modifiable jusqu'à la fin du chrono. |

---

## 3. Trois points à confirmer

Ces choix ont été faits pour avancer. Chacun se corrige en quelques clics dans la régie.

### 3.1 La figure n'a pas bougé, ses cases ont changé de nom

Le croquis d'origine nommait les rangées par des lettres et les colonnes par des chiffres. Avec la nouvelle
numérotation, chaque case garde sa place **physique** et reçoit un nouveau nom :

| Pion | Croquis d'origine | Nouvelle numérotation |
|---|---|---|
| Rouge | A2 | **B1** |
| Jaune | B3 | **C2** |
| Violet | C1 | **A3** |
| Orange | D5 | **E4** |
| Vert | E2 | **B5** |
| Bleu | E3 | **C5** |

C'est la seule lecture pour laquelle toutes les énigmes restent vraies (« le rouge est plus haut que le
vert », « le rose est au-dessus du bleu »…). Pour le rose, **C4** et **E4** ont été lus dans la nouvelle
numérotation, celle du message qui les annonçait.

### 3.2 Le rose démarre sur la case à trouver de l'orange

Le départ du rose (E4) est aussi la case que l'orange doit trouver. Ce n'est pas un problème pour le jeu :
quand l'équipe orange vote E4, les deux musiciens échangent leurs places. Si ce n'était pas voulu, il suffit
de changer la case de départ du rose.

Conséquence prise en compte : si l'orange est **absent**, son pion fantôme occupe E4. Le rose démarre alors
automatiquement sur la case de départ de l'orange (E1). La régie l'annonce dans l'onglet Scénario.

### 3.3 « Le violet veut être seul, tout à gauche »

Avec les énigmes proposées, le violet et l'orange « veulent être seuls » tous les deux, et la figure a deux
cases isolées (A3 et E4) : ils étaient **interchangeables**. La précision « tout à gauche » a été ajoutée à
l'énigme du violet pour que la solution soit unique. Le vérificateur de la régie signale ce genre
d'ambiguïté ; l'énigme peut être réécrite autrement.

---

## 4. Les règles du jeu

### 4.1 Une manche en trois temps

```
   ACCUEIL ──lancer──▶ VOTE ──▶ RÉSULTAT ──▶ DÉPLACEMENT ──┬──▶ FINAL  (tous les pions sont en place)
                         ▲                                  │
                         └──────────  manche suivante  ◀────┘
```

| Phase | Durée par défaut | Ce qui se passe |
|---|---|---|
| **Vote** | 20 s (30 s à la première manche) | Chaque équipe encore en jeu choisit une case. On peut changer d'avis jusqu'à la fin. |
| **Résultat** | 15 s | Une flèche montre le trajet de chaque musicien. La bonne case **se grise**, la mauvaise **clignote** dans la couleur de l'équipe. Les musiciens se préparent. |
| **Déplacement** | 15 s | Les musiciens changent de case : la musique change. |

Toutes les équipes votent en même temps. La régie peut mettre en pause, ajouter 10 secondes, passer à la
phase suivante, ou désactiver l'enchaînement automatique : chaque phase attend alors son feu vert.

### 4.2 Le vote d'une équipe

1. Un téléphone = une voix par manche. La dernière case touchée compte.
2. La case qui reçoit **le plus de voix** est retenue. En cas d'égalité, tirage au sort.
3. Sans aucun vote, le musicien reste sur place.
4. On ne peut pas voter pour une case **verrouillée** (un pion y est en place), ni pour une case
   **déjà essayée** par son équipe : elle est barrée d'une croix.
5. Chaque joueur voit en direct les votes de son équipe, pour se mettre d'accord sans se parler.

### 4.3 Quand deux équipes se gênent

| Situation | Règle |
|---|---|
| Une équipe vote **sa bonne case** | Elle l'obtient **toujours**, même si une autre équipe la voulait aussi. |
| Deux équipes visent la même case (fausse pour les deux) | La plus forte l'emporte : plus de voix, puis plus forte part de l'équipe, puis tirage au sort. L'autre ne bouge pas (« case prise »). |
| La case visée est occupée par un pion qui ne bouge pas | Les deux musiciens **échangent leurs places**. Personne n'est jamais bloqué. |

Tout pion qui termine sur sa case est verrouillé, même s'il y arrive par un échange (« coup de chance »).

### 4.4 Bon ou mauvais choix

| | Grand écran | Téléphone de l'équipe |
|---|---|---|
| **Juste** | La case se grise, un cadenas apparaît, la carte de l'équipe affiche « En place ». | « Bravo ! » |
| **Faux** | La case clignote dans la couleur de l'équipe (moins de 2 fois par seconde), la carte affiche « Raté ». | « Raté », puis la case reste barrée d'une croix. |

### 4.5 Les indices

Chaque pion peut avoir jusqu'à 4 indices. Un indice est révélé **tous les 2 échecs** (réglable), ou à la
main par la régie. Il s'affiche sur les téléphones de l'équipe et sur le grand écran.

### 4.6 Fin de partie

- Quand une équipe a trouvé, ses joueurs peuvent **aider une autre équipe** (bouton sur le téléphone).
- La partie se termine quand tous les pions sont en place : c'est le *tutti*.
- Si la partie s'éternise, la régie **révèle les pions restants** : ils rejoignent directement leur case.

### 4.7 Un musicien absent

Dans la régie, avant de lancer, on coche « Musicien absent » sur sa ligne.

- Son pion reste affiché en **fantôme** sur sa case à trouver. Les énigmes qui parlent de lui
  (« à côté du bleu ») restent donc justes, et deviennent même plus faciles.
- Son équipe n'existe pas : ses joueurs sont répartis dans les autres.
- Le vérificateur confirme que la solution reste unique.

### 4.8 Combien de temps dure une partie ?

Avec la silhouette, chaque équipe n'a que 7 cases plausibles, et chaque erreur en élimine une. Les
simulations (400 parties, public qui vote en partie au hasard) donnent **3 manches en moyenne, 5 au plus**.

| Manches | Durée avec les réglages par défaut |
|---|---|
| 2 | 1 min 50 |
| 3 | 2 min 40 |
| 4 | 3 min 30 |
| 5 | 4 min 20 |

Pour allonger ou raccourcir, la régie règle les durées des trois phases (onglet *Réglages*), même pendant
la partie. La durée réelle dépendra du public : c'est le premier point à observer en répétition.

---

## 5. Les énigmes

### 5.1 Le sens des mots

Ce lexique est accessible depuis les téléphones.

| Mot | Sens |
|---|---|
| **à côté de** | Les deux cases se touchent par un côté, pas en diagonale. |
| **à N cases de** | N cases plus loin, en ligne droite. |
| **seul** | Aucune des 8 cases autour n'est occupée, diagonales comprises. |
| **plus haut que**, plus bas que | Sur une rangée plus haute ou plus basse, peu importe la colonne. |
| **au-dessus de**, en dessous de | Dans la même colonne (même lettre), plus haut ou plus bas. |
| **à gauche de**, à droite de | Sur la même rangée (même chiffre), plus à gauche ou plus à droite. |
| **tout en haut**, tout à gauche… | Sur le bord : rangée 1, rangée 5, colonne A ou colonne E. |

### 5.2 Pourquoi la silhouette change tout

Sans silhouette, « le bleu est à côté du vert » est vrai pour des dizaines de positions : le public ne
pourrait que deviner. Avec la silhouette, le raisonnement devient possible :

1. Dans la figure, une seule case touche deux autres : **C5**. Le bleu, qui est à côté du vert, et le rose,
   qui est au-dessus du bleu, se placent autour d'elle.
2. Le jaune est à 3 cases du bleu en ligne droite : seul le couple C2–C5 convient. **Bleu en C5, jaune en C2.**
3. Le rose est au-dessus du bleu, dans la même colonne : **rose en C4**. Il reste **vert en B5**.
4. Le violet et l'orange veulent être seuls : ce sont les cases isolées A3 et E4. Le violet est tout à
   gauche : **violet en A3, orange en E4**.
5. Il reste **rouge en B1**, bien plus haut que le vert.

### 5.3 Le vérificateur

Chaque énigme est saisie deux fois dans la régie : le **texte** affiché au public, et sa **traduction en
contraintes** (« est à côté de… bleu »). Le vérificateur contrôle alors, à chaque modification :

- que la figure respecte toutes les énigmes (pas d'énigme fausse) ;
- que la solution est **unique**, en tenant compte des musiciens absents ;
- sinon, il nomme les pions interchangeables et donne un exemple.

---

## 6. Les écrans

### 6.1 Principes

1. **Une salle de concert est sombre** : interface sombre, pour ne pas éclairer la salle avec 100 téléphones
   et pour bien ressortir au vidéoprojecteur.
2. **La couleur ne suffit jamais** : chaque équipe a aussi un **symbole** (carré, triangle, étoile, rond,
   losange, croix, cœur). Indispensable avec du rouge, du vert et du rose côte à côte.
3. **Le vert n'est pas la couleur du succès** : c'est celle d'une équipe. Une bonne réponse s'affiche en
   blanc et gris, comme la case qui se grise.
4. **Lisible de loin** : les déplacements s'écrivent en très gros (« D4 → B1 »).
5. **Les téléphones restent muets** : la musique est sur scène. L'écran du téléphone reste allumé pendant la partie.
6. **Pas de clignotement rapide** : moins de 2 par seconde, sous le seuil de 3 de la norme d'accessibilité.

### 6.2 Les couleurs

| Équipe | Couleur | Symbole |
|---|---|---|
| Rouge | `#ff4545` | ■ carré |
| Orange | `#ff9a1f` | ▲ triangle |
| Jaune | `#ffe03a` | ★ étoile |
| Vert | `#2fd673` | ● rond |
| Bleu | `#3d8bff` | ◆ losange |
| Violet | `#a66bff` | ✚ croix |
| Rose | `#ff86c8` | ♥ cœur |

À vérifier sur place avec le vrai projecteur : le rouge et le rose, l'orange et le jaune doivent rester
bien distincts. Si les musiciens peuvent porter leur symbole, c'est encore mieux.

### 6.3 Le téléphone du public (`/`)

- **Accueil** : son équipe, son symbole, trois règles.
- **Vote** : l'énigme, la grille, le chrono. On touche une case ; les votes de l'équipe s'affichent en direct.
- **Résultat** : « Bravo ! » ou « Raté », avec la flèche du déplacement.
- **Déplacement** : « Regardez la scène ».
- **Énigmes et lexique** : toutes les énigmes, tous les indices, le sens des mots.
- Fonctionne en portrait et en paysage, dès 320 pixels de large.

### 6.4 Le grand écran (`/ecran`)

- **Accueil** : le QR code en grand, les règles en trois étapes, les équipes qui se remplissent.
- **Jeu** : la grille au centre, une carte par équipe (énigme, indices, participation au vote), l'étape en
  cours (1 Vote, 2 Résultat, 3 Déplacement) et le chrono.
- **Résultat** : sur chaque carte, le trajet du musicien en très gros.
- **Final** : la figure s'illumine aux couleurs des équipes.
- S'adapte aux formats 16:9 et 4:3. Le texte des cartes se réduit tout seul s'il est long.

### 6.5 La régie (`/regie`)

Protégée par un code. Six onglets :

| Onglet | Contenu |
|---|---|
| **Équipes** | Joueurs, votes en direct, échecs, indices ; donner un indice, révéler un pion, marquer un absent. |
| **Réglages** | Durées, durée visée, silhouette, énigmes publiques, entraide, enchaînement automatique. |
| **Scénario** | Cases de départ et à trouver, énigmes, indices, vérificateur ; export et import. |
| **Répétition** | Joueurs simulés, pour répéter sans public. |
| **Accès** | QR code, lien du grand écran, changement du code. |
| **Journal** | Le détail de chaque manche. |

Au-dessus : Lancer, Pause, Phase suivante, +10 s, Révéler les pions restants, et une grille où l'on peut
**corriger un pion à la main** ou **voter à la place d'une équipe**.

---

## 7. Architecture technique

### 7.1 Les choix

| Couche | Choix | Pourquoi |
|---|---|---|
| Langage | **TypeScript** partout | Les règles et les messages sont partagés entre le serveur et les écrans. |
| Interface | **Svelte 5** + Vite | Léger : moins de 40 Ko de code pour un téléphone, important avec une 4G moyenne. |
| Serveur | **Cloudflare Workers + un Durable Object** | Gratuit, pas de mise en veille gênante, un objet unique qui garde la partie et gère les chronos. |
| Temps réel | **PartyServer** et **PartySocket** | WebSockets avec reconnexion automatique. |
| Polices | Atkinson Hyperlegible et Bricolage Grotesque, hébergées avec l'appli | Lisibilité, et aucune dépendance à un service externe. |

Options écartées : Firebase (100 connexions simultanées au plus sur l'offre gratuite), Render (serveur
gratuit qui s'endort et peut redémarrer), Supabase (pas de logique serveur temps réel), Kahoot et
équivalents (pas de grille ni de logique d'équipes), appli native (installation obligatoire).

### 7.2 Comment ça marche

```
   Téléphones ─┐
   Grand écran ├── WebSocket ──▶ Cloudflare ──▶ Durable Object « GameRoom »
   Régie ──────┘                                 • garde l'état de la partie (enregistré en continu)
                                                 • fait avancer les phases (chronos par alarmes)
                                                 • dépouille les votes et applique les règles
                                                 • diffuse le résultat à tous les écrans
```

- **Le serveur fait autorité** : chronos, dépouillement et validation ne se font jamais sur un téléphone.
- **Les cases à trouver ne quittent jamais le serveur**, sauf vers la régie. Impossible de tricher en
  inspectant la page. Un test automatique le vérifie.
- **État complet à chaque changement** : un téléphone qui sort de veille est à jour immédiatement.
- **Chronos synchronisés** : le serveur diffuse l'heure de fin de la phase, chaque écran corrige l'écart
  de sa propre horloge.
- **Enregistrement continu** : si le serveur redémarre, la partie reprend où elle en était.

### 7.3 Vie privée

Aucune donnée personnelle : ni nom, ni compte, ni traceur, ni statistiques. Le téléphone garde seulement un
identifiant aléatoire, nécessaire pour retrouver son équipe après une mise en veille.

### 7.4 Organisation du code

```
src/shared/     le moteur de jeu : règles, énigmes, équipes (testé sans réseau)
src/server/     le serveur : GameRoom.ts
src/client/     les trois écrans (Svelte)
scenarios/      le scénario du concert
tests/unit/     tests du moteur
tests/e2e/      parties complètes dans de vrais navigateurs
tests/charge/   test de charge
```

---

## 8. Scène, réseau et jour J

- **Réseau** : la salle n'a que la 4G. Chaque téléphone consomme environ 250 Ko pour toute la partie :
  c'est très peu, mais il faut **vérifier sur place** que les opérateurs captent bien. L'ordinateur de régie
  doit avoir la connexion la plus fiable possible (partage de connexion en secours).
- **Écran** : un ordinateur relié au vidéoprojecteur ou aux panneaux LED, navigateur en plein écran sur
  `/ecran`. Désactiver sa mise en veille.
- **Plan B** : le serveur tourne aussi sur l'ordinateur de régie, sans Internet.
- **Plan C** : le public vote à main levée et la régie joue les votes à sa place.

Le déroulé complet, la check-list et les dépannages sont dans le [guide de régie](GUIDE-REGIE.md).

---

## 9. Tests

| Niveau | Ce qui est vérifié |
|---|---|
| **Moteur** (59 tests) | Dépouillement, égalités, cases disputées, échanges, chaînes et cycles, verrouillage, indices, vérificateur d'énigmes, absences, répartition des équipes. 300 parties aléatoires vérifient qu'il n'y a jamais deux pions sur la même case. |
| **Bout en bout** (24 tests) | Parties complètes dans de vrais navigateurs : téléphone, grand écran et régie ensemble ; reconnexion ; absence ; avance manuelle ; révélation ; protection de la régie ; messages invalides ; mise en page sur petits téléphones et écrans 4:3. |
| **Charge** | 200 téléphones simulés, dont un tiers qui se met en veille en pleine partie : tout le monde reçoit chaque changement de phase en quelques dizaines de millisecondes. |

---

## 10. Ce qui reste à faire avant le concert

1. **Mettre en ligne** : créer un compte Cloudflare gratuit et déployer (10 minutes, voir le README).
2. **Confirmer les trois points du §3**, puis relire énigmes et indices dans la régie.
3. **Tester dans la salle** avec 5 à 10 vrais téléphones de différents opérateurs, **dont des iPhone** :
   les tests automatiques tournent sur le moteur de Chrome, pas sur Safari. L'application est écrite pour
   fonctionner dès iOS 15, mais seul un essai sur de vrais appareils le confirmera.
4. **Répéter** avec les musiciens grâce aux joueurs simulés, puis faire une répétition avec un vrai groupe.
5. **Vérifier les couleurs** sur le vidéoprojecteur ou les panneaux LED.

---

## 11. Coûts

| Poste | Coût |
|---|---|
| Hébergement et temps réel (Cloudflare, offre gratuite) | 0 € |
| Adresse `tutti.<compte>.workers.dev` | 0 € |
| Code source et intégration continue (GitHub) | 0 € |
| Bibliothèques et polices (open source) | 0 € |
| Adhésif de marquage, chasubles de couleur | quelques dizaines d'euros, facultatif |

Une partie consomme moins de 1 % du quota gratuit quotidien de Cloudflare.

---

### Sources

- Cloudflare — Durable Objects sur l'offre gratuite : [tarifs](https://developers.cloudflare.com/durable-objects/platform/pricing/), [limites](https://developers.cloudflare.com/durable-objects/platform/limits/)
- Firebase — [limite de 100 connexions simultanées](https://firebase.google.com/docs/database/usage/limits?hl=fr)
- Render — [mise en veille des instances gratuites](https://render.com/docs/free)
- Accessibilité — seuil de 3 clignotements par seconde : WCAG 2.1, critère 2.3.1
