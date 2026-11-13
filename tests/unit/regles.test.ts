import { describe, expect, it } from 'vitest';
import { aleaGraine } from '../../src/shared/alea';
import type { Couleur } from '../../src/shared/couleurs';
import { voteSimule } from '../../src/shared/equipes';
import { TOUTES_LES_CASES, type Case } from '../../src/shared/grille';
import {
  appliquerMouvements,
  casesVotables,
  depouiller,
  etatsInitiaux,
  indicesAutomatiques,
  optionsVote,
  pionsEnJeu,
  resoudreManche,
  tousPlaces,
  type OptionsVote,
  type PionJeu,
} from '../../src/shared/regles';
import { SCENARIO_DEFAUT, copier } from '../../src/shared/scenario';
import type { Mouvement } from '../../src/shared/types';

const LIBRE: OptionsVote = { voteLibre: true, silhouette: null };
const alea = () => aleaGraine(42);

function pion(couleur: Couleur, position: Case, cible: Case, plus: Partial<PionJeu> = {}): PionJeu {
  return { couleur, position, cible, absent: false, verrouille: false, essais: [position], reveler: false, choixRegie: null, ...plus };
}

function parCouleur(mouvements: Mouvement[]): Record<string, Mouvement> {
  return Object.fromEntries(mouvements.map((m) => [m.couleur, m]));
}

describe('dépouillement', () => {
  const toutes = new Set(TOUTES_LES_CASES);

  it('retient la case qui a le plus de voix', () => {
    expect(depouiller({ A1: 2, B2: 5, C3: 1 }, toutes, alea())).toEqual({ choix: 'B2', voix: 5, votants: 8 });
  });

  it('sans vote, pas de choix', () => {
    expect(depouiller(undefined, toutes, alea())).toEqual({ choix: null, voix: 0, votants: 0 });
    expect(depouiller({}, toutes, alea())).toEqual({ choix: null, voix: 0, votants: 0 });
  });

  it('ignore les cases non votables', () => {
    expect(depouiller({ A1: 9, B2: 1 }, new Set(['B2']), alea())).toEqual({ choix: 'B2', voix: 1, votants: 1 });
  });

  it('départage les égalités au hasard, mais seulement entre les ex æquo', () => {
    const vus = new Set<string>();
    const hasard = aleaGraine(7);
    for (let i = 0; i < 200; i++) vus.add(depouiller({ A1: 3, B2: 3, C3: 1 }, toutes, hasard).choix!);
    expect([...vus].sort()).toEqual(['A1', 'B2']);
  });
});

describe('cases votables', () => {
  it('exclut les cases verrouillées et les cases déjà essayées', () => {
    const rouge = pion('rouge', 'A1', 'E5', { essais: ['A1', 'B1'] });
    const bleu = pion('bleu', 'C3', 'C3', { verrouille: true });
    const vert = pion('vert', 'D4', 'D5');
    const votables = casesVotables(rouge, [rouge, bleu, vert], LIBRE);
    expect(votables).not.toContain('A1');
    expect(votables).not.toContain('B1');
    expect(votables).not.toContain('C3');
    // La case d'un pion non verrouillé reste votable (échange possible).
    expect(votables).toContain('D4');
    expect(votables).toHaveLength(22);
  });

  it('se limite à la silhouette si le vote n’est pas libre', () => {
    const rouge = pion('rouge', 'A1', 'E5');
    const bleu = pion('bleu', 'C3', 'C3', { verrouille: true });
    const options: OptionsVote = { voteLibre: false, silhouette: ['C3', 'D5', 'E5'] };
    expect(casesVotables(rouge, [rouge, bleu], options)).toEqual(['D5', 'E5']);
  });

  it('un pion verrouillé ne vote plus', () => {
    const bleu = pion('bleu', 'C3', 'C3', { verrouille: true });
    expect(casesVotables(bleu, [bleu], LIBRE)).toEqual([]);
  });
});

