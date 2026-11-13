/** Répartition du public en équipes, et comportement des joueurs simulés. */

import { melanger, piocher, type Alea } from './alea';
import type { Couleur } from './couleurs';
import type { Case } from './grille';

/** L'équipe qui a le moins de membres (égalité : tirage au sort). */
export function equipeLaMoinsNombreuse(
  effectifs: Readonly<Partial<Record<Couleur, number>>>,
  candidates: readonly Couleur[],
  alea: Alea,
): Couleur | null {
  let min = Infinity;
  let meilleures: Couleur[] = [];
  for (const c of candidates) {
    const n = effectifs[c] ?? 0;
    if (n < min) {
      min = n;
      meilleures = [c];
    } else if (n === min) {
      meilleures.push(c);
    }
  }
  return piocher(meilleures, alea) ?? null;
}

/** Répartit des joueurs au hasard, en équipes de tailles égales (à un près). */
export function repartir(ids: readonly string[], couleurs: readonly Couleur[], alea: Alea): Record<string, Couleur> {
  const resultat: Record<string, Couleur> = {};
  if (couleurs.length === 0) return resultat;
  const ordre = melanger(couleurs, alea);
  melanger(ids, alea).forEach((id, i) => {
    resultat[id] = ordre[i % ordre.length]!;
  });
  return resultat;
}

export interface ContexteSimule {
  votables: readonly Case[];
  silhouette: readonly Case[] | null;
  cible: Case;
  echecs: number;
  /** Case actuellement en tête dans l'équipe, s'il y en a une. */
  meneuse: Case | null;
}

/**
 * Vote d'un joueur simulé (mode répétition). Il raisonne « à peu près » comme
 * un public : il trouve de mieux en mieux au fil des manches, suit parfois la
 * majorité de son équipe, et vise surtout les cases de la silhouette.
 */
export function voteSimule(contexte: ContexteSimule, alea: Alea): Case | null {
  const { votables, silhouette, cible, echecs, meneuse } = contexte;
  if (votables.length === 0) return null;
  const talent = Math.min(0.9, 0.08 + 0.2 * echecs);
  if (alea() < talent && votables.includes(cible)) return cible;
  if (meneuse && votables.includes(meneuse) && alea() < 0.35) return meneuse;
  if (silhouette && alea() < 0.8) {
    const plausibles = votables.filter((c) => silhouette.includes(c));
    const choix = piocher(plausibles, alea);
    if (choix) return choix;
  }
  return piocher(votables, alea) ?? null;
}
