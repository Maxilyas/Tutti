/**
 * Les énigmes sous forme de CONTRAINTES lisibles par la machine.
 *
 * Le texte de l'énigme est libre (c'est l'équipe artistique qui l'écrit).
 * Les contraintes ne servent pas à valider les votes — un vote est juste
 * s'il désigne la case cible — mais au VÉRIFICATEUR de la régie, qui contrôle
 * que les énigmes sont vraies et qu'elles ne laissent qu'une seule solution.
 */

import { Le, du, le, type Couleur } from './couleurs';
import { LETTRES, coord, nomCase, seTouchent, sontVoisines, TAILLE, type Case, type Coord } from './grille';

export const TYPES_CONTRAINTE = [
  'aCote',
  'enDiagonale',
  'distance',
  'auDessus',
  'enDessous',
  'aGauche',
  'aDroite',
  'plusHaut',
  'plusBas',
  'plusAGauche',
  'plusADroite',
  'seul',
  'lettre',
  'chiffre',
  'bord',
  'coin',
  'centre',
] as const;

export type TypeContrainte = (typeof TYPES_CONTRAINTE)[number];
export type Cote = 'haut' | 'bas' | 'gauche' | 'droite';
export const COTES: readonly Cote[] = ['haut', 'bas', 'gauche', 'droite'];

/** Une contrainte porte toujours sur le pion qui la possède. */
export interface Contrainte {
  type: TypeContrainte;
  /** L'autre pion concerné (« à côté DU VERT »). */
  autre?: Couleur;
  /** Nombre de cases (« à 3 cases »). */
  n?: number;
  /** Colonne imposée, de A à E. */
  lettre?: string;
  /** Rangée imposée, de 1 à 5. */
  chiffre?: number;
  /** Bord imposé. */
  cote?: Cote;
}

type Parametre = 'autre' | 'n' | 'lettre' | 'chiffre' | 'cote';

interface DefinitionContrainte {
  /** Libellé dans l'éditeur de la régie. */
  libelle: string;
  /** Définition affichée dans le lexique du public (vide = pas dans le lexique). */
  definition: string;
  parametres: readonly Parametre[];
  /** Vrai si la contrainte est respectée. `autre` est absent pour les contraintes à un seul pion. */
  test: (moi: Coord, autre: Coord | undefined, c: Contrainte) => boolean;
  /** Phrase en français, pour proposer un texte d'énigme. */
  phrase: (pion: Couleur, c: Contrainte) => string;
}

const NOM_COTE: Record<Cote, string> = {
  haut: 'tout en haut',
  bas: 'tout en bas',
  gauche: 'tout à gauche',
  droite: 'tout à droite',
};

function autreOu(c: Contrainte): Couleur {
  return c.autre ?? 'bleu';
}