describe('résolution d’une manche', () => {
  it('une bonne réponse verrouille le pion', () => {
    const m = parCouleur(resoudreManche([pion('rouge', 'A1', 'C3')], { rouge: { C3: 4, D4: 1 } }, LIBRE, alea()));
    expect(m.rouge).toMatchObject({ de: 'A1', vers: 'C3', choix: 'C3', voix: 4, votants: 5, issue: 'juste', verrouille: true, chance: false });
  });

  it('une mauvaise réponse déplace quand même le pion', () => {
    const m = parCouleur(resoudreManche([pion('rouge', 'A1', 'C3')], { rouge: { D4: 3 } }, LIBRE, alea()));
    expect(m.rouge).toMatchObject({ de: 'A1', vers: 'D4', issue: 'faux', verrouille: false });
  });

  it('sans vote, le pion reste sur place', () => {
    const m = parCouleur(resoudreManche([pion('rouge', 'A1', 'C3')], {}, LIBRE, alea()));
    expect(m.rouge).toMatchObject({ de: 'A1', vers: 'A1', choix: null, issue: 'sansVote', verrouille: false });
  });

  it('case disputée : l’équipe la plus forte l’emporte, l’autre ne bouge pas', () => {
    const pions = [pion('rouge', 'A1', 'E5'), pion('bleu', 'B1', 'E4')];
    const m = parCouleur(resoudreManche(pions, { rouge: { C3: 3 }, bleu: { C3: 7 } }, LIBRE, alea()));
    expect(m.bleu).toMatchObject({ vers: 'C3', dispute: false, issue: 'faux' });
    expect(m.rouge).toMatchObject({ vers: 'A1', choix: 'C3', dispute: true, issue: 'faux' });
  });

  it('à voix égales, la plus forte part de l’équipe l’emporte', () => {
    const pions = [pion('rouge', 'A1', 'E5'), pion('bleu', 'B1', 'E4')];
    const m = parCouleur(resoudreManche(pions, { rouge: { C3: 3, D1: 3 }, bleu: { C3: 3 } }, LIBRE, () => 0));
    // alea = 0 : le rouge retient C3 (première des ex æquo), avec 50 % de son équipe contre 100 % pour le bleu.
    expect(m.bleu!.vers).toBe('C3');
    expect(m.rouge).toMatchObject({ vers: 'A1', dispute: true });
  });

  it('une équipe qui vise sa bonne case l’obtient toujours, même avec moins de voix', () => {
    const pions = [pion('rouge', 'A1', 'C3'), pion('bleu', 'B1', 'E4')];
    const m = parCouleur(resoudreManche(pions, { rouge: { C3: 1 }, bleu: { C3: 30 } }, LIBRE, alea()));
    expect(m.rouge).toMatchObject({ vers: 'C3', issue: 'juste', verrouille: true });
    expect(m.bleu).toMatchObject({ vers: 'B1', dispute: true, issue: 'faux' });
  });

  it('case occupée par un pion qui ne bouge pas : les deux échangent leurs places', () => {
    const pions = [pion('rouge', 'A1', 'C3'), pion('bleu', 'C3', 'E4')];
    const m = parCouleur(resoudreManche(pions, { rouge: { C3: 2 } }, LIBRE, alea()));
    expect(m.rouge).toMatchObject({ vers: 'C3', issue: 'juste', verrouille: true });
    expect(m.bleu).toMatchObject({ de: 'C3', vers: 'A1', echange: true, issue: 'sansVote' });
  });

  it('un échange peut placer un pion par chance', () => {
    const pions = [pion('rouge', 'A1', 'C3'), pion('bleu', 'C3', 'A1')];
    const m = parCouleur(resoudreManche(pions, { rouge: { C3: 2 } }, LIBRE, alea()));
    expect(m.rouge).toMatchObject({ vers: 'C3', verrouille: true, chance: false });
    expect(m.bleu).toMatchObject({ vers: 'A1', verrouille: true, chance: true, issue: 'juste' });
  });

  it('deux pions peuvent échanger leurs places d’un commun accord', () => {
    const pions = [pion('rouge', 'A1', 'E5'), pion('bleu', 'B2', 'E4')];
    const m = parCouleur(resoudreManche(pions, { rouge: { B2: 2 }, bleu: { A1: 2 } }, LIBRE, alea()));
    expect(m.rouge).toMatchObject({ vers: 'B2', echange: false, dispute: false });
    expect(m.bleu).toMatchObject({ vers: 'A1', echange: false, dispute: false });
  });

  it('une chaîne de déplacements se résout sans collision', () => {
    // rouge → case du bleu, bleu → case du vert, vert ne vote pas.
    const pions = [pion('rouge', 'A1', 'E5'), pion('bleu', 'B2', 'E4'), pion('vert', 'C3', 'E3')];
    const m = parCouleur(resoudreManche(pions, { rouge: { B2: 5 }, bleu: { C3: 2 } }, LIBRE, alea()));
    expect(m.rouge!.vers).toBe('B2');
    expect(m.bleu!.vers).toBe('C3');
    expect(m.vert).toMatchObject({ vers: 'A1', echange: true });
  });

  it('un cycle de trois pions tourne d’un cran', () => {
    const pions = [pion('rouge', 'A1', 'E5'), pion('bleu', 'B2', 'E4'), pion('vert', 'C3', 'E3')];
    const votes = { rouge: { B2: 1 }, bleu: { C3: 1 }, vert: { A1: 1 } };
    for (let graine = 0; graine < 20; graine++) {
      const m = parCouleur(resoudreManche(pions, votes, LIBRE, aleaGraine(graine)));
      expect([m.rouge!.vers, m.bleu!.vers, m.vert!.vers]).toEqual(['B2', 'C3', 'A1']);
    }
  });

  it('la régie peut révéler un pion : il va sur sa case quoi qu’il arrive', () => {
    const pions = [pion('rouge', 'A1', 'C3', { reveler: true }), pion('bleu', 'B1', 'E4')];
    const m = parCouleur(resoudreManche(pions, { rouge: { D4: 9 }, bleu: { C3: 9 } }, LIBRE, alea()));
    expect(m.rouge).toMatchObject({ vers: 'C3', revele: true, verrouille: true, issue: 'juste' });
    expect(m.bleu).toMatchObject({ vers: 'B1', dispute: true });
  });

  it('le choix de la régie remplace le vote (vote à main levée)', () => {
    const pions = [pion('rouge', 'A1', 'C3', { choixRegie: 'D4' })];
    const m = parCouleur(resoudreManche(pions, { rouge: { C3: 9 } }, LIBRE, alea()));
    expect(m.rouge).toMatchObject({ vers: 'D4', choix: 'D4', issue: 'faux' });
  });

  it('les votes pour une case verrouillée ou déjà essayée ne comptent pas', () => {
    const pions = [pion('rouge', 'A1', 'E5', { essais: ['A1', 'B2'] }), pion('bleu', 'C3', 'C3', { verrouille: true })];
    const m = parCouleur(resoudreManche(pions, { rouge: { C3: 9, B2: 8, D4: 1 } }, LIBRE, alea()));
    expect(m.rouge).toMatchObject({ vers: 'D4', choix: 'D4', voix: 1, votants: 1 });
    expect(m.bleu).toBeUndefined();
  });

  it('les pions absents et verrouillés ne bougent jamais', () => {
    const pions = [
      pion('rouge', 'A1', 'E5'),
      pion('bleu', 'C3', 'C3', { verrouille: true }),
      pion('vert', 'D4', 'D4', { absent: true, verrouille: true }),
    ];
    const m = resoudreManche(pions, { rouge: { B2: 1 }, bleu: { A1: 5 }, vert: { A1: 5 } }, LIBRE, alea());
    expect(m.map((x) => x.couleur)).toEqual(['rouge']);
  });

  it('invariants : jamais deux pions sur la même case, quoi que vote le public', () => {
    const hasard = aleaGraine(2026);
    const couleurs = SCENARIO_DEFAUT.pions.map((p) => p.couleur);
    for (let partie = 0; partie < 300; partie++) {
      const scenario = copier(SCENARIO_DEFAUT);
      const etats = etatsInitiaux(scenario);
      const options = optionsVote(scenario);
      for (let manche = 0; manche < 12; manche++) {
        const pions = pionsEnJeu(scenario, etats);
        const votes: Partial<Record<Couleur, Record<Case, number>>> = {};
        for (const p of pions) {
          if (p.verrouille || hasard() < 0.15) continue;
          const urne: Record<Case, number> = {};
          const nb = 1 + Math.floor(hasard() * 4);
          for (let v = 0; v < nb; v++) {
            // Y compris des votes invalides : le moteur doit les ignorer.
            const c = TOUTES_LES_CASES[Math.floor(hasard() * 25)]!;
            urne[c] = (urne[c] ?? 0) + 1 + Math.floor(hasard() * 5);
          }
          votes[p.couleur] = urne;
        }
        const avant = Object.fromEntries(pions.map((p) => [p.couleur, p]));
        const mouvements = resoudreManche(pions, votes, options, hasard);
        appliquerMouvements(scenario, etats, mouvements);

        const positions = couleurs.map((c) => etats[c]!.position);
        expect(new Set(positions).size, 'positions distinctes').toBe(couleurs.length);
        for (const p of scenario.pions) {
          const e = etats[p.couleur]!;
          expect(e.verrouille, `${p.couleur} verrouillé si et seulement si sur sa case`).toBe(e.position === p.cible);
          if (avant[p.couleur]!.verrouille) expect(e.position).toBe(avant[p.couleur]!.position);
          if (!e.verrouille) {
            expect(e.essais).toContain(e.position);
            expect(e.essais).not.toContain(p.cible);
          }
        }
        for (const m of mouvements) {
          if (m.choix === scenario.pions.find((p) => p.couleur === m.couleur)!.cible) {
            expect(m.verrouille, 'une bonne réponse gagne toujours').toBe(true);
          }
        }
      }
    }
  });
});

