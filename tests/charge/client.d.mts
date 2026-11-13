import type { ActionRegie } from '../../src/shared/protocole';
import type { EtatPublic, EtatRegie } from '../../src/shared/types';

export function idAleatoire(prefixe?: string): string;

export class Client {
  constructor(base: string, role: 'joueur' | 'ecran' | 'regie', id?: string);
  role: string;
  id: string;
  etat: EtatPublic;
  moi: { equipe: string | null; vote: string | null; manche: number };
  regie: EtatRegie;
  auth: { ok: boolean; jeton?: string; aDefinir?: boolean; raison?: string } | null;
  tendance: { manche: number; equipe: string; votes: Record<string, number> } | null;
  infos: Array<{ texte: string; erreur?: boolean }>;
  recus: number;
  octets: number;
  /** Tous les messages reçus, bruts (pour vérifier ce qui circule). */
  bruts: string[];
  ouvert: Promise<Client>;
  envoyer(message: unknown): void;
  brut(texte: string): void;
  action(action: ActionRegie): void;
  voter(c: string): void;
  attendre(condition: (client: Client) => boolean, delai?: number, quoi?: string): Promise<Client>;
  fermer(): void;
}

export function ouvrirRegie(base: string, pin: string): Promise<Client>;
export function pause(ms: number): Promise<void>;
