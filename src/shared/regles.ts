/**
 * Le moteur de jeu : des fonctions pures, sans réseau ni horloge.
 * Tout ce qui décide de l'issue d'une manche est ici, et testé dans tests/unit.
 */

import type { Alea } from './alea';
import type { Couleur } from './couleurs';
import { TOUTES_LES_CASES, type Case } from './grille';
import type { Mouvement, PionEtat, PionScenario, Scenario } from './types';

/** Un pion vu par le moteur : le scénario et l'état de la partie réunis. */
export interface PionJeu {
  couleur: Couleur;
  cible: Case;
  absent: boolean;
  position: Case;
  verrouille: boolean;
  essais: readonly Case[];
  reveler: boolean;
  choixRegie: Case | null;
}

export interface OptionsVote {
  voteLibre: boolean;
  /** Cases de la figure (null si la silhouette est cachée). */
  silhouette: readonly Case[] | null;
}

/** Les cases de la figure à reconstituer, triées : l'ordre ne révèle rien. */
export function silhouetteDe(scenario: Pick<Scenario, 'pions'>): Case[] {
  return scenario.pions.map((p) => p.cible).sort();
}

export function optionsVote(scenario: Scenario): OptionsVote {
  return {
    voteLibre: scenario.options.voteLibre || !scenario.options.afficherSilhouette,
    silhouette: scenario.options.afficherSilhouette ? silhouetteDe(scenario) : null,
  };
}

/**
 * Cases de départ réellement utilisées.
 * Un pion absent reste « fantôme » sur sa case cible. Si un autre pion devait
 * démarrer sur cette case, il prend la case de départ de l'absent (libre, donc).
 */
export function departsEffectifs(pions: readonly PionScenario[]): Partial<Record<Couleur, Case>> {
  const fantomes = new Map<Case, PionScenario>(pions.filter((p) => p.absent).map((p) => [p.cible, p]));
  const prises = new Set<Case>(fantomes.keys());
  const resultat: Partial<Record<Couleur, Case>> = {};
  const aReplacer: PionScenario[] = [];
  for (const p of pions) {
    if (p.absent) {
      resultat[p.couleur] = p.cible;
    } else if (prises.has(p.depart)) {
      aReplacer.push(p);
    } else {
      resultat[p.couleur] = p.depart;
      prises.add(p.depart);
    }
  }
  const cibles = new Set(pions.map((p) => p.cible));
  for (const p of aReplacer) {
    // On remonte la chaîne : la case de départ de l'absent qui occupe ma case.
    let candidate: Case | undefined;
    let fantome = fantomes.get(p.depart);
    const vus = new Set<Couleur>();
    while (fantome && !vus.has(fantome.couleur)) {
      vus.add(fantome.couleur);
      if (!prises.has(fantome.depart)) {
        candidate = fantome.depart;
        break;
      }
      fantome = fantomes.get(fantome.depart);
    }
    candidate ??=
      TOUTES_LES_CASES.find((c) => !prises.has(c) && !cibles.has(c)) ??
      TOUTES_LES_CASES.find((c) => !prises.has(c));
    if (candidate) {
      resultat[p.couleur] = candidate;
      prises.add(candidate);
    }
  }
  return resultat;
}

/** État des pions au lancement d'une partie. */
export function etatsInitiaux(scenario: Pick<Scenario, 'pions'>): Partial<Record<Couleur, PionEtat>> {
  const departs = departsEffectifs(scenario.pions);
  const etats: Partial<Record<Couleur, PionEtat>> = {};
  for (const p of scenario.pions) {
    const position = departs[p.couleur] ?? p.depart;
    const dejaPlace = p.absent || position === p.cible;
    etats[p.couleur] = {
      position,
      verrouille: dejaPlace,
      // La case de départ est forcément fausse, sinon le pion serait déjà verrouillé.
      essais: dejaPlace ? [] : [position],
      echecs: 0,
      indices: 0,
      reveler: false,
      choixRegie: null,
    };
  }
  return etats;
}

/** Réunit le scénario et l'état de la partie. */
export function pionsEnJeu(scenario: Pick<Scenario, 'pions'>, etats: Partial<Record<Couleur, PionEtat>>): PionJeu[] {
  const pions: PionJeu[] = [];
  for (const p of scenario.pions) {
    const e = etats[p.couleur];
    if (!e) continue;
    pions.push({
      couleur: p.couleur,
      cible: p.cible,
      absent: p.absent,
      position: e.position,
      verrouille: e.verrouille,
      essais: e.essais,
      reveler: e.reveler,
      choixRegie: e.choixRegie,
    });
  }
  return pions;
}

