/**
 * Le scénario du concert (fichier scenarios/concert.json).
 *
 * ⚠️ Ce module contient les cases à trouver : seul le serveur doit l'importer.
 * S'il était importé par un écran, la solution partirait dans le code envoyé aux
 * navigateurs, lisible par n'importe qui. Un test de bout en bout le vérifie.
 */

import concert from '../../scenarios/concert.json';
import { validerScenario } from '../shared/scenario';
import type { Scenario } from '../shared/types';

function charger(): Scenario {
  const resultat = validerScenario(concert);
  if (!resultat.ok) throw new Error(`Scénario par défaut invalide : ${resultat.erreurs.join(' ')}`);
  return resultat.scenario;
}

export const SCENARIO_DEFAUT: Scenario = charger();
