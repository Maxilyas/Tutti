/**
 * Les couleurs des pions (une couleur = un·e musicien·ne = une équipe du public).
 * Chaque couleur a aussi un SYMBOLE : la couleur seule ne suffit pas
 * (daltonisme, vidéoprojecteur qui délave les teintes).
 */

export const COULEURS = ['rouge', 'orange', 'jaune', 'vert', 'bleu', 'violet', 'rose'] as const;
export type Couleur = (typeof COULEURS)[number];

export type Symbole = 'carre' | 'triangle' | 'etoile' | 'rond' | 'losange' | 'croix' | 'coeur';

export interface InfoCouleur {
  /** « rouge » */
  nom: string;
  /** Accord au féminin : « l'équipe verte » */
  feminin: string;
  /** Vrai si le nom commence par une voyelle (« l'orange », « de l'orange »). */
  elision: boolean;
  /** Teinte principale, pensée pour un fond sombre et un vidéoprojecteur. */
  hex: string;
  /** Variante sombre (fonds, halos). */
  sombre: string;
  symbole: Symbole;
  nomSymbole: string;
}

export const INFOS: Record<Couleur, InfoCouleur> = {
  rouge: { nom: 'rouge', feminin: 'rouge', elision: false, hex: '#ff4545', sombre: '#5c1114', symbole: 'carre', nomSymbole: 'carré' },
  orange: { nom: 'orange', feminin: 'orange', elision: true, hex: '#ff9a1f', sombre: '#5c3303', symbole: 'triangle', nomSymbole: 'triangle' },
  jaune: { nom: 'jaune', feminin: 'jaune', elision: false, hex: '#ffe03a', sombre: '#5a4b00', symbole: 'etoile', nomSymbole: 'étoile' },
  vert: { nom: 'vert', feminin: 'verte', elision: false, hex: '#2fd673', sombre: '#0b4a25', symbole: 'rond', nomSymbole: 'rond' },
  bleu: { nom: 'bleu', feminin: 'bleue', elision: false, hex: '#3d8bff', sombre: '#0d2c5e', symbole: 'losange', nomSymbole: 'losange' },
  violet: { nom: 'violet', feminin: 'violette', elision: false, hex: '#a66bff', sombre: '#34176a', symbole: 'croix', nomSymbole: 'croix' },
  rose: { nom: 'rose', feminin: 'rose', elision: false, hex: '#ff86c8', sombre: '#63173f', symbole: 'coeur', nomSymbole: 'cœur' },
};

export function estCouleur(valeur: unknown): valeur is Couleur {
  return typeof valeur === 'string' && (COULEURS as readonly string[]).includes(valeur);
}

/** « le rouge », « l'orange » */
export function le(c: Couleur): string {
  return INFOS[c].elision ? `l'${INFOS[c].nom}` : `le ${INFOS[c].nom}`;
}

/** « Le rouge », « L'orange » */
export function Le(c: Couleur): string {
  const texte = le(c);
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

/** « du rouge », « de l'orange » */
export function du(c: Couleur): string {
  return INFOS[c].elision ? `de l'${INFOS[c].nom}` : `du ${INFOS[c].nom}`;
}

/** « équipe verte », « équipe orange » */
export function equipe(c: Couleur): string {
  return `équipe ${INFOS[c].feminin}`;
}
