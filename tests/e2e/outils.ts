import { readFileSync } from 'node:fs';
import { Client, ouvrirRegie, pause } from '../charge/client.mjs';
import type { Reglages } from '../../src/shared/protocole';

export { Client, pause };

export const BASE = 'http://localhost:5199';
export const PIN = 'tutti-test';

const concert = JSON.parse(readFileSync(new URL('../../scenarios/concert.json', import.meta.url), 'utf8')) as {
  pions: Array<{ couleur: string; depart: string; cible: string }>;
};

/** Les cases à trouver du scénario du concert (connues des tests, jamais du public). */
export const CIBLES: Record<string, string> = Object.fromEntries(concert.pions.map((p) => [p.couleur, p.cible]));
export const DEPARTS: Record<string, string> = Object.fromEntries(concert.pions.map((p) => [p.couleur, p.depart]));
export const COULEURS = concert.pions.map((p) => p.couleur);

export const DUREES_COURTES = { premierVote: 3, vote: 3, affichage: 2, deplacement: 2 };

/** Ouvre la régie et remet le salon dans un état connu. */
export async function preparer(reglages: Reglages = {}): Promise<Client> {
  const regie = await ouvrirRegie(BASE, PIN);
  regie.action({ a: 'reinitialiser', joueurs: true });
  regie.action({ a: 'scenarioDefaut' });
  regie.action({ a: 'simules', nombre: 0 });
  regie.action({
    a: 'reglages',
    reglages: { durees: DUREES_COURTES, avanceAuto: true, dureeCible: 270, ...reglages },
  });
  await regie.attendre(
    (c) =>
      c.etat?.phase === 'accueil' &&
      c.regie?.scenario.durees.vote === (reglages.durees?.vote ?? DUREES_COURTES.vote) &&
      c.regie.avanceAuto === (reglages.avanceAuto ?? true) &&
      c.regie.simules === 0 &&
      c.regie.scenario.pions.every((p) => !p.absent),
    5000,
    'salon prêt',
  );
  return regie;
}

/** Connecte `n` joueurs et attend qu'ils aient une équipe. */
export async function connecterJoueurs(n: number): Promise<Client[]> {
  const joueurs: Client[] = [];
  for (let i = 0; i < n; i++) {
    const joueur = new Client(BASE, 'joueur');
    await joueur.ouvert;
    await joueur.attendre((c) => !!c.moi?.equipe, 5000, 'équipe attribuée');
    joueurs.push(joueur);
  }
  return joueurs;
}

export function parEquipe(joueurs: Client[]): Record<string, Client> {
  return Object.fromEntries(joueurs.map((j) => [j.moi.equipe as string, j]));
}

export async function attendrePhase(client: Client, phase: string, manche?: number, delai = 15_000): Promise<void> {
  await client.attendre(
    (c) => c.etat?.phase === phase && (manche === undefined || c.etat.manche === manche),
    delai,
    `phase ${phase}${manche ? ` (manche ${manche})` : ''}`,
  );
}

export function fermerTout(...clients: Array<Client | Client[]>): void {
  for (const client of clients.flat()) client.fermer();
}
