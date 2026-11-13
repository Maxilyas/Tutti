/**
 * La grille 5×5.
 *
 * Numérotation validée avec l'équipe artistique :
 *  - la LETTRE (A → E) désigne la colonne, de gauche à droite : c'est la BOUCLE jouée ;
 *  - le CHIFFRE (1 → 5) désigne la rangée, de haut en bas : c'est le REGISTRE
 *    (1 = très aigu, 5 = très grave).
 *
 * « B1 » est donc la deuxième case de la rangée du haut.
 */

export const TAILLE = 5;
export const LETTRES = ['A', 'B', 'C', 'D', 'E'] as const;
export const CHIFFRES = [1, 2, 3, 4, 5] as const;
export const REGISTRES = ['très aigu', 'aigu', 'medium', 'grave', 'très grave'] as const;

export type Lettre = (typeof LETTRES)[number];
export type Chiffre = (typeof CHIFFRES)[number];

/** Nom d'une case, par exemple « C4 ». */
export type Case = string;

/** Coordonnées à partir de 0 : `col` 0 = A (gauche), `rang` 0 = 1 (haut). */
export interface Coord {
  col: number;
  rang: number;
}

const MOTIF_CASE = /^[A-E][1-5]$/;

export function estCase(valeur: unknown): valeur is Case {
  return typeof valeur === 'string' && MOTIF_CASE.test(valeur);
}

export function coord(c: Case): Coord {
  return { col: c.charCodeAt(0) - 65, rang: c.charCodeAt(1) - 49 };
}

export function nomCase(col: number, rang: number): Case {
  return `${LETTRES[col]}${rang + 1}`;
}

/** Les 25 cases, rangée par rangée : A1, B1, … E1, A2, … E5. */
export const TOUTES_LES_CASES: readonly Case[] = CHIFFRES.flatMap((_, rang) =>
  LETTRES.map((_, col) => nomCase(col, rang)),
);

export function lettreDe(c: Case): Lettre {
  return c[0] as Lettre;
}

export function chiffreDe(c: Case): Chiffre {
  return Number(c[1]) as Chiffre;
}

/** Registre musical d'une case (« très aigu » … « très grave »). */
export function registreDe(c: Case): string {
  return REGISTRES[coord(c).rang] ?? '';
}

/** Les deux cases se touchent par un côté. */
export function seTouchent(a: Coord, b: Coord): boolean {
  return Math.abs(a.col - b.col) + Math.abs(a.rang - b.rang) === 1;
}

/** Les deux cases se touchent par un côté ou par un coin. */
export function sontVoisines(a: Coord, b: Coord): boolean {
  const dc = Math.abs(a.col - b.col);
  const dr = Math.abs(a.rang - b.rang);
  return Math.max(dc, dr) === 1;
}
