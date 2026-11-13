#!/usr/bin/env node
/**
 * Test de charge : simule une salle entière qui joue en même temps.
 *
 *   npm run test:charge -- --url https://tutti.exemple.workers.dev --pin MONCODE
 *
 * Options :
 *   --url       adresse du serveur            (défaut : http://localhost:8787)
 *   --joueurs   nombre de téléphones simulés  (défaut : 150)
 *   --manches   nombre de manches jouées      (défaut : 3)
 *   --pin       code de la régie              (défaut : variable TUTTI_PIN, sinon « charge-test »)
 *
 * ⚠️ Le test lance une vraie partie dans le salon : ne jamais le lancer pendant
 * un concert. À la fin, il remet le salon à l'accueil et rétablit les durées.
 */
import { Client, ouvrirRegie, pause } from './client.mjs';

function option(nom, defaut) {
  const index = process.argv.indexOf(`--${nom}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : defaut;
}

const URL_SERVEUR = option('url', 'http://localhost:8787');
const NB_JOUEURS = Number(option('joueurs', '150'));
const NB_MANCHES = Number(option('manches', '3'));
const PIN = option('pin', process.env.TUTTI_PIN ?? 'charge-test');
const DUREES_TEST = { premierVote: 6, vote: 6, affichage: 3, deplacement: 3 };

const problemes = [];
const signaler = (texte) => {
  problemes.push(texte);
  console.log(`  ✕ ${texte}`);
};
const valider = (condition, texte) => (condition ? console.log(`  ✓ ${texte}`) : signaler(texte));

function centile(valeurs, p) {
  if (valeurs.length === 0) return 0;
  const tries = [...valeurs].sort((a, b) => a - b);
  return tries[Math.min(tries.length - 1, Math.floor((p / 100) * tries.length))];
}

/** Note l'heure à laquelle un joueur apprend chaque changement de phase. */
function suivre(joueur, arrivees) {
  joueur.ecouteurs.add((m) => {
    // Seules les phases de jeu comptent : à l'accueil, l'état change à chaque arrivée.
    if (m.t !== 'etat' || m.e.phase === 'accueil') return;
    const cle = `${m.e.manche}:${m.e.phase}`;
    if (!arrivees.has(cle)) arrivees.set(cle, new Map());
    const recus = arrivees.get(cle);
    if (!recus.has(joueur.id)) recus.set(joueur.id, { local: performance.now(), retard: Date.now() - m.ts });
  });
}

async function allerRetour(joueur) {
  const debut = performance.now();
  const jeton = Math.floor(Math.random() * 1e9);
  const attente = new Promise((resoudre) => {
    const ecouteur = (m) => {
      if (m.t !== 'pong' || m.c !== jeton) return;
      joueur.ecouteurs.delete(ecouteur);
      resoudre(performance.now() - debut);
    };
    joueur.ecouteurs.add(ecouteur);
    setTimeout(() => {
      joueur.ecouteurs.delete(ecouteur);
      resoudre(Infinity);
    }, 5000);
  });
  joueur.envoyer({ t: 'ping', c: jeton });
  return attente;
}

console.log(`\nTest de charge Tutti — ${NB_JOUEURS} joueurs, ${NB_MANCHES} manches, serveur ${URL_SERVEUR}\n`);

const regie = await ouvrirRegie(URL_SERVEUR, PIN);
const dureesAvant = { ...regie.regie.scenario.durees };
const simulesAvant = regie.regie.simules;
const avanceAvant = regie.regie.avanceAuto;
regie.action({ a: 'reinitialiser', joueurs: true });
regie.action({ a: 'simules', nombre: 0 });
regie.action({ a: 'reglages', reglages: { durees: DUREES_TEST, avanceAuto: true } });
await regie.attendre((c) => c.etat.phase === 'accueil' && c.regie.scenario.durees.vote === DUREES_TEST.vote && c.regie.simules === 0, 8000, 'salon prêt');
const equipes = regie.etat.pions.filter((p) => !p.absent).map((p) => p.couleur);

// --- 1. Tout le monde scanne le QR code en même temps -------------------------------------------
console.log('1. Connexion des joueurs');
const debutConnexion = performance.now();
const joueurs = [];
const tempsConnexion = [];
const VAGUE = 25;
for (let i = 0; i < NB_JOUEURS; i += VAGUE) {
  const vague = Array.from({ length: Math.min(VAGUE, NB_JOUEURS - i) }, async () => {
    const debut = performance.now();
    const joueur = new Client(URL_SERVEUR, 'joueur');
    try {
      await joueur.ouvert;
      await joueur.attendre((c) => c.moi !== null && c.etat !== null, 10_000, 'état initial');
      tempsConnexion.push(performance.now() - debut);
      joueurs.push(joueur);
    } catch (erreur) {
      signaler(`connexion échouée : ${erreur.message}`);
    }
  });
  await Promise.all(vague);
}
valider(joueurs.length === NB_JOUEURS, `${joueurs.length}/${NB_JOUEURS} joueurs connectés en ${((performance.now() - debutConnexion) / 1000).toFixed(1)} s`);
console.log(`    connexion + premier état : médiane ${centile(tempsConnexion, 50).toFixed(0)} ms, 95 % sous ${centile(tempsConnexion, 95).toFixed(0)} ms`);

const tailles = equipes.map((couleur) => joueurs.filter((j) => j.moi.equipe === couleur).length);
valider(Math.max(...tailles) - Math.min(...tailles) <= 1, `équipes équilibrées : ${tailles.join(' / ')}`);
await regie.attendre((c) => c.etat.joueurs === joueurs.length, 8000, 'décompte des joueurs');
valider(regie.etat.joueurs === joueurs.length, `le serveur compte ${regie.etat.joueurs} joueurs`);

// --- 2. La partie ----------------------------------------------------------------------------------
console.log('\n2. Partie');
const arrivees = new Map();
for (const joueur of joueurs) suivre(joueur, arrivees);
regie.action({ a: 'lancer' });
let votesEnvoyes = 0;

for (let manche = 1; manche <= NB_MANCHES; manche++) {
  await regie.attendre((c) => c.etat.phase === 'vote' && c.etat.manche === manche, 30_000, `vote, manche ${manche}`);
  const dureeVote = (manche === 1 ? DUREES_TEST.premierVote : DUREES_TEST.vote) * 1000;

  // Chaque joueur vote au hasard, puis un sur deux change d'avis.
  for (const joueur of joueurs) {
    const voter = () => {
      if (joueur.ws.readyState !== WebSocket.OPEN || joueur.etat.phase !== 'vote' || joueur.etat.manche !== manche) return;
      const pion = joueur.etat.pions.find((p) => p.couleur === joueur.moi.equipe);
      if (!pion || pion.verrouille) return;
      const prises = new Set([...pion.essais, ...joueur.etat.pions.filter((p) => p.verrouille).map((p) => p.position)]);
      const libres = (joueur.etat.silhouette ?? []).filter((c) => !prises.has(c));
      if (libres.length === 0) return;
      joueur.voter(libres[Math.floor(Math.random() * libres.length)]);
      votesEnvoyes++;
    };
    setTimeout(voter, 300 + Math.random() * (dureeVote - 1500));
    if (Math.random() < 0.5) setTimeout(voter, 600 + Math.random() * (dureeVote - 1500));
  }

  if (manche === 1) {
    // Pendant le vote : un tiers des téléphones se met en veille puis revient.
    await pause(1500);
    const dormeurs = joueurs.filter((_, i) => i % 3 === 0);
    const equipesAvant = new Map(dormeurs.map((j) => [j.id, j.moi.equipe]));
    for (const joueur of dormeurs) joueur.fermer();
    await pause(1200);
    let retrouves = 0;
    await Promise.all(
      dormeurs.map(async (ancien) => {
        const retour = new Client(URL_SERVEUR, 'joueur', ancien.id);
        try {
          await retour.ouvert;
          await retour.attendre((c) => c.moi !== null && c.etat !== null, 10_000, 'état après reconnexion');
          if (retour.moi.equipe === equipesAvant.get(ancien.id) && retour.etat.manche === manche) retrouves++;
          suivre(retour, arrivees);
          joueurs[joueurs.indexOf(ancien)] = retour;
        } catch (erreur) {
          signaler(`reconnexion échouée : ${erreur.message}`);
        }
      }),
    );
    valider(retrouves === dormeurs.length, `${retrouves}/${dormeurs.length} téléphones « en veille » retrouvent leur équipe et la partie en cours`);
  }

  await regie.attendre((c) => c.etat.phase === 'affichage' && c.etat.manche === manche, 30_000, `résultat, manche ${manche}`);
  const votants = regie.etat.mouvements.reduce((total, m) => total + m.votants, 0);
  const trouves = regie.etat.mouvements.filter((m) => m.verrouille).length;
  console.log(`    manche ${manche} : ${votants} votes comptés, ${trouves} pion(s) trouvé(s)`);
  if (regie.etat.pions.every((p) => p.verrouille)) break;
}

const tours = await Promise.all(joueurs.map((joueur) => allerRetour(joueur)));
regie.action({ a: 'terminer' });
await regie.attendre((c) => c.etat.phase === 'final', 60_000, 'final');
await pause(800);

// --- 3. Mesures -------------------------------------------------------------------------------------
console.log('\n3. Mesures');
const etalements = [];
const retards = [];
let incomplets = 0;
for (const recus of arrivees.values()) {
  const instants = [...recus.values()].map((r) => r.local);
  for (const r of recus.values()) retards.push(r.retard);
  // Les téléphones « en veille » ont pu manquer un changement de phase : c'est attendu.
  if (recus.size < Math.floor(joueurs.length * 0.6)) incomplets++;
  etalements.push(Math.max(...instants) - Math.min(...instants));
}
valider(incomplets === 0, `les ${arrivees.size} changements de phase ont atteint la salle`);
const auFinal = joueurs.filter((j) => j.etat.phase === 'final').length;
valider(auFinal === joueurs.length, `${auFinal}/${joueurs.length} joueurs ont reçu l'écran final`);
valider(votesEnvoyes > 0, `${votesEnvoyes} votes envoyés`);
valider(tours.every((t) => t < 5000), `aller-retour serveur : médiane ${centile(tours, 50).toFixed(0)} ms, 95 % sous ${centile(tours, 95).toFixed(0)} ms`);
valider(
  centile(etalements, 95) < 1500,
  `changement de phase reçu par toute la salle en ${centile(etalements, 50).toFixed(0)} ms (médiane), ${Math.max(...etalements).toFixed(0)} ms au pire`,
);
const octets = joueurs.map((j) => j.octets);
const messages = joueurs.map((j) => j.recus);
console.log(`    données reçues par téléphone : ${(centile(octets, 50) / 1024).toFixed(0)} Ko (médiane), ${(Math.max(...octets) / 1024).toFixed(0)} Ko au plus, ${centile(messages, 50)} messages`);

// --- 4. Remise en état -----------------------------------------------------------------------------
regie.action({ a: 'reinitialiser', joueurs: true });
regie.action({ a: 'reglages', reglages: { durees: dureesAvant, avanceAuto: avanceAvant } });
regie.action({ a: 'simules', nombre: simulesAvant });
await pause(500);
for (const joueur of joueurs) joueur.fermer();
regie.fermer();
await pause(300);

if (problemes.length > 0) {
  console.log(`\n❌ ${problemes.length} problème(s) :\n${problemes.map((p) => `   - ${p}`).join('\n')}\n`);
  process.exit(1);
}
console.log('\n✅ La salle entière joue sans accroc.\n');
process.exit(0);