export const CATALOGUE: Record<TypeContrainte, DefinitionContrainte> = {
  aCote: {
    libelle: 'est à côté de…',
    definition: 'Les deux cases se touchent par un côté (pas en diagonale).',
    parametres: ['autre'],
    test: (moi, autre) => !!autre && seTouchent(moi, autre),
    phrase: (p, c) => `${Le(p)} est à côté ${du(autreOu(c))}.`,
  },
  enDiagonale: {
    libelle: 'touche en diagonale…',
    definition: 'Les deux cases se touchent par un coin.',
    parametres: ['autre'],
    test: (moi, autre) =>
      !!autre && Math.abs(moi.col - autre.col) === 1 && Math.abs(moi.rang - autre.rang) === 1,
    phrase: (p, c) => `${Le(p)} touche ${le(autreOu(c))} en diagonale.`,
  },
  distance: {
    libelle: 'est à N cases de…',
    definition: 'N cases plus loin, en ligne droite (vers le haut, le bas, la gauche ou la droite).',
    parametres: ['autre', 'n'],
    test: (moi, autre, c) => {
      if (!autre) return false;
      const dc = Math.abs(moi.col - autre.col);
      const dr = Math.abs(moi.rang - autre.rang);
      return (dc === 0 && dr === c.n) || (dr === 0 && dc === c.n);
    },
    phrase: (p, c) => `${Le(p)} se trouve à ${c.n ?? 2} cases ${du(autreOu(c))}.`,
  },
  auDessus: {
    libelle: 'est au-dessus de…',
    definition: 'Dans la même colonne (même lettre), plus haut.',
    parametres: ['autre'],
    test: (moi, autre) => !!autre && moi.col === autre.col && moi.rang < autre.rang,
    phrase: (p, c) => `${Le(p)} est au-dessus ${du(autreOu(c))}.`,
  },
  enDessous: {
    libelle: 'est en dessous de…',
    definition: 'Dans la même colonne (même lettre), plus bas.',
    parametres: ['autre'],
    test: (moi, autre) => !!autre && moi.col === autre.col && moi.rang > autre.rang,
    phrase: (p, c) => `${Le(p)} est en dessous ${du(autreOu(c))}.`,
  },
  aGauche: {
    libelle: 'est à gauche de…',
    definition: 'Sur la même rangée (même chiffre), plus à gauche.',
    parametres: ['autre'],
    test: (moi, autre) => !!autre && moi.rang === autre.rang && moi.col < autre.col,
    phrase: (p, c) => `${Le(p)} est à gauche ${du(autreOu(c))}.`,
  },
  aDroite: {
    libelle: 'est à droite de…',
    definition: 'Sur la même rangée (même chiffre), plus à droite.',
    parametres: ['autre'],
    test: (moi, autre) => !!autre && moi.rang === autre.rang && moi.col > autre.col,
    phrase: (p, c) => `${Le(p)} est à droite ${du(autreOu(c))}.`,
  },
  plusHaut: {
    libelle: 'est plus haut que…',
    definition: 'Sur une rangée plus haute de la grille, peu importe la colonne.',
    parametres: ['autre'],
    test: (moi, autre) => !!autre && moi.rang < autre.rang,
    phrase: (p, c) => `${Le(p)} est plus haut que ${le(autreOu(c))}.`,
  },
  plusBas: {
    libelle: 'est plus bas que…',
    definition: 'Sur une rangée plus basse de la grille, peu importe la colonne.',
    parametres: ['autre'],
    test: (moi, autre) => !!autre && moi.rang > autre.rang,
    phrase: (p, c) => `${Le(p)} est plus bas que ${le(autreOu(c))}.`,
  },
  plusAGauche: {
    libelle: 'est plus à gauche que…',
    definition: 'Dans une colonne plus à gauche, peu importe la rangée.',
    parametres: ['autre'],
    test: (moi, autre) => !!autre && moi.col < autre.col,
    phrase: (p, c) => `${Le(p)} est plus à gauche que ${le(autreOu(c))}.`,
  },
  plusADroite: {
    libelle: 'est plus à droite que…',
    definition: 'Dans une colonne plus à droite, peu importe la rangée.',
    parametres: ['autre'],
    test: (moi, autre) => !!autre && moi.col > autre.col,
    phrase: (p, c) => `${Le(p)} est plus à droite que ${le(autreOu(c))}.`,
  },
  seul: {
    libelle: 'veut être seul',
    definition: 'Aucune des 8 cases autour (diagonales comprises) n’est occupée.',
    parametres: [],
    // Testé à part : il faut connaître la position de tous les pions.
    test: () => true,
    phrase: (p) => `${Le(p)} veut être seul.`,
  },
  lettre: {
    libelle: 'est dans la colonne…',
    definition: '',
    parametres: ['lettre'],
    test: (moi, _autre, c) => LETTRES[moi.col] === c.lettre,
    phrase: (p, c) => `${Le(p)} est dans la colonne ${c.lettre ?? 'A'}.`,
  },
  chiffre: {
    libelle: 'est sur la rangée…',
    definition: '',
    parametres: ['chiffre'],
    test: (moi, _autre, c) => moi.rang + 1 === c.chiffre,
    phrase: (p, c) => `${Le(p)} est sur la rangée ${c.chiffre ?? 1}.`,
  },
  bord: {
    libelle: 'est tout en haut / en bas / à gauche / à droite',
    definition: 'Tout en haut = rangée 1, tout en bas = rangée 5, tout à gauche = colonne A, tout à droite = colonne E.',
    parametres: ['cote'],
    test: (moi, _autre, c) => {
      switch (c.cote) {
        case 'haut':
          return moi.rang === 0;
        case 'bas':
          return moi.rang === TAILLE - 1;
        case 'gauche':
          return moi.col === 0;
        case 'droite':
          return moi.col === TAILLE - 1;
        default:
          return false;
      }
    },
    phrase: (p, c) => `${Le(p)} est ${NOM_COTE[c.cote ?? 'haut']}.`,
  },
  coin: {
    libelle: 'est dans un coin',
    definition: 'L’une des 4 cases aux coins de la grille.',
    parametres: [],
    test: (moi) => (moi.col === 0 || moi.col === TAILLE - 1) && (moi.rang === 0 || moi.rang === TAILLE - 1),
    phrase: (p) => `${Le(p)} est dans un coin.`,
  },
  centre: {
    libelle: 'est au centre',
    definition: 'La case C3, au milieu de la grille.',
    parametres: [],
    test: (moi) => moi.col === 2 && moi.rang === 2,
    phrase: (p) => `${Le(p)} est au centre de la grille.`,
  },
};

