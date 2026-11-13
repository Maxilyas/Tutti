import { describe, expect, it } from 'vitest';
import { aleaGraine, hachage01, melanger } from '../../src/shared/alea';
import { Le, du, equipe, le, type Couleur } from '../../src/shared/couleurs';
import { equipeLaMoinsNombreuse, repartir } from '../../src/shared/equipes';
import { coord, estCase, nomCase, registreDe, TOUTES_LES_CASES } from '../../src/shared/grille';

const SEPT: Couleur[] = ['rouge', 'orange', 'jaune', 'vert', 'bleu', 'violet', 'rose'];

describe('répartition en équipes', () => {
  it('100 arrivées successives donnent des équipes égales à un joueur près', () => {
    const hasard = aleaGraine(3);
    const effectifs: Partial<Record<Couleur, number>> = {};
    for (let i = 0; i < 100; i++) {
      const c = equipeLaMoinsNombreuse(effectifs, SEPT, hasard)!;
      effectifs[c] = (effectifs[c] ?? 0) + 1;
    }
    const tailles = SEPT.map((c) => effectifs[c] ?? 0);
    expect(Math.max(...tailles) - Math.min(...tailles)).toBeLessThanOrEqual(1);
    expect(tailles.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('les 7 premiers joueurs forment 7 équipes : aucune équipe vide', () => {
    const hasard = aleaGraine(11);
    const effectifs: Partial<Record<Couleur, number>> = {};
    for (let i = 0; i < 7; i++) {
      const c = equipeLaMoinsNombreuse(effectifs, SEPT, hasard)!;
      effectifs[c] = (effectifs[c] ?? 0) + 1;
    }
    expect(SEPT.every((c) => effectifs[c] === 1)).toBe(true);
  });

  it('la répartition est aléatoire : la première équipe n’est pas toujours la même', () => {
    const premieres = new Set<string>();
    for (let graine = 0; graine < 50; graine++) premieres.add(equipeLaMoinsNombreuse({}, SEPT, aleaGraine(graine))!);
    expect(premieres.size).toBeGreaterThan(3);
  });

  it('sans équipe candidate, pas d’équipe', () => {
    expect(equipeLaMoinsNombreuse({}, [], aleaGraine(1))).toBeNull();
  });

  it('rééquilibre un groupe entier', () => {
    const ids = Array.from({ length: 31 }, (_, i) => `j${i}`);
    const resultat = repartir(ids, SEPT.slice(0, 6), aleaGraine(5));
    const tailles = SEPT.slice(0, 6).map((c) => Object.values(resultat).filter((x) => x === c).length);
    expect(tailles.reduce((a, b) => a + b, 0)).toBe(31);
    expect(Math.max(...tailles) - Math.min(...tailles)).toBeLessThanOrEqual(1);
  });
});

describe('hasard', () => {
  it('est reproductible avec la même graine', () => {
    const a = aleaGraine(9);
    const b = aleaGraine(9);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(melanger([1, 2, 3, 4, 5], aleaGraine(1))).toEqual(melanger([1, 2, 3, 4, 5], aleaGraine(1)));
  });

  it('hachage01 répartit bien des textes proches', () => {
    const valeurs = Array.from({ length: 200 }, (_, i) => hachage01(`simule-${i}:3`));
    expect(valeurs.every((v) => v >= 0 && v < 1)).toBe(true);
    const moyenne = valeurs.reduce((a, b) => a + b, 0) / valeurs.length;
    expect(moyenne).toBeGreaterThan(0.4);
    expect(moyenne).toBeLessThan(0.6);
  });
});

describe('grille', () => {
  it('la lettre est la colonne, le chiffre est la rangée', () => {
    expect(coord('A1')).toEqual({ col: 0, rang: 0 });
    expect(coord('E1')).toEqual({ col: 4, rang: 0 });
    expect(coord('B5')).toEqual({ col: 1, rang: 4 });
    expect(nomCase(2, 3)).toBe('C4');
    expect(TOUTES_LES_CASES.slice(0, 6)).toEqual(['A1', 'B1', 'C1', 'D1', 'E1', 'A2']);
    expect(TOUTES_LES_CASES).toHaveLength(25);
  });

  it('le registre suit le chiffre : 1 très aigu, 5 très grave', () => {
    expect(registreDe('A1')).toBe('très aigu');
    expect(registreDe('E3')).toBe('medium');
    expect(registreDe('C5')).toBe('très grave');
  });

  it('reconnaît une case valide', () => {
    expect(estCase('C4')).toBe(true);
    expect(estCase('F1')).toBe(false);
    expect(estCase('A6')).toBe(false);
    expect(estCase('a1')).toBe(false);
    expect(estCase(12)).toBe(false);
  });
});

describe('français', () => {
  it('gère l’élision de « orange »', () => {
    expect(le('orange')).toBe("l'orange");
    expect(Le('orange')).toBe("L'orange");
    expect(du('orange')).toBe("de l'orange");
    expect(du('vert')).toBe('du vert');
    expect(equipe('vert')).toBe('équipe verte');
    expect(equipe('violet')).toBe('équipe violette');
    expect(equipe('rose')).toBe('équipe rose');
  });
});
