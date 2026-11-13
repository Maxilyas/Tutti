/**
 * Le serveur, testé « par le fil » : des clients temps réel jouent une partie
 * exactement comme le feraient les écrans.
 */
import { expect, test } from '@playwright/test';
import {
  BASE,
  CIBLES,
  COULEURS,
  Client,
  DEPARTS,
  attendrePhase,
  connecterJoueurs,
  fermerTout,
  parEquipe,
  pause,
  preparer,
} from './outils';

test.describe.configure({ mode: 'serial' });

test('une partie complète : votes, erreurs, indice, révélation, renfort, final', async () => {
  const regie = await preparer();
  const ecran = new Client(BASE, 'ecran');
  await ecran.ouvert;
  const joueurs = await connecterJoueurs(7);
  const par = parEquipe(joueurs);

  // Répartition automatique : 7 joueurs, 7 équipes, aucune vide.
  expect(Object.keys(par).sort()).toEqual([...COULEURS].sort());
  await ecran.attendre((c) => c.etat.joueurs === 7, 5000, '7 joueurs connectés');
  expect(ecran.etat.phase).toBe('accueil');
  expect(ecran.etat.pions.every((p) => p.enigme === '')).toBe(true);
  expect(ecran.etat.silhouette).toEqual(Object.values(CIBLES).sort());

  regie.action({ a: 'lancer' });
  await attendrePhase(ecran, 'vote', 1);
  expect(ecran.etat.pions.every((p) => p.enigme.length > 0)).toBe(true);

  // Manche 1 : le rouge se trompe, le bleu trouve, le vert tente sa case actuelle (refusée).
  par.rouge!.voter('A1');
  par.bleu!.voter(CIBLES.bleu!);
  par.vert!.voter(DEPARTS.vert!);
  await regie.attendre((c) => c.regie.votes.rouge?.A1 === 1 && c.regie.votes.bleu?.[CIBLES.bleu!] === 1, 5000, 'dépouillement en direct');
  await par.rouge!.attendre((c) => c.tendance?.votes.A1 === 1, 5000, 'tendance de l’équipe rouge');
  expect(regie.regie.votes.vert).toBeUndefined();

  await attendrePhase(ecran, 'affichage', 1);
  const m1 = Object.fromEntries(ecran.etat.mouvements!.map((m) => [m.couleur, m]));
  expect(m1.rouge).toMatchObject({ de: 'D4', vers: 'A1', issue: 'faux', verrouille: false });
  expect(m1.bleu).toMatchObject({ vers: CIBLES.bleu, issue: 'juste', verrouille: true });
  expect(m1.vert).toMatchObject({ issue: 'sansVote' });
  await attendrePhase(ecran, 'deplacement', 1);
  await attendrePhase(ecran, 'vote', 2);
  expect(ecran.etat.pions.find((p) => p.couleur === 'rouge')).toMatchObject({ position: 'A1', echecs: 1 });

  // Manche 2 : pause, puis quatre équipes trouvent ; la régie révèle le rose et donne un indice à l'orange.
  regie.action({ a: 'pause' });
  await ecran.attendre((c) => c.etat.pause !== null, 3000, 'pause');
  const gele = ecran.etat.pause;
  await pause(900);
  expect(ecran.etat.phase).toBe('vote');
  expect(ecran.etat.pause).toBe(gele);
  regie.action({ a: 'reprendre' });
  await ecran.attendre((c) => c.etat.pause === null, 3000, 'reprise');
  for (const couleur of ['rouge', 'jaune', 'vert', 'violet']) par[couleur]!.voter(CIBLES[couleur]!);
  regie.action({ a: 'reveler', couleur: 'rose', actif: true });
  regie.action({ a: 'indice', couleur: 'orange' });
  await attendrePhase(ecran, 'affichage', 2);
  const m2 = Object.fromEntries(ecran.etat.mouvements!.map((m) => [m.couleur, m]));
  for (const couleur of ['rouge', 'jaune', 'vert', 'violet']) expect(m2[couleur]!.verrouille, couleur).toBe(true);
  expect(m2.rose).toMatchObject({ revele: true, verrouille: true, vers: CIBLES.rose });
  expect(m2.orange).toMatchObject({ issue: 'sansVote', verrouille: false });
  expect(ecran.etat.pions.find((p) => p.couleur === 'orange')!.indices).toHaveLength(1);

  // Renfort : le joueur bleu, dont l'équipe a trouvé, rejoint la dernière équipe en jeu.
  par.bleu!.envoyer({ t: 'renfort' });
  await par.bleu!.attendre((c) => c.moi.equipe === 'orange', 5000, 'renfort');
  await attendrePhase(ecran, 'vote', 3);
  par.bleu!.voter(CIBLES.orange!);
  await attendrePhase(ecran, 'final');
  expect(ecran.etat.pions.every((p) => p.verrouille)).toBe(true);
  expect(ecran.etat.pions.map((p) => p.position).sort()).toEqual(Object.values(CIBLES).sort());
  expect(regie.regie.journal).toHaveLength(3);
  expect(ecran.etat.tempsJeu).toBeGreaterThan(5000);

  fermerTout(regie, ecran, joueurs);
});