/** Phrase en français décrivant une contrainte. */
export function phraseContrainte(pion: Couleur, c: Contrainte): string {
  return CATALOGUE[c.type].phrase(pion, c);
}

/** Texte d'énigme proposé à partir des contraintes d'un pion. */
export function proposerEnigme(pion: Couleur, contraintes: readonly Contrainte[]): string {
  return contraintes.map((c) => phraseContrainte(pion, c)).join(' ');
}

/** Le lexique affiché au public : uniquement les mots utilisés par le scénario. */
export function lexique(types: Iterable<TypeContrainte>): Array<{ mot: string; definition: string }> {
  const MOTS: Partial<Record<TypeContrainte, string>> = {
    aCote: 'À côté',
    enDiagonale: 'En diagonale',
    distance: 'À N cases',
    auDessus: 'Au-dessus',
    enDessous: 'En dessous',
    aGauche: 'À gauche',
    aDroite: 'À droite',
    plusHaut: 'Plus haut',
    plusBas: 'Plus bas',
    plusAGauche: 'Plus à gauche',
    plusADroite: 'Plus à droite',
    seul: 'Seul',
    bord: 'Tout en haut, tout à gauche…',
    coin: 'Dans un coin',
    centre: 'Au centre',
  };
  const vus = new Set<TypeContrainte>();
  const entrees: Array<{ mot: string; definition: string }> = [];
  for (const type of types) {
    if (vus.has(type)) continue;
    vus.add(type);
    const mot = MOTS[type];
    const definition = CATALOGUE[type].definition;
    if (mot && definition) entrees.push({ mot, definition });
  }
  return entrees;
}

/** Remet une contrainte au propre (seuls les paramètres utiles sont gardés). Renvoie null si elle est invalide. */
export function nettoyerContrainte(brut: unknown, pion: Couleur, couleurs: readonly Couleur[]): Contrainte | null {
  if (!brut || typeof brut !== 'object') return null;
  const b = brut as Record<string, unknown>;
  const type = b.type as TypeContrainte;
  if (!TYPES_CONTRAINTE.includes(type)) return null;
  const propre: Contrainte = { type };
  for (const parametre of CATALOGUE[type].parametres) {
    switch (parametre) {
      case 'autre':
        if (typeof b.autre !== 'string' || !couleurs.includes(b.autre as Couleur) || b.autre === pion) return null;
        propre.autre = b.autre as Couleur;
        break;
      case 'n':
        if (typeof b.n !== 'number' || !Number.isInteger(b.n) || b.n < 1 || b.n >= TAILLE) return null;
        propre.n = b.n;
        break;
      case 'lettre':
        if (typeof b.lettre !== 'string' || !(LETTRES as readonly string[]).includes(b.lettre)) return null;
        propre.lettre = b.lettre;
        break;
      case 'chiffre':
        if (typeof b.chiffre !== 'number' || !Number.isInteger(b.chiffre) || b.chiffre < 1 || b.chiffre > TAILLE) return null;
        propre.chiffre = b.chiffre;
        break;
      case 'cote':
        if (typeof b.cote !== 'string' || !COTES.includes(b.cote as Cote)) return null;
        propre.cote = b.cote as Cote;
        break;
    }
  }
  return propre;
}

// ---------------------------------------------------------------------------
// Vérificateur
// ---------------------------------------------------------------------------

export interface PionAVerifier {
  couleur: Couleur;
  cible: Case;
  contraintes: readonly Contrainte[];
  /** Un pion absent reste « fantôme » sur sa case : sa position est connue de tous. */
  absent?: boolean;
}

export type Placement = Partial<Record<Couleur, Case>>;

export interface RapportEnigmes {
  /** Contraintes que la figure cible ne respecte pas (énigme fausse). */
  fausses: Array<{ pion: Couleur; phrase: string }>;
  /** Pions sans aucune contrainte : le vérificateur ne peut rien dire sur eux. */
  sansContrainte: Couleur[];
  /** Nombre de solutions trouvées (plafonné). */
  nbSolutions: number;
  /** Vrai si la recherche a été interrompue (trop de solutions ou de combinaisons). */
  plafonne: boolean;
  /** Vrai s'il existe une seule solution : la figure cible. */
  unique: boolean;
  /** Pions dont la case change d'une solution à l'autre. */
  ambigus: Couleur[];
  /** Quelques autres solutions possibles, pour comprendre l'ambiguïté. */
  alternatives: Placement[];
}