/** Cases occupées par un pion qui ne bougera plus (verrouillé ou fantôme). */
export function casesVerrouillees(pions: readonly PionJeu[]): Set<Case> {
  return new Set(pions.filter((p) => p.verrouille || p.absent).map((p) => p.position));
}

/**
 * Cases sur lesquelles une équipe peut voter :
 * ni une case verrouillée, ni une case déjà essayée (dont la case actuelle du pion).
 */
export function casesVotables(pion: PionJeu, tous: readonly PionJeu[], options: OptionsVote): Case[] {
  if (pion.verrouille || pion.absent) return [];
  return filtrerVotables(pion.essais, casesVerrouillees(tous), options);
}

/** La même règle, à partir de ce que les téléphones connaissent (ils ignorent les cases cibles). */
export function filtrerVotables(
  essais: readonly Case[],
  verrouillees: ReadonlySet<Case>,
  options: OptionsVote,
): Case[] {
  const interdites = new Set<Case>(verrouillees);
  for (const c of essais) interdites.add(c);
  const base = options.voteLibre || !options.silhouette ? TOUTES_LES_CASES : options.silhouette;
  return base.filter((c) => !interdites.has(c));
}

export interface Depouillement {
  choix: Case | null;
  voix: number;
  votants: number;
}

/** La case qui a le plus de voix l'emporte ; en cas d'égalité, tirage au sort. */
export function depouiller(
  voix: Readonly<Record<Case, number>> | undefined,
  votables: ReadonlySet<Case>,
  alea: Alea,
): Depouillement {
  let max = 0;
  let votants = 0;
  let meilleures: Case[] = [];
  for (const [c, n] of Object.entries(voix ?? {})) {
    if (!votables.has(c) || !(n > 0)) continue;
    votants += n;
    if (n > max) {
      max = n;
      meilleures = [c];
    } else if (n === max) {
      meilleures.push(c);
    }
  }
  if (meilleures.length === 0) return { choix: null, voix: 0, votants: 0 };
  meilleures.sort();
  const index = Math.min(meilleures.length - 1, Math.floor(alea() * meilleures.length));
  return { choix: meilleures[index]!, voix: max, votants };
}

interface Intention {
  pion: PionJeu;
  dest: Case | null;
  voix: number;
  votants: number;
  revele: boolean;
  regie: boolean;
  /** Départage final, tiré au sort. */
  cle: number;
}

/** Ordre de passage : solution révélée, puis bonne case, puis choix de la régie, puis force du vote. */
function priorite(i: Intention): number[] {
  return [
    i.revele ? 1 : 0,
    i.dest === i.pion.cible ? 1 : 0,
    i.regie ? 1 : 0,
    i.voix,
    i.votants > 0 ? i.voix / i.votants : 0,
    i.cle,
  ];
}

function comparer(a: Intention, b: Intention): number {
  const pa = priorite(a);
  const pb = priorite(b);
  for (let k = 0; k < pa.length; k++) {
    if (pa[k] !== pb[k]) return pb[k]! - pa[k]!;
  }
  return 0;
}

/**
 * Résout une manche : à partir des votes, décide où va chaque pion.
 *
 * Règles :
 *  1. Chaque équipe vise la case qui a reçu le plus de voix (égalité : tirage au sort).
 *  2. Une équipe qui vise SA bonne case l'obtient toujours.
 *  3. Si plusieurs équipes visent la même case, la plus forte (voix, puis part de
 *     l'équipe, puis tirage au sort) l'obtient ; les autres ne bougent pas.
 *  4. Si la case visée est occupée par un pion non verrouillé, les deux pions
 *     échangent leurs places : personne n'est jamais bloqué.
 *  5. Tout pion qui termine sur sa case cible est verrouillé.
 */