test('les cases à trouver ne sont jamais envoyées au public', async () => {
  const regie = await preparer();
  const ecran = new Client(BASE, 'ecran');
  await ecran.ouvert;
  const [joueur] = await connecterJoueurs(1);
  regie.action({ a: 'lancer' });
  await attendrePhase(ecran, 'vote', 1);
  joueur!.voter('A1');
  await attendrePhase(ecran, 'affichage', 1);
  await attendrePhase(ecran, 'vote', 2);

  for (const client of [ecran, joueur!]) {
    const tout = client.bruts.join('\n');
    expect(tout.length).toBeGreaterThan(1000);
    expect(tout).not.toContain('"cible"');
    expect(tout).not.toContain('"contraintes"');
    expect(tout).not.toContain('"t":"regie"');
  }
  // La régie, elle, les reçoit.
  expect(regie.bruts.join('\n')).toContain('"cible"');
  fermerTout(regie, ecran, joueur!);
});

test('la régie est protégée par son code', async () => {
  const regie = await preparer();
  const intrus = new Client(BASE, 'regie');
  await intrus.ouvert;
  await intrus.attendre((c) => c.auth !== null, 5000, 'réponse du serveur');
  expect(intrus.auth).toMatchObject({ ok: false, aDefinir: false });

  // Sans code, les commandes sont ignorées.
  intrus.action({ a: 'lancer' });
  intrus.envoyer({ t: 'definirPin', pin: 'pirate-1234' });
  intrus.envoyer({ t: 'auth', pin: 'mauvais-code' });
  await intrus.attendre((c) => c.auth?.raison === 'Code incorrect.', 5000, 'refus du mauvais code');
  intrus.envoyer({ t: 'auth', jeton: 'jeton-invente' });
  await pause(500);
  expect(regie.etat.phase).toBe('accueil');
  expect(intrus.regie).toBeNull();

  // Un joueur ne peut pas non plus piloter.
  const [joueur] = await connecterJoueurs(1);
  joueur!.action({ a: 'lancer' });
  joueur!.envoyer({ t: 'auth', pin: 'tutti-test' });
  await pause(500);
  expect(regie.etat.phase).toBe('accueil');
  expect(joueur!.regie).toBeNull();
  fermerTout(regie, intrus, joueur!);
});

test('les messages invalides sont ignorés sans casser la partie', async () => {
  const regie = await preparer();
  const ecran = new Client(BASE, 'ecran');
  await ecran.ouvert;
  const joueurs = await connecterJoueurs(7);
  const par = parEquipe(joueurs);
  regie.action({ a: 'lancer' });
  await attendrePhase(ecran, 'vote', 1);

  par.rouge!.envoyer({ t: 'vote', manche: 99, case: 'B1' }); // mauvaise manche
  par.rouge!.envoyer({ t: 'vote', manche: 1, case: 'Z9' }); // case inconnue
  par.rouge!.envoyer({ t: 'vote', manche: 1 }); // incomplet
  par.rouge!.envoyer({ t: 'inconnu', x: 1 });
  par.rouge!.brut('{pas du JSON');
  par.rouge!.brut('');
  par.rouge!.brut('x'.repeat(70_000));
  par.rouge!.envoyer('une simple phrase');
  par.rouge!.envoyer([1, 2, 3]);
  par.rouge!.envoyer(null);
  ecran.envoyer({ t: 'vote', manche: 1, case: 'B1' }); // un écran ne vote pas
  regie.action({ a: 'deplacer', couleur: 'turquoise' as never, case: 'A1' });
  regie.action({ a: 'deplacer', couleur: 'rouge', case: 'Z9' });
  regie.action({ a: 'inexistante' } as never);
  await pause(700);
  expect(regie.regie.votes.rouge).toBeUndefined();

  // Le serveur répond toujours, et un vote valide passe.
  par.rouge!.voter('B1');
  await regie.attendre((c) => c.regie.votes.rouge?.B1 === 1, 5000, 'vote valide');
  await attendrePhase(ecran, 'affichage', 1);
  expect(ecran.etat.mouvements!.find((m) => m.couleur === 'rouge')).toMatchObject({ verrouille: true });
  fermerTout(regie, ecran, joueurs);
});

