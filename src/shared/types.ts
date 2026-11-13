/**
 * Les types partagés entre le serveur et les écrans.
 */

import type { Couleur } from './couleurs';
import type { Contrainte } from './enigmes';
import type { Case } from './grille';

// ---------------------------------------------------------------------------
// Scénario : ce que l'équipe artistique écrit
// ---------------------------------------------------------------------------

export interface PionScenario {
  couleur: Couleur;
  /** Case de départ. */
  depart: Case;
  /** Case à trouver. Ne quitte jamais le serveur (sauf vers la régie). */
  cible: Case;
  /** Énigme de placement, affichée dès le début. */
  enigme: string;
  /** La même énigme, lisible par le vérificateur. */
  contraintes: Contrainte[];
  /** Indices (musicaux) révélés au fil des échecs. */
  indices: string[];
  /** Musicien·ne absent·e : le pion reste « fantôme » sur sa case cible, sans équipe. */
  absent: boolean;
}

export interface OptionsScenario {
  /** Montrer les cases de la figure à reconstituer (sans les couleurs). */
  afficherSilhouette: boolean;
  /** Afficher toutes les énigmes sur le grand écran et sur les téléphones. */
  enigmesPubliques: boolean;
  /** Autoriser le vote sur toutes les cases (sinon : seulement celles de la silhouette). */
  voteLibre: boolean;
  /** Les joueurs d'une équipe qui a trouvé peuvent aider une autre équipe. */
  renfort: boolean;
  /** Un indice est révélé tous les N échecs (0 = seulement à la main, par la régie). */
  echecsParIndice: number;
}

/** Durées des phases, en secondes. */
export interface Durees {
  /** Premier vote, plus long : le public découvre son énigme. */
  premierVote: number;
  vote: number;
  /** Affichage du résultat : les musiciens anticipent leur déplacement. */
  affichage: number;
  deplacement: number;
}

export interface Scenario {
  titre: string;
  sousTitre: string;
  pions: PionScenario[];
  options: OptionsScenario;
  durees: Durees;
  /** Durée visée de la partie, en secondes (0 = pas d'alerte). Au-delà, la régie est invitée à révéler les pions restants. */
  dureeCible: number;
}

// ---------------------------------------------------------------------------
// Partie : ce que le serveur fait évoluer
// ---------------------------------------------------------------------------

export type Phase = 'accueil' | 'vote' | 'affichage' | 'deplacement' | 'final';

export interface PionEtat {
  position: Case;
  verrouille: boolean;
  /** Cases dont on sait qu'elles sont fausses pour ce pion. */
  essais: Case[];
  /** Nombre de manches jouées sans trouver. */
  echecs: number;
  /** Nombre d'indices révélés. */
  indices: number;
  /** La régie donne la solution à la prochaine résolution. */
  reveler: boolean;
  /** Case imposée par la régie pour la manche en cours (vote à main levée). */
  choixRegie: Case | null;
}

export type Issue = 'juste' | 'faux' | 'sansVote';

/** Ce qui arrive à un pion à la fin d'une manche. */
export interface Mouvement {
  couleur: Couleur;
  de: Case;
  vers: Case;
  /** Case retenue par le vote de l'équipe (null si personne n'a voté). */
  choix: Case | null;
  /** Nombre de voix pour ce choix. */
  voix: number;
  /** Nombre de votants de l'équipe. */
  votants: number;
  issue: Issue;
  /** Le pion est verrouillé à l'issue de cette manche. */
  verrouille: boolean;
  /** La case choisie a été prise par une autre équipe. */
  dispute: boolean;
  /** Le pion a été délogé par une autre équipe (échange de places). */
  echange: boolean;
  /** La solution a été donnée par la régie. */
  revele: boolean;
  /** Le pion est tombé sur sa case sans que l'équipe l'ait choisie. */
  chance: boolean;
}

// ---------------------------------------------------------------------------
// Ce que reçoivent les écrans
// ---------------------------------------------------------------------------

export interface PionPublic {
  couleur: Couleur;
  position: Case;
  verrouille: boolean;
  absent: boolean;
  essais: Case[];
  echecs: number;
  enigme: string;
  /** Indices déjà révélés. */
  indices: string[];
}

export interface EtatPublic {
  /** Change à chaque remise à zéro complète : les téléphones se réinscrivent. */
  session: number;
  titre: string;
  sousTitre: string;
  phase: Phase;
  manche: number;
  /** Heure serveur de fin de la phase (null : pas de chrono). */
  finPhase: number | null;
  /** Durée totale de la phase en cours, en millisecondes (pour les barres de temps). */
  dureePhase: number;
  /** En pause : millisecondes restantes. */
  pause: number | null;
  /** Le chrono est terminé et la régie doit lancer la suite (avance manuelle). */
  attenteRegie: boolean;
  pions: PionPublic[];
  /** Cases de la figure à reconstituer, triées (null si la silhouette est cachée). */
  silhouette: Case[] | null;
  /** Résultat de la dernière manche (phases affichage, déplacement et final). */
  mouvements: Mouvement[] | null;
  /** Joueurs connectés par équipe. */
  equipes: Partial<Record<Couleur, number>>;
  /** Joueurs connectés au total. */
  joueurs: number;
  options: Pick<OptionsScenario, 'enigmesPubliques' | 'voteLibre' | 'renfort'>;
  /** Types de contraintes utilisés, pour le lexique. */
  lexique: string[];
  /** Temps de jeu écoulé à l'instant du message, en millisecondes (hors pauses). */
  tempsJeu: number;
}

export interface JournalManche {
  manche: number;
  mouvements: Mouvement[];
}

export interface StatsEquipe {
  inscrits: number;
  connectes: number;
  simules: number;
  votants: number;
}

/** Vue réservée à la régie. */
export interface EtatRegie {
  scenario: Scenario;
  pions: Partial<Record<Couleur, PionEtat>>;
  /** Dépouillement en direct : voix par case, par équipe. */
  votes: Partial<Record<Couleur, Record<Case, number>>>;
  equipes: Partial<Record<Couleur, StatsEquipe>>;
  inscrits: number;
  simules: number;
  avanceAuto: boolean;
  journal: JournalManche[];
  /** Le code régie vient de la configuration du serveur (non modifiable ici). */
  pinImpose: boolean;
}
