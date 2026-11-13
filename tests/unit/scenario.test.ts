import { describe, expect, it } from 'vitest';
import { departsEffectifs, etatsInitiaux, silhouetteDe } from '../../src/shared/regles';
import { DUREES_DEFAUT, SCENARIO_DEFAUT, copier, validerScenario } from '../../src/shared/scenario';

describe('scénario du concert', () => {
  it('vise 3 à 5 minutes : une manche dure 50 secondes, la première une minute', () => {
    const { premierVote, vote, affichage, deplacement } = SCENARIO_DEFAUT.durees;
    expect(vote + affichage + deplacement).toBe(50);
    expect(premierVote + affichage + deplacement).toBe(60);
    expect(SCENARIO_DEFAUT.durees).toEqual(DUREES_DEFAUT);
    expect(SCENARIO_DEFAUT.dureeCible).toBe(270);
  });


  it('compte 7 pions, dont le rose', () => {
    expect(SCENARIO_DEFAUT.pions.map((p) => p.couleur)).toEqual([
      'rouge', 'orange', 'jaune', 'vert', 'bleu', 'violet', 'rose',
    ]);
  });

  it('place la figure comme sur le croquis, dans la nouvelle numérotation', () => {
    const cibles = Object.fromEntries(SCENARIO_DEFAUT.pions.map((p) => [p.couleur, p.cible]));
    expect(cibles).toEqual({ rouge: 'B1', orange: 'E4', jaune: 'C2', vert: 'B5', bleu: 'C5', violet: 'A3', rose: 'C4' });
    expect(silhouetteDe(SCENARIO_DEFAUT)).toEqual(['A3', 'B1', 'B5', 'C2', 'C4', 'C5', 'E4']);
  });

  it('aucun pion ne démarre verrouillé', () => {
    const etats = etatsInitiaux(SCENARIO_DEFAUT);
    for (const p of SCENARIO_DEFAUT.pions) {
      expect(etats[p.couleur]).toMatchObject({ position: p.depart, verrouille: false, essais: [p.depart] });
    }
  });
});

describe('musicien absent', () => {
  it('le pion absent devient un fantôme verrouillé sur sa case', () => {
    const scenario = copier(SCENARIO_DEFAUT);
    scenario.pions.find((p) => p.couleur === 'bleu')!.absent = true;
    const etats = etatsInitiaux(scenario);
    expect(etats.bleu).toMatchObject({ position: 'C5', verrouille: true });
    expect(etats.vert).toMatchObject({ position: 'D2', verrouille: false });
  });

  it('si un pion devait démarrer sur la case du fantôme, il prend la case de départ de l’absent', () => {
    const scenario = copier(SCENARIO_DEFAUT);
    // Le rose démarre en E4, qui est la case à trouver de l'orange.
    scenario.pions.find((p) => p.couleur === 'orange')!.absent = true;
    const departs = departsEffectifs(scenario.pions);
    expect(departs.orange).toBe('E4');
    expect(departs.rose).toBe('E1');
    expect(new Set(Object.values(departs)).size).toBe(7);
  });
});

describe('validation d’un scénario', () => {
  it('accepte le scénario par défaut tel quel', () => {
    const resultat = validerScenario(copier(SCENARIO_DEFAUT));
    expect(resultat).toEqual({ ok: true, scenario: SCENARIO_DEFAUT });
  });

  it('refuse deux pions sur la même case à trouver', () => {
    const scenario = copier(SCENARIO_DEFAUT);
    scenario.pions[0]!.cible = scenario.pions[1]!.cible;
    const resultat = validerScenario(scenario);
    expect(resultat.ok).toBe(false);
    expect(!resultat.ok && resultat.erreurs.join(' ')).toContain('même case à trouver');
  });

  it('refuse deux pions sur la même case de départ', () => {
    const scenario = copier(SCENARIO_DEFAUT);
    scenario.pions[0]!.depart = scenario.pions[1]!.depart;
    expect(validerScenario(scenario).ok).toBe(false);
  });

  it('refuse une case ou une couleur inconnue, et un pion déjà à sa place', () => {
    const a = copier(SCENARIO_DEFAUT) as unknown as { pions: Array<Record<string, unknown>> };
    a.pions[0]!.cible = 'F9';
    expect(validerScenario(a).ok).toBe(false);
    const b = copier(SCENARIO_DEFAUT) as unknown as { pions: Array<Record<string, unknown>> };
    b.pions[0]!.couleur = 'turquoise';
    expect(validerScenario(b).ok).toBe(false);
    const c = copier(SCENARIO_DEFAUT);
    c.pions[0]!.depart = c.pions[0]!.cible;
    expect(validerScenario(c).ok).toBe(false);
  });

  it('borne les durées et nettoie les textes', () => {
    const scenario = copier(SCENARIO_DEFAUT) as unknown as Record<string, unknown>;
    scenario.durees = { premierVote: 99999, vote: -4, affichage: 'abc', deplacement: 12.4 };
    scenario.titre = '  Mon   titre  ';
    const resultat = validerScenario(scenario);
    expect(resultat.ok).toBe(true);
    if (resultat.ok) {
      // Trop long : plafonné. Trop court : relevé. Illisible : valeur par défaut. Décimal : arrondi.
      expect(resultat.scenario.durees).toEqual({ premierVote: 300, vote: 2, affichage: DUREES_DEFAUT.affichage, deplacement: 12 });
      expect(resultat.scenario.titre).toBe('Mon titre');
    }
  });

  it('sans silhouette, le vote est forcément libre', () => {
    const scenario = copier(SCENARIO_DEFAUT);
    scenario.options.afficherSilhouette = false;
    scenario.options.voteLibre = false;
    const resultat = validerScenario(scenario);
    expect(resultat.ok && resultat.scenario.options.voteLibre).toBe(true);
  });

  it('refuse n’importe quoi', () => {
    expect(validerScenario(null).ok).toBe(false);
    expect(validerScenario('bonjour').ok).toBe(false);
    expect(validerScenario({ pions: [] }).ok).toBe(false);
  });
});