const PLAFOND_SOLUTIONS = 500;
const PLAFOND_NOEUDS = 400_000;

function respecte(
  pion: Couleur,
  c: Contrainte,
  positions: Map<Couleur, Coord>,
): boolean | undefined {
  const moi = positions.get(pion);
  if (!moi) return undefined;
  if (c.type === 'seul') {
    for (const [autre, pos] of positions) {
      if (autre !== pion && sontVoisines(moi, pos)) return false;
    }
    return true;
  }
  const definition = CATALOGUE[c.type];
  if (definition.parametres.includes('autre')) {
    const autre = c.autre ? positions.get(c.autre) : undefined;
    // L'autre pion n'est pas (encore) placé : on ne peut pas conclure.
    if (!autre) return undefined;
    return definition.test(moi, autre, c);
  }
  return definition.test(moi, undefined, c);
}

/**
 * Vérifie les énigmes d'un scénario.
 * `silhouette` : si la silhouette est montrée au public, les pions ne peuvent
 * aller que sur les cases de la figure ; sinon, sur les 25 cases.
 */
export function verifierEnigmes(pions: readonly PionAVerifier[], silhouette: boolean): RapportEnigmes {
  const couleurs = pions.map((p) => p.couleur);
  const cibles = new Map<Couleur, Coord>(pions.map((p) => [p.couleur, coord(p.cible)]));

  // 1. La figure cible respecte-t-elle toutes les contraintes ?
  const fausses: RapportEnigmes['fausses'] = [];
  for (const p of pions) {
    for (const c of p.contraintes) {
      const autreInconnu = c.autre !== undefined && !couleurs.includes(c.autre);
      if (autreInconnu || respecte(p.couleur, c, cibles) !== true) {
        fausses.push({ pion: p.couleur, phrase: phraseContrainte(p.couleur, c) });
      }
    }
  }
  const sansContrainte = pions.filter((p) => !p.absent && p.contraintes.length === 0).map((p) => p.couleur);

  // 2. Combien de placements respectent toutes les contraintes ?
  const fixes = pions.filter((p) => p.absent);
  const libres = pions.filter((p) => !p.absent);
  const positions = new Map<Couleur, Coord>(fixes.map((p) => [p.couleur, coord(p.cible)]));
  const prises = new Set<Case>(fixes.map((p) => p.cible));
  const candidates: Case[] = silhouette
    ? libres.map((p) => p.cible).sort()
    : Array.from({ length: TAILLE * TAILLE }, (_, i) => nomCase(i % TAILLE, Math.floor(i / TAILLE)));

  const solutions: Placement[] = [];
  let noeuds = 0;
  let plafonne = false;

  const coherent = (): boolean => {
    for (const p of pions) {
      for (const c of p.contraintes) {
        if (respecte(p.couleur, c, positions) === false) return false;
      }
    }
    return true;
  };

  const explorer = (index: number): void => {
    if (plafonne) return;
    if (index === libres.length) {
      const placement: Placement = {};
      for (const p of pions) {
        const pos = positions.get(p.couleur);
        if (pos) placement[p.couleur] = nomCase(pos.col, pos.rang);
      }
      solutions.push(placement);
      if (solutions.length >= PLAFOND_SOLUTIONS) plafonne = true;
      return;
    }
    const pion = libres[index]!;
    for (const c of candidates) {
      if (prises.has(c)) continue;
      if (++noeuds > PLAFOND_NOEUDS) {
        plafonne = true;
        return;
      }
      prises.add(c);
      positions.set(pion.couleur, coord(c));
      if (coherent()) explorer(index + 1);
      positions.delete(pion.couleur);
      prises.delete(c);
      if (plafonne) return;
    }
  };
  if (fausses.length === 0) explorer(0);

  const estCible = (s: Placement) => pions.every((p) => s[p.couleur] === p.cible);
  const ambigus = couleurs.filter((couleur) => new Set(solutions.map((s) => s[couleur])).size > 1);
  return {
    fausses,
    sansContrainte,
    nbSolutions: solutions.length,
    plafonne,
    unique: fausses.length === 0 && !plafonne && solutions.length === 1 && estCible(solutions[0]!),
    ambigus,
    alternatives: solutions.filter((s) => !estCible(s)).slice(0, 3),
  };
}
