# Guide de régie

Ce guide accompagne la personne qui pilote Tutti le jour du concert. Il ne demande aucune connaissance
technique.

**Trois adresses à connaître** (remplacer par l'adresse de votre application) :

| Qui | Adresse |
|---|---|
| Le public | `https://tutti.….workers.dev/` — c'est celle du QR code |
| Le grand écran | `https://tutti.….workers.dev/ecran` |
| La régie | `https://tutti.….workers.dev/regie` |

---

## 1. La semaine d'avant

1. **Ouvrir la régie** et saisir le code (6 caractères au moins, à choisir à la première visite). Le noter
   à deux endroits : il est demandé sur chaque nouvel appareil.
2. **Relire le scénario** (onglet *Scénario*) : cases de départ, cases à trouver, énigmes, indices.
   Le vérificateur doit afficher « ✓ Solution unique ».
3. **Exporter le scénario** (bouton *Exporter*) : c'est votre copie de sauvegarde.
4. **Répéter avec les musiciens** grâce aux joueurs simulés (onglet *Répétition*, 49 joueurs) :
   ils votent tout seuls, comme un public. Ajuster les durées (onglet *Réglages*) jusqu'à ce que les
   musiciens soient à l'aise.
5. **Tester dans la salle** avec 5 à 10 vrais téléphones, de plusieurs opérateurs. Si la 4G passe mal,
   prévoir le plan B (§5).
6. **Vérifier les couleurs** sur le vidéoprojecteur ou les panneaux LED : le rouge et le rose, l'orange et
   le jaune doivent se distinguer de loin.

## 2. Le jour J, avant l'entrée du public

- [ ] L'ordinateur du grand écran est branché sur secteur, **mise en veille désactivée**.
- [ ] Le grand écran affiche `/ecran` **en plein écran** (touche F11) : on voit le QR code.
- [ ] La régie est ouverte sur un autre appareil (ordinateur ou tablette).
- [ ] Onglet *Répétition* : **« Aucun » joueur simulé**.
- [ ] Onglet *Équipes* : cocher « Musicien absent » si besoin (§4).
- [ ] La régie affiche « Accueil » et « 0 joueur ». Sinon : *Revenir à l'accueil* → *Tout remettre à zéro*.
- [ ] Les musiciens sont sur leurs **cases de départ** (la grille de la régie les montre).
- [ ] Un test rapide avec son propre téléphone : scanner, voir son équipe.

## 3. Pendant la performance

### Le déroulé

1. **Le public scanne le QR code.** Chaque téléphone affiche son équipe ; le grand écran compte les joueurs.
   Laisser deux à trois minutes, puis expliquer les règles.
2. **Lancer la partie** : gros bouton blanc. Les énigmes apparaissent partout.
3. **La partie avance toute seule** : Vote → Résultat → Déplacement, manche après manche.
4. **Final** : quand tous les pions sont en place, « Tutti ! » s'affiche.

### Les commandes

| Bouton | Raccourci clavier | Effet |
|---|---|---|
| **Pause** / **Reprendre** | Espace | Gèle le chrono. À utiliser au moindre couac. Fonctionne à tout moment, sauf quand on tape dans un champ. |
| **Phase suivante** | → | Passe tout de suite à la suite, sans attendre la fin du chrono. |
| **+10 s** | + | Ajoute 10 secondes à la phase en cours. |
| **Révéler les pions restants** | | Envoie les pions restants sur leur case et termine la partie. |
| **Revenir à l'accueil** | | Efface la partie. Deux choix : garder les équipes, ou tout remettre à zéro. |

**Reprendre la main complètement** : décocher « Enchaîner les phases automatiquement ». Chaque phase
attend alors que vous cliquiez *Phase suivante*. Utile si les enfants ont besoin de plus de temps pour se
déplacer.

### Aider une équipe

Onglet *Équipes*, sur la ligne de l'équipe :

- **Donner un indice** : révèle son prochain indice, sur ses téléphones et sur le grand écran.
- **Révéler à la prochaine manche** : à la manche suivante, son musicien ira directement sur la bonne case.

Les indices arrivent aussi tout seuls, tous les 2 échecs (réglable).

### Si la partie dure trop

Quand la durée visée est dépassée (4 min 30 par défaut), un bandeau orange apparaît en haut de la régie.
Cliquer **Révéler les pions restants**, puis confirmer.

### Corriger un pion

Un musicien s'est trompé de case, ou l'écran ne correspond plus à la scène :

1. Sur la grille de la régie, **cliquer le pion**.
2. Laisser « le déplace tout de suite » coché.
3. **Cliquer la case** où se trouve réellement le musicien, même si un autre pion y est affiché.

Si la case est occupée par un autre pion, les deux échangent leurs places. Un pion posé sur sa bonne case
est verrouillé. La touche Échap annule la sélection.

Les corrections se font pendant le vote ou le déplacement. Pendant l'affichage du résultat, la grille
montre encore les anciennes places : attendre la phase suivante.

## 4. Un musicien est absent

Avant de lancer, onglet *Équipes*, cocher **Musicien absent** sur sa ligne.

- Son pion s'affiche en pointillés sur sa case à trouver et n'en bouge pas.
- Les énigmes des autres restent justes : « à côté du bleu » se lit toujours sur la grille.
- Son équipe disparaît ; ses joueurs sont répartis dans les autres.
- Si un autre musicien devait démarrer sur cette case, la régie indique sa nouvelle case de départ
  (onglet *Scénario*).

Décocher la case annule tout.

## 5. En cas de problème

| Problème | Que faire |
|---|---|
| Un téléphone affiche « Reconnexion… » | Rien : il se reconnecte seul et retrouve son équipe. |
| Un spectateur a fermé la page | Il rescanne le QR code : il retrouve son équipe. |
| Le grand écran est figé | Recharger la page (F5). Il reprend exactement où en est la partie. |
| La régie demande le code | Le ressaisir. La partie continue pendant ce temps. Après 5 codes faux, il faut attendre une minute. |
| La régie affiche « Connexion perdue : la commande n'est pas partie » | Attendre que « Connecté » revienne en haut à droite, puis recliquer. |
| Une équipe ne vote pas | Donner un indice, ou « Révéler à la prochaine manche ». |
| Le public n'arrive pas à se connecter (4G saturée) | Plan C ci-dessous. |
| Plus d'Internet du tout | Plan B ci-dessous. |

### Plan B — sans Internet : le serveur sur l'ordinateur de régie

À préparer **avant** le concert, avec la personne qui a installé l'application.

1. Sur l'ordinateur de régie : `npm run local`. Une adresse s'affiche, par exemple `http://192.168.1.20:8787`.
2. Le grand écran et la régie utilisent cette adresse (`…:8787/ecran` et `…:8787/regie`).
3. Le public ne peut jouer que si ses téléphones sont sur le **même réseau Wi‑Fi** que l'ordinateur.
   Beaucoup de téléphones quittent un Wi‑Fi sans Internet : dans ce cas, passer au plan C.

Dans ce mode, le code de régie et la partie sont ceux de l'ordinateur, pas ceux de la version en ligne.

### Plan C — le public vote à main levée

Le grand écran et la régie fonctionnent (en ligne ou en plan B), mais pas les téléphones du public.

1. Onglet *Réglages* : décocher « Enchaîner les phases automatiquement ».
2. Lancer la partie. Lire les énigmes à voix haute : elles sont sur le grand écran.
3. Pour chaque équipe, demander à la salle de voter à main levée. Sur la grille de la régie :
   **cliquer le pion**, choisir **« vote à la place de l'équipe »**, puis **cliquer la case** choisie.
4. Cliquer *Phase suivante* pour afficher le résultat, puis à nouveau pour le déplacement.

Le spectacle a lieu quoi qu'il arrive.

## 6. Après le concert

- *Revenir à l'accueil* → *Tout remettre à zéro* efface la partie et les joueurs.
- Rien d'autre à faire : l'application ne coûte rien quand personne ne s'en sert, et ne conserve aucune
  donnée personnelle.

---

## Questions fréquentes

**Combien de joueurs au maximum ?**
L'application a été testée avec 200 téléphones en même temps. Au-delà de 600, les nouveaux arrivants
regardent la partie sans voter.

**Peut-on jouer à plusieurs sur un téléphone ?**
Oui. Le vote est par appareil : on se met d'accord, puis on touche la case.

**Quelqu'un arrive en retard ?**
Il scanne le QR code et rejoint l'équipe encore en jeu qui a le moins de joueurs.

**Que voit une équipe qui a trouvé ?**
« Votre musicien est en place », et un bouton pour aller aider une autre équipe.

**Peut-on rejouer tout de suite ?**
Oui : *Revenir à l'accueil* → *Rejouer avec les mêmes équipes*.

**Peut-on changer la figure ?**
Oui, onglet *Scénario* : cases, énigmes et indices se modifient avant le lancement. Le vérificateur
contrôle que les énigmes mènent à une seule solution.