describe('après la manche', () => {
  it('note les cases fausses, compte les échecs et révèle les indices', () => {
    const scenario = copier(SCENARIO_DEFAUT);
    const etats = etatsInitiaux(scenario);
    const jouer = (votes: Partial<Record<Couleur, Record<Case, number>>>) => {
      const mouvements = resoudreManche(pionsEnJeu(scenario, etats), votes, optionsVote(scenario), alea());
      appliquerMouvements(scenario, etats, mouvements);
    };
    jouer({ rouge: { A1: 3 } });
    expect(etats.rouge).toMatchObject({ position: 'A1', echecs: 1, indices: 0, essais: ['A1', 'D4'] });
    jouer({ rouge: { A2: 3 } });
    expect(etats.rouge).toMatchObject({ position: 'A2', echecs: 2, indices: 1, essais: ['A1', 'A2', 'D4'] });
    jouer({ rouge: { B1: 3 } });
    expect(etats.rouge).toMatchObject({ position: 'B1', verrouille: true, echecs: 2 });
    // Les autres équipes n'ont pas voté : elles comptent 3 échecs et ont reçu un indice.
    expect(etats.bleu).toMatchObject({ position: 'C1', echecs: 3, indices: 1 });
  });

  it('calcule le nombre d’indices automatiques', () => {
    expect(indicesAutomatiques(0, 2, 2)).toBe(0);
    expect(indicesAutomatiques(1, 2, 2)).toBe(0);
    expect(indicesAutomatiques(2, 2, 2)).toBe(1);
    expect(indicesAutomatiques(4, 2, 2)).toBe(2);
    expect(indicesAutomatiques(40, 2, 2)).toBe(2);
    expect(indicesAutomatiques(40, 0, 2)).toBe(0);
  });
});