test('une connexion mal formée est refusée', async () => {
  const tenter = (chemin: string) =>
    new Promise<boolean>((resoudre) => {
      const ws = new WebSocket(`${BASE.replace('http', 'ws')}${chemin}`);
      ws.onopen = () => {
        ws.close();
        resoudre(true);
      };
      ws.onerror = () => resoudre(false);
      setTimeout(() => resoudre(false), 5000);
    });
  expect(await tenter('/parties/game-room/tutti?role=ecran&id=abcdefgh1234')).toBe(true);
  for (const requete of ['role=pirate&id=abcdefgh1234', 'role=joueur&id=x', 'role=joueur', 'id=abcdefgh1234', '']) {
    expect(await tenter(`/parties/game-room/tutti?${requete}`), requete).toBe(false);
  }
  // Un autre salon que « tutti » n'existe pas.
  expect(await tenter('/parties/game-room/autre?role=ecran&id=abcdefgh1234')).toBe(false);
  // Et le temps réel ne répond pas aux requêtes ordinaires.
  expect((await fetch(`${BASE}/parties/game-room/tutti`)).status).toBe(404);
});

test('aucune porte de diagnostic n’est ouverte sur le réseau', async () => {
  // En secours local, le public est sur le même réseau que le serveur : les outils
  // de diagnostic (qui donnent accès aux données de la partie) doivent être fermés.
  for (const chemin of [
    '/cdn-cgi/local/explorer/api',
    '/cdn-cgi/local/explorer/api/workers/durable_objects/namespaces',
    '/cdn-cgi/explorer',
    '/__debug',
  ]) {
    const reponse = await fetch(`${BASE}${chemin}`);
    const corps = await reponse.text();
    // Ces adresses n'existent pas : on retombe sur la page de l'application.
    expect(corps, chemin).toContain('<div id="app">');
    expect(corps, chemin).not.toContain('durable_objects');
    expect(corps, chemin).not.toContain('devtools');
  }
});

test('un téléphone qui se reconnecte retrouve son équipe et son vote', async () => {
  const regie = await preparer({ durees: { premierVote: 8, vote: 8, affichage: 2, deplacement: 2 } });
  const joueurs = await connecterJoueurs(7);
  const premier = joueurs[0]!;
  const equipe = premier.moi.equipe!;
  regie.action({ a: 'lancer' });
  await attendrePhase(premier, 'vote', 1);
  const choix = equipe === 'rouge' ? 'A2' : 'A1';
  premier.voter(choix);
  await regie.attendre((c) => c.regie.votes[equipe as 'rouge']?.[choix] === 1, 5000, 'vote enregistré');

  premier.fermer();
  await regie.attendre((c) => c.etat.joueurs === 6, 5000, 'déconnexion vue');
  const retour = new Client(BASE, 'joueur', premier.id);
  await retour.ouvert;
  await retour.attendre((c) => c.moi !== null && c.tendance !== null, 5000, 'état rendu à la reconnexion');
  expect(retour.moi).toMatchObject({ equipe, vote: choix, manche: 1 });
  expect(retour.etat.phase).toBe('vote');
  expect(retour.tendance!.votes[choix]).toBe(1);
  await regie.attendre((c) => c.etat.joueurs === 7, 5000, 'reconnexion vue');
  fermerTout(regie, retour, joueurs.slice(1));
});