export function resoudreManche(
  pions: readonly PionJeu[],
  votes: Readonly<Partial<Record<Couleur, Record<Case, number>>>>,
  options: OptionsVote,
  alea: Alea,
): Mouvement[] {
  const parCouleur = new Map(pions.map((p) => [p.couleur, p]));
  const position = new Map<Couleur, Case>(pions.map((p) => [p.couleur, p.position]));
  const occupant = new Map<Case, Couleur>(pions.map((p) => [p.position, p.couleur]));
  const verrouillees = casesVerrouillees(pions);

  const intentions: Intention[] = pions
    .filter((p) => !p.absent && !p.verrouille)
    .map((pion) => {
      const cle = alea();
      if (pion.reveler) {
        return { pion, dest: pion.cible, voix: 0, votants: 0, revele: true, regie: false, cle };
      }
      if (pion.choixRegie && !verrouillees.has(pion.choixRegie)) {
        return { pion, dest: pion.choixRegie, voix: 0, votants: 0, revele: false, regie: true, cle };
      }
      const votables = new Set(casesVotables(pion, pions, options));
      const d = depouiller(votes[pion.couleur], votables, alea);
      return { pion, dest: d.choix, voix: d.voix, votants: d.votants, revele: false, regie: false, cle };
    });

  const reclamees = new Set<Case>();
  const disputes = new Set<Couleur>();
  const deloges = new Set<Couleur>();

  for (const intention of intentions.filter((i) => i.dest !== null).sort(comparer)) {
    const moi = intention.pion.couleur;
    const dest = intention.dest!;
    const ici = position.get(moi)!;
    if (dest === ici) {
      reclamees.add(dest);
      continue;
    }
    if (reclamees.has(dest) || verrouillees.has(dest)) {
      disputes.add(moi);
      continue;
    }
    const autre = occupant.get(dest);
    if (autre !== undefined) {
      // Échange : l'occupant prend ma place.
      position.set(autre, ici);
      occupant.set(ici, autre);
      deloges.add(autre);
      // S'il tombe sur sa propre case, plus personne ne peut la lui prendre.
      if (parCouleur.get(autre)!.cible === ici) reclamees.add(ici);
    } else {
      occupant.delete(ici);
    }
    position.set(moi, dest);
    occupant.set(dest, moi);
    reclamees.add(dest);
  }

  return intentions.map((i) => {
    const couleur = i.pion.couleur;
    const vers = position.get(couleur)!;
    const juste = vers === i.pion.cible;
    return {
      couleur,
      de: i.pion.position,
      vers,
      choix: i.dest,
      voix: i.voix,
      votants: i.votants,
      issue: juste ? 'juste' : i.dest === null ? 'sansVote' : 'faux',
      verrouille: juste,
      dispute: disputes.has(couleur),
      echange: deloges.has(couleur) && vers !== i.dest,
      revele: i.revele,
      chance: juste && i.dest !== i.pion.cible,
    };
  });
}

/** Nombre d'indices révélés automatiquement après `echecs` manches sans trouver. */
export function indicesAutomatiques(echecs: number, echecsParIndice: number, disponibles: number): number {
  if (echecsParIndice <= 0) return 0;
  return Math.min(disponibles, Math.floor(echecs / echecsParIndice));
}

/** Applique le résultat d'une manche à l'état des pions. */
export function appliquerMouvements(
  scenario: Scenario,
  etats: Partial<Record<Couleur, PionEtat>>,
  mouvements: readonly Mouvement[],
): void {
  for (const m of mouvements) {
    const etat = etats[m.couleur];
    const pion = scenario.pions.find((p) => p.couleur === m.couleur);
    if (!etat || !pion) continue;
    etat.position = m.vers;
    etat.verrouille = m.verrouille;
    etat.reveler = false;
    etat.choixRegie = null;
    if (m.verrouille) continue;
    const essais = new Set(etat.essais);
    if (m.choix) essais.add(m.choix);
    essais.add(m.vers);
    essais.delete(pion.cible);
    etat.essais = [...essais].sort();
    etat.echecs += 1;
    etat.indices = Math.max(
      etat.indices,
      indicesAutomatiques(etat.echecs, scenario.options.echecsParIndice, pion.indices.length),
    );
  }
}

/** Vrai quand tous les pions présents sont verrouillés. */
export function tousPlaces(scenario: Pick<Scenario, 'pions'>, etats: Partial<Record<Couleur, PionEtat>>): boolean {
  return scenario.pions.every((p) => p.absent || etats[p.couleur]?.verrouille === true);
}

/** Couleurs des équipes encore en jeu. */
export function equipesEnJeu(scenario: Pick<Scenario, 'pions'>, etats: Partial<Record<Couleur, PionEtat>>): Couleur[] {
  return scenario.pions.filter((p) => !p.absent && etats[p.couleur]?.verrouille !== true).map((p) => p.couleur);
}