describe('partie complète avec des joueurs simulés', () => {
  it('se termine toujours, en quelques manches', () => {
    const durees: number[] = [];
    for (let graine = 1; graine <= 40; graine++) {
      const hasard = aleaGraine(graine);
      const scenario = copier(SCENARIO_DEFAUT);
      const etats = etatsInitiaux(scenario);
      const options = optionsVote(scenario);
      let manches = 0;
      while (!tousPlaces(scenario, etats) && manches < 40) {
        manches++;
        const pions = pionsEnJeu(scenario, etats);
        const votes: Partial<Record<Couleur, Record<Case, number>>> = {};
        for (const p of pions.filter((x) => !x.verrouille)) {
          const votables = casesVotables(p, pions, options);
          const urne: Record<Case, number> = {};
          for (let joueur = 0; joueur < 12; joueur++) {
            const meneuse = Object.entries(urne).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
            const vote = voteSimule(
              { votables, silhouette: options.silhouette, cible: p.cible, echecs: etats[p.couleur]!.echecs, meneuse },
              hasard,
            );
            if (vote) urne[vote] = (urne[vote] ?? 0) + 1;
          }
          votes[p.couleur] = urne;
        }
        appliquerMouvements(scenario, etats, resoudreManche(pions, votes, options, hasard));
      }
      expect(tousPlaces(scenario, etats), `graine ${graine}`).toBe(true);
      durees.push(manches);
    }
    const moyenne = durees.reduce((a, b) => a + b, 0) / durees.length;
    // Durée visée du spectacle : 3 à 5 minutes, soit une dizaine de manches au plus.
    expect(moyenne).toBeLessThan(8);
    expect(Math.max(...durees)).toBeLessThanOrEqual(12);
  });
});