test('musicien absent : pion fantôme, équipe répartie, partie jouable à six', async () => {
  const regie = await preparer();
  const joueurs = await connecterJoueurs(14);
  // L'orange est absent : sa case (E4) est justement la case de départ du rose.
  regie.action({ a: 'absent', couleur: 'orange', absent: true });
  await regie.attendre((c) => c.etat.pions.find((p) => p.couleur === 'orange')?.absent === true, 5000, 'orange absent');
  const orange = regie.etat.pions.find((p) => p.couleur === 'orange')!;
  const rose = regie.etat.pions.find((p) => p.couleur === 'rose')!;
  expect(orange).toMatchObject({ position: 'E4', verrouille: true, absent: true });
  expect(rose).toMatchObject({ position: 'E1', verrouille: false });

  // Les joueurs de l'équipe orange ont été répartis dans les autres équipes.
  await Promise.all(joueurs.map((j) => j.attendre((c) => c.moi.equipe !== 'orange', 5000, 'plus personne en orange')));
  expect(regie.etat.equipes.orange ?? 0).toBe(0);
  const par = parEquipe(joueurs);
  expect(Object.keys(par).sort()).toEqual(COULEURS.filter((c) => c !== 'orange').sort());

  regie.action({ a: 'lancer' });
  await attendrePhase(regie, 'vote', 1);
  // On ne peut pas voter pour la case du fantôme.
  par.rose!.voter('E4');
  for (const couleur of Object.keys(par)) par[couleur]!.voter(CIBLES[couleur]!);
  await attendrePhase(regie, 'affichage', 1);
  expect(regie.etat.mouvements).toHaveLength(6);
  expect(regie.etat.mouvements!.every((m) => m.verrouille)).toBe(true);
  await attendrePhase(regie, 'final');
  fermerTout(regie, joueurs);
});

test('avance manuelle : chaque phase attend la régie', async () => {
  const regie = await preparer({ avanceAuto: false, durees: { premierVote: 2, vote: 2, affichage: 2, deplacement: 2 } });
  const joueurs = await connecterJoueurs(7);
  regie.action({ a: 'lancer' });
  await attendrePhase(regie, 'vote', 1);
  await regie.attendre((c) => c.etat.attenteRegie, 6000, 'attente de la régie');
  await pause(1200);
  expect(regie.etat.phase).toBe('vote');
  // Le vote reste ouvert tant que la régie n'a pas enchaîné.
  joueurs[0]!.voter(CIBLES[joueurs[0]!.moi.equipe!]!);
  await pause(600);
  regie.action({ a: 'suivant' });
  await attendrePhase(regie, 'affichage', 1);
  expect(regie.etat.mouvements!.find((m) => m.couleur === joueurs[0]!.moi.equipe)).toMatchObject({ verrouille: true });
  await regie.attendre((c) => c.etat.attenteRegie, 6000, 'attente après le résultat');
  regie.action({ a: 'prolonger', secondes: 2 });
  await regie.attendre((c) => !c.etat.attenteRegie && c.etat.finPhase !== null, 3000, 'chrono prolongé');
  expect(regie.etat.phase).toBe('affichage');
  regie.action({ a: 'suivant' });
  await attendrePhase(regie, 'deplacement', 1);
  // Retour à l'automatique : la partie reprend toute seule.
  await regie.attendre((c) => c.etat.attenteRegie, 6000, 'attente après le déplacement');
  regie.action({ a: 'reglages', reglages: { avanceAuto: true } });
  await attendrePhase(regie, 'vote', 2);
  fermerTout(regie, joueurs);
});

