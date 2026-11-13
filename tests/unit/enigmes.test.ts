import { describe, expect, it } from 'vitest';
import { lexique, proposerEnigme, verifierEnigmes, type PionAVerifier } from '../../src/shared/enigmes';
import { SCENARIO_DEFAUT, copier } from '../../src/shared/scenario';

const pionsDefaut = (): PionAVerifier[] => copier(SCENARIO_DEFAUT.pions);

describe('vérificateur d’énigmes', () => {
  it('le scénario du concert a une solution unique avec la silhouette', () => {
    const rapport = verifierEnigmes(pionsDefaut(), true);
    expect(rapport.fausses).toEqual([]);
    expect(rapport.sansContrainte).toEqual([]);
    expect(rapport.nbSolutions).toBe(1);
    expect(rapport.unique).toBe(true);
    expect(rapport.ambigus).toEqual([]);
  });

  it('sans la précision « tout à gauche », violet et orange sont interchangeables', () => {
    const pions = pionsDefaut();
    const violet = pions.find((p) => p.couleur === 'violet')!;
    violet.contraintes = [{ type: 'seul' }];
    const rapport = verifierEnigmes(pions, true);
    expect(rapport.unique).toBe(false);
    expect(rapport.nbSolutions).toBe(2);
    expect(rapport.ambigus.sort()).toEqual(['orange', 'violet']);
    expect(rapport.alternatives).toHaveLength(1);
    expect(rapport.alternatives[0]).toMatchObject({ violet: 'E4', orange: 'A3' });
  });

  it('sans la silhouette, les énigmes de placement ne suffisent pas', () => {
    const rapport = verifierEnigmes(pionsDefaut(), false);
    expect(rapport.unique).toBe(false);
    expect(rapport.nbSolutions).toBeGreaterThan(1);
  });

  it('signale une énigme fausse', () => {
    const pions = pionsDefaut();
    pions.find((p) => p.couleur === 'rouge')!.contraintes = [{ type: 'plusBas', autre: 'vert' }];
    const rapport = verifierEnigmes(pions, true);
    expect(rapport.unique).toBe(false);
    expect(rapport.fausses).toEqual([{ pion: 'rouge', phrase: 'Le rouge est plus bas que le vert.' }]);
  });

  it('signale un pion sans contrainte', () => {
    const pions = pionsDefaut();
    pions.find((p) => p.couleur === 'rose')!.contraintes = [];
    const rapport = verifierEnigmes(pions, true);
    expect(rapport.sansContrainte).toEqual(['rose']);
  });

  it('un pion absent reste sur sa case : la solution reste unique', () => {
    for (const absent of SCENARIO_DEFAUT.pions.map((p) => p.couleur)) {
      const pions = pionsDefaut().map((p) => ({ ...p, absent: p.couleur === absent }));
      expect(verifierEnigmes(pions, true).unique, `sans ${absent}`).toBe(true);
    }
  });

  it('comprend chaque mot du lexique', () => {
    const base: PionAVerifier[] = [
      { couleur: 'rouge', cible: 'B2', contraintes: [] },
      { couleur: 'bleu', cible: 'B4', contraintes: [] },
      { couleur: 'vert', cible: 'D2', contraintes: [] },
      { couleur: 'jaune', cible: 'C3', contraintes: [] },
      { couleur: 'rose', cible: 'E5', contraintes: [] },
    ];
    const vrai = (pion: string, contrainte: PionAVerifier['contraintes'][number]) => {
      const pions = base.map((p) => (p.couleur === pion ? { ...p, contraintes: [contrainte] } : p));
      return verifierEnigmes(pions, true).fausses.length === 0;
    };
    expect(vrai('rouge', { type: 'auDessus', autre: 'bleu' })).toBe(true);
    expect(vrai('bleu', { type: 'enDessous', autre: 'rouge' })).toBe(true);
    expect(vrai('rouge', { type: 'auDessus', autre: 'vert' })).toBe(false);
    expect(vrai('rouge', { type: 'aGauche', autre: 'vert' })).toBe(true);
    expect(vrai('vert', { type: 'aDroite', autre: 'rouge' })).toBe(true);
    expect(vrai('rouge', { type: 'distance', autre: 'bleu', n: 2 })).toBe(true);
    expect(vrai('rouge', { type: 'distance', autre: 'bleu', n: 3 })).toBe(false);
    expect(vrai('rouge', { type: 'distance', autre: 'jaune', n: 2 })).toBe(false);
    expect(vrai('rouge', { type: 'enDiagonale', autre: 'jaune' })).toBe(true);
    expect(vrai('rouge', { type: 'aCote', autre: 'jaune' })).toBe(false);
    expect(vrai('rouge', { type: 'plusHaut', autre: 'jaune' })).toBe(true);
    expect(vrai('jaune', { type: 'plusBas', autre: 'vert' })).toBe(true);
    expect(vrai('rouge', { type: 'plusAGauche', autre: 'jaune' })).toBe(true);
    expect(vrai('vert', { type: 'plusADroite', autre: 'jaune' })).toBe(true);
    expect(vrai('rose', { type: 'seul' })).toBe(true);
    expect(vrai('rouge', { type: 'seul' })).toBe(false);
    expect(vrai('jaune', { type: 'centre' })).toBe(true);
    expect(vrai('rose', { type: 'coin' })).toBe(true);
    expect(vrai('rose', { type: 'bord', cote: 'bas' })).toBe(true);
    expect(vrai('rose', { type: 'bord', cote: 'droite' })).toBe(true);
    expect(vrai('rose', { type: 'bord', cote: 'gauche' })).toBe(false);
    expect(vrai('rose', { type: 'bord', cote: 'haut' })).toBe(false);
    expect(vrai('rose', { type: 'lettre', lettre: 'E' })).toBe(true);
    expect(vrai('rose', { type: 'lettre', lettre: 'A' })).toBe(false);
    expect(vrai('rose', { type: 'chiffre', chiffre: 5 })).toBe(true);
    expect(vrai('rose', { type: 'chiffre', chiffre: 1 })).toBe(false);
  });

  it('propose un texte d’énigme en français correct', () => {
    expect(proposerEnigme('orange', [{ type: 'aCote', autre: 'bleu' }])).toBe("L'orange est à côté du bleu.");
    expect(proposerEnigme('bleu', [{ type: 'distance', autre: 'orange', n: 3 }])).toBe(
      "Le bleu se trouve à 3 cases de l'orange.",
    );
    expect(proposerEnigme('violet', [{ type: 'seul' }, { type: 'bord', cote: 'gauche' }])).toBe(
      'Le violet veut être seul. Le violet est tout à gauche.',
    );
  });

  it('construit le lexique des seuls mots utilisés', () => {
    const mots = lexique(['aCote', 'seul', 'aCote', 'lettre']).map((e) => e.mot);
    expect(mots).toEqual(['À côté', 'Seul']);
  });
});
