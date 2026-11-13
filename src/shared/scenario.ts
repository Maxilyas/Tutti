/**
 * La validation de tout scénario reçu (régie, import, fichier du concert).
 *
 * Ce module est partagé avec les écrans : il ne doit contenir aucun scénario.
 * Celui du concert, avec ses cases à trouver, est dans src/server/scenarioDefaut.ts.
 */

import { COULEURS, Le, estCouleur, type Couleur } from './couleurs';
import { nettoyerContrainte, type Contrainte } from './enigmes';
import { estCase } from './grille';
import type { Durees, OptionsScenario, PionScenario, Scenario } from './types';

export const LIMITES = {
  pionsMin: 2,
  pionsMax: COULEURS.length,
  titre: 40,
  enigme: 160,
  indice: 160,
  indices: 4,
  contraintes: 5,
  dureeMin: 2,
  dureeMax: 300,
  dureeCibleMax: 3600,
} as const;

export const DUREES_DEFAUT: Durees = { premierVote: 30, vote: 20, affichage: 15, deplacement: 15 };

export const OPTIONS_DEFAUT: OptionsScenario = {
  afficherSilhouette: true,
  enigmesPubliques: true,
  voteLibre: true,
  renfort: true,
  echecsParIndice: 2,
};

function texte(valeur: unknown, max: number): string {
  return typeof valeur === 'string' ? valeur.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function entier(valeur: unknown, min: number, max: number, defaut: number): number {
  const n = typeof valeur === 'number' ? valeur : Number(valeur);
  if (!Number.isFinite(n)) return defaut;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function booleen(valeur: unknown, defaut: boolean): boolean {
  return typeof valeur === 'boolean' ? valeur : defaut;
}

export function nettoyerDurees(brut: unknown, defaut: Durees = DUREES_DEFAUT): Durees {
  const b = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>;
  return {
    premierVote: entier(b.premierVote, LIMITES.dureeMin, LIMITES.dureeMax, defaut.premierVote),
    vote: entier(b.vote, LIMITES.dureeMin, LIMITES.dureeMax, defaut.vote),
    affichage: entier(b.affichage, LIMITES.dureeMin, LIMITES.dureeMax, defaut.affichage),
    deplacement: entier(b.deplacement, LIMITES.dureeMin, LIMITES.dureeMax, defaut.deplacement),
  };
}

export function nettoyerOptions(brut: unknown, defaut: OptionsScenario = OPTIONS_DEFAUT): OptionsScenario {
  const b = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>;
  const afficherSilhouette = booleen(b.afficherSilhouette, defaut.afficherSilhouette);
  return {
    afficherSilhouette,
    enigmesPubliques: booleen(b.enigmesPubliques, defaut.enigmesPubliques),
    // Sans silhouette, on ne peut pas limiter le vote à des cases que personne ne voit.
    voteLibre: afficherSilhouette ? booleen(b.voteLibre, defaut.voteLibre) : true,
    renfort: booleen(b.renfort, defaut.renfort),
    echecsParIndice: entier(b.echecsParIndice, 0, 10, defaut.echecsParIndice),
  };
}

export type ResultatValidation = { ok: true; scenario: Scenario } | { ok: false; erreurs: string[] };

/**
 * Vérifie et remet au propre un scénario reçu de l'extérieur.
 * Rien n'est jamais accepté tel quel : chaque champ est contrôlé.
 */
export function validerScenario(brut: unknown): ResultatValidation {
  const erreurs: string[] = [];
  if (!brut || typeof brut !== 'object') return { ok: false, erreurs: ['Le scénario est illisible.'] };
  const b = brut as Record<string, unknown>;
  const pionsBruts = Array.isArray(b.pions) ? b.pions : [];
  if (pionsBruts.length < LIMITES.pionsMin || pionsBruts.length > LIMITES.pionsMax) {
    return { ok: false, erreurs: [`Il faut entre ${LIMITES.pionsMin} et ${LIMITES.pionsMax} pions.`] };
  }

  const couleurs: Couleur[] = [];
  for (const p of pionsBruts) {
    const couleur = (p as Record<string, unknown> | null)?.couleur;
    if (!estCouleur(couleur)) return { ok: false, erreurs: ['Un pion a une couleur inconnue.'] };
    if (couleurs.includes(couleur)) return { ok: false, erreurs: [`La couleur « ${couleur} » est utilisée deux fois.`] };
    couleurs.push(couleur);
  }

  const pions: PionScenario[] = pionsBruts.map((p, i) => {
    const pb = p as Record<string, unknown>;
    const couleur = couleurs[i]!;
    if (!estCase(pb.depart)) erreurs.push(`${Le(couleur)} : la case de départ est invalide.`);
    if (!estCase(pb.cible)) erreurs.push(`${Le(couleur)} : la case à trouver est invalide.`);
    const contraintes: Contrainte[] = [];
    for (const c of Array.isArray(pb.contraintes) ? pb.contraintes.slice(0, LIMITES.contraintes) : []) {
      const propre = nettoyerContrainte(c, couleur, couleurs);
      if (propre) contraintes.push(propre);
      else erreurs.push(`${Le(couleur)} : une contrainte est invalide.`);
    }
    const indices = (Array.isArray(pb.indices) ? pb.indices : [])
      .map((indice) => texte(indice, LIMITES.indice))
      .filter((indice) => indice.length > 0)
      .slice(0, LIMITES.indices);
    return {
      couleur,
      depart: String(pb.depart),
      cible: String(pb.cible),
      enigme: texte(pb.enigme, LIMITES.enigme),
      contraintes,
      indices,
      absent: booleen(pb.absent, false),
    };
  });

  if (erreurs.length === 0) {
    const cibles = new Map<string, Couleur>();
    const departs = new Map<string, Couleur>();
    for (const p of pions) {
      const memeCible = cibles.get(p.cible);
      if (memeCible) erreurs.push(`${Le(p.couleur)} et ${Le(memeCible).toLowerCase()} ont la même case à trouver (${p.cible}).`);
      cibles.set(p.cible, p.couleur);
      const memeDepart = departs.get(p.depart);
      if (memeDepart) erreurs.push(`${Le(p.couleur)} et ${Le(memeDepart).toLowerCase()} ont la même case de départ (${p.depart}).`);
      departs.set(p.depart, p.couleur);
      if (p.depart === p.cible) erreurs.push(`${Le(p.couleur)} démarre déjà sur sa case à trouver (${p.cible}).`);
    }
    if (pions.every((p) => p.absent)) erreurs.push('Tous les pions sont marqués absents.');
  }
  if (erreurs.length > 0) return { ok: false, erreurs };

  return {
    ok: true,
    scenario: {
      titre: texte(b.titre, LIMITES.titre) || 'Tutti',
      sousTitre: texte(b.sousTitre, LIMITES.titre),
      pions,
      options: nettoyerOptions(b.options),
      durees: nettoyerDurees(b.durees),
      dureeCible: entier(b.dureeCible, 0, LIMITES.dureeCibleMax, 0),
    },
  };
}

export function copier<T>(valeur: T): T {
  return JSON.parse(JSON.stringify(valeur)) as T;
}