test('la régie peut révéler les pions restants et corriger un pion à la main', async () => {
  const regie = await preparer({ durees: { premierVote: 6, vote: 6, affichage: 2, deplacement: 2 } });
  const joueurs = await connecterJoueurs(7);
  const par = parEquipe(joueurs);
  regie.action({ a: 'lancer' });
  await attendrePhase(regie, 'vote', 1);

  // Correction : le rouge est déplacé à la main, d'abord sur une mauvaise case puis sur la bonne.
  regie.action({ a: 'deplacer', couleur: 'rouge', case: 'A1' });
  await regie.attendre((c) => c.etat.pions.find((p) => p.couleur === 'rouge')?.position === 'A1', 3000, 'rouge en A1');
  expect(regie.etat.pions.find((p) => p.couleur === 'rouge')).toMatchObject({ verrouille: false });
  regie.action({ a: 'deplacer', couleur: 'rouge', case: CIBLES.rouge! });
  await regie.attendre((c) => c.etat.pions.find((p) => p.couleur === 'rouge')?.verrouille === true, 3000, 'rouge verrouillé');

  // Échange manuel : le bleu va sur la case du vert, qui prend la sienne.
  regie.action({ a: 'deplacer', couleur: 'bleu', case: DEPARTS.vert! });
  await regie.attendre((c) => c.etat.pions.find((p) => p.couleur === 'bleu')?.position === DEPARTS.vert, 3000, 'échange');
  expect(regie.etat.pions.find((p) => p.couleur === 'vert')!.position).toBe(DEPARTS.bleu);

  // Vote « à main levée » : la régie choisit pour le jaune.
  par.jaune!.voter('A1');
  regie.action({ a: 'choisir', couleur: 'jaune', case: CIBLES.jaune! });
  await regie.attendre((c) => c.regie.pions.jaune?.choixRegie === CIBLES.jaune, 3000, 'choix de la régie');

  // Fin anticipée : tous les pions restants sont révélés.
  regie.action({ a: 'terminer' });
  await attendrePhase(regie, 'affichage', 1);
  expect(regie.etat.mouvements!.every((m) => m.verrouille && m.revele)).toBe(true);
  await attendrePhase(regie, 'final');
  expect(regie.etat.pions.map((p) => p.position).sort()).toEqual(Object.values(CIBLES).sort());
  fermerTout(regie, joueurs);
});

test('réinitialisation : mêmes équipes ou nouveau public', async () => {
  const regie = await preparer();
  const joueurs = await connecterJoueurs(7);
  const avant = joueurs.map((j) => j.moi.equipe);
  const session = regie.etat.session;
  regie.action({ a: 'lancer' });
  await attendrePhase(regie, 'vote', 1);

  regie.action({ a: 'reinitialiser', joueurs: false });
  await attendrePhase(regie, 'accueil');
  expect(regie.etat.session).toBe(session);
  expect(regie.etat.manche).toBe(0);
  expect(joueurs.map((j) => j.moi.equipe)).toEqual(avant);
  expect(regie.etat.pions.map((p) => p.position)).toEqual(COULEURS.map((c) => DEPARTS[c]));

  regie.action({ a: 'reinitialiser', joueurs: true });
  await regie.attendre((c) => c.etat.session === session + 1, 3000, 'nouvelle session');
  // Les téléphones restés connectés sont réinscrits : toujours 7 équipes de 1.
  await regie.attendre((c) => c.etat.joueurs === 7, 3000, 'joueurs réinscrits');
  await pause(300);
  expect(new Set(joueurs.map((j) => j.moi.equipe)).size).toBe(7);
  fermerTout(regie, joueurs);
});

test('répétition : 49 joueurs simulés terminent la partie tout seuls', async () => {
  test.setTimeout(150_000);
  const regie = await preparer({ durees: { premierVote: 3, vote: 3, affichage: 1, deplacement: 1 } });
  regie.action({ a: 'simules', nombre: 49 });
  await regie.attendre((c) => c.etat.joueurs === 49, 5000, '49 joueurs simulés');
  expect(Object.values(regie.etat.equipes)).toEqual([7, 7, 7, 7, 7, 7, 7]);

  regie.action({ a: 'lancer' });
  await attendrePhase(regie, 'vote', 1);
  await regie.attendre((c) => Object.values(c.regie.equipes).some((e) => (e?.votants ?? 0) > 0), 5000, 'premiers votes simulés');
  await attendrePhase(regie, 'final', undefined, 120_000);
  expect(regie.etat.pions.every((p) => p.verrouille)).toBe(true);
  expect(regie.etat.manche).toBeLessThanOrEqual(15);

  regie.action({ a: 'simules', nombre: 0 });
  await regie.attendre((c) => c.etat.joueurs === 0, 5000, 'joueurs simulés retirés');
  fermerTout(regie);
});
