/** Les messages échangés en temps réel entre les écrans et le serveur. */

import type { Couleur } from './couleurs';
import type { Case } from './grille';
import type { Durees, EtatPublic, EtatRegie, OptionsScenario, Phase } from './types';

export type Role = 'joueur' | 'ecran' | 'regie';

/** Nom du salon : une seule partie à la fois. */
export const SALON = 'tutti';
/** Nom du « parti » : la classe GameRoom du serveur. */
export const PARTI = 'game-room';

export interface Reglages {
  durees?: Partial<Durees>;
  dureeCible?: number;
  options?: Partial<OptionsScenario>;
  avanceAuto?: boolean;
}

export type ActionRegie =
  | { a: 'lancer' }
  | { a: 'pause' }
  | { a: 'reprendre' }
  /**
   * La régie précise la phase qu'elle voit : si le serveur a déjà avancé (double clic,
   * chrono qui se termine au même instant), la commande est ignorée.
   */
  | { a: 'suivant'; phase?: Phase; manche?: number }
  | { a: 'prolonger'; secondes: number }
  | { a: 'terminer' }
  | { a: 'reveler'; couleur: Couleur; actif: boolean }
  | { a: 'indice'; couleur: Couleur }
  | { a: 'deplacer'; couleur: Couleur; case: Case }
  | { a: 'deverrouiller'; couleur: Couleur }
  | { a: 'choisir'; couleur: Couleur; case: Case | null }
  | { a: 'absent'; couleur: Couleur; absent: boolean }
  | { a: 'reglages'; reglages: Reglages }
  | { a: 'scenario'; scenario: unknown }
  | { a: 'scenarioDefaut' }
  | { a: 'simules'; nombre: number }
  | { a: 'reequilibrer' }
  | { a: 'reinitialiser'; joueurs: boolean }
  | { a: 'changerPin'; pin: string };

export type MessageClient =
  /** `n` : numéro du vote sur cet appareil ; le serveur le renvoie dans sa réponse (`ack`). */
  | { t: 'vote'; manche: number; case: Case; n?: number }
  | { t: 'renfort' }
  | { t: 'ping'; c: number }
  /** Régie : code saisi, ou jeton reçu lors d'une connexion précédente. */
  | { t: 'auth'; pin?: string; jeton?: string }
  | { t: 'definirPin'; pin: string }
  | { t: 'regie'; action: ActionRegie };

export type MessageServeur =
  | { t: 'etat'; ts: number; e: EtatPublic }
  /** Ce qui ne concerne que ce joueur. `ack` : réponse au vote numéro `ack` de cet appareil. */
  | { t: 'moi'; equipe: Couleur | null; vote: Case | null; manche: number; ack?: number }
  /** Les votes de mon équipe, en direct. */
  | { t: 'tendance'; manche: number; equipe: Couleur; votes: Record<Case, number> }
  /** Nombre de votants par équipe, en direct. */
  | { t: 'votants'; manche: number; v: Partial<Record<Couleur, number>> }
  | { t: 'regie'; r: EtatRegie }
  | { t: 'auth'; ok: boolean; jeton?: string; aDefinir?: boolean; raison?: string }
  | { t: 'pong'; c: number; ts: number }
  | { t: 'info'; texte: string; erreur?: boolean };

const ROLES: readonly string[] = ['joueur', 'ecran', 'regie'];
const MOTIF_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** Vérifie le rôle et l'identifiant annoncés à la connexion. */
export function connexionValide(role: string | null, id: string | null): role is Role {
  return role !== null && ROLES.includes(role) && id !== null && MOTIF_ID.test(id);
}

/** Un code court se devine par essais successifs : 6 caractères au moins. */
export const PIN_MIN = 6;
export const PIN_MAX = 32;
