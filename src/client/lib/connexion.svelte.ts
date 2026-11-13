/**
 * La connexion temps réel d'un écran (joueur, grand écran ou régie).
 * PartySocket se reconnecte tout seul ; à chaque reconnexion le serveur renvoie
 * l'état complet, donc un téléphone qui sort de veille est tout de suite à jour.
 */

import PartySocket from 'partysocket';
import type { Couleur } from '../../shared/couleurs';
import type { Case } from '../../shared/grille';
import { PARTI, SALON, type ActionRegie, type MessageClient, type MessageServeur, type Role } from '../../shared/protocole';
import type { EtatPublic, EtatRegie } from '../../shared/types';
import { ecrire, identifiant, lire } from './identite';

const CLE_JETON = 'tutti.regie.jeton';
const PATIENCE_MIN = 6000;
const PATIENCE_MAX = 20_000;

export interface Info {
  id: number;
  texte: string;
  erreur: boolean;
}

export class Connexion {
  readonly role: Role;
  /** État public de la partie. */
  etat = $state.raw<EtatPublic | null>(null);
  /** Heure serveur du dernier état reçu. */
  tsEtat = $state(0);
  /** Mon équipe et mon vote (joueurs). */
  moi = $state.raw<{ equipe: Couleur | null; vote: Case | null; manche: number } | null>(null);
  /** Les votes de mon équipe, en direct. */
  tendance = $state.raw<{ manche: number; equipe: Couleur; votes: Record<Case, number> } | null>(null);
  /** Nombre de votants par équipe, en direct. */
  votants = $state.raw<{ manche: number; v: Partial<Record<Couleur, number>> } | null>(null);
  /** Vue complète (régie authentifiée). */
  regie = $state.raw<EtatRegie | null>(null);
  auth = $state.raw<{ ok: boolean; aDefinir?: boolean; raison?: string } | null>(null);
  enLigne = $state(false);
  /** Régie : un jeton enregistré est en cours de vérification (on n'affiche pas encore le formulaire). */
  verification = $state(false);
  /** Écart entre l'horloge du serveur et celle de l'appareil, en millisecondes. */
  decalage = $state(0);
  infos = $state<Info[]>([]);

  private socket: PartySocket;
  private meilleurAllerRetour = Infinity;
  private compteurInfos = 0;
  private reponsesAuth = 0;
  private minuteriePing: ReturnType<typeof setInterval> | null = null;
  private minuterieRetard: ReturnType<typeof setInterval> | null = null;
  private surveillance: ReturnType<typeof setTimeout> | null = null;
  /** Heure (locale) du dernier message reçu du serveur. */
  private dernierMessage = 0;
  /** Fin de phase pour laquelle on a déjà vérifié que la connexion vivait. */
  private retardVerifie = 0;
  /** Délai accordé au serveur pour répondre ; il s'allonge si le réseau est très lent. */
  private patience = PATIENCE_MIN;
  private numeroVote = 0;
  /** Vote envoyé dont le serveur n'a pas encore accusé réception. */
  private voteEnAttente: { n: number; manche: number; case: Case; envoi: number } | null = null;

  constructor(role: Role) {
    this.role = role;
    this.socket = new PartySocket({
      host: location.host,
      protocol: location.protocol === 'https:' ? 'wss' : 'ws',
      party: PARTI,
      room: SALON,
      query: { role, id: identifiant(role) },
      minReconnectionDelay: 500,
      maxReconnectionDelay: 4000,
      reconnectionDelayGrowFactor: 1.4,
      connectionTimeout: 6000,
    });
    this.socket.addEventListener('open', () => {
      this.enLigne = true;
      this.meilleurAllerRetour = Infinity;
      if (role === 'regie') {
        const jeton = lire(CLE_JETON);
        this.reponsesAuth = 0;
        this.verification = jeton !== null;
        if (jeton) this.envoyer({ t: 'auth', jeton });
      }
      // Un vote parti juste avant la coupure a pu se perdre : on le renvoie (sans risque, il est numéroté).
      this.renvoyerVote();
      this.ping();
      setTimeout(() => this.ping(), 1500);
    });
    this.socket.addEventListener('close', () => {
      this.enLigne = false;
      this.verification = false;
    });
    this.socket.addEventListener('message', (evenement: MessageEvent) => {
      this.dernierMessage = Date.now();
      if (typeof evenement.data !== 'string') return;
      try {
        this.recevoir(JSON.parse(evenement.data) as MessageServeur);
      } catch {
        // Message illisible : on l'ignore.
      }
    });
    this.minuteriePing = setInterval(() => this.ping(), 10_000);
    this.minuterieRetard = setInterval(() => this.verifierRetard(), 2000);
    // Au retour sur l'onglet (sortie de veille), on vérifie tout de suite la connexion.
    document.addEventListener('visibilitychange', this.surVisibilite);
  }

  private surVisibilite = () => {
    if (document.visibilityState !== 'visible') return;
    if (this.socket.readyState === WebSocket.CLOSED) this.socket.reconnect();
    else this.ping(3000);
  };

  /** Temps de jeu écoulé (hors pauses), en millisecondes, à l'instant `local`. */
  tempsJeu(local: number): number {
    const e = this.etat;
    if (!e) return 0;
    const enCours = e.pause === null && (e.phase === 'vote' || e.phase === 'affichage' || e.phase === 'deplacement');
    return e.tempsJeu + (enCours ? Math.max(0, local + this.decalage - this.tsEtat) : 0);
  }

  /**
   * Demande au serveur s'il est là. Sans aucune nouvelle dans le délai, la
   * connexion est morte sans s'être fermée (cas courant sur réseau mobile) :
   * on en ouvre une autre, et le serveur renvoie l'état complet.
   */
  private ping(delai = this.patience): void {
    if (this.socket.readyState !== WebSocket.OPEN) return;
    const envoi = Date.now();
    this.envoyer({ t: 'ping', c: envoi });
    if (this.surveillance) clearTimeout(this.surveillance);
    this.surveillance = setTimeout(() => {
      this.surveillance = null;
      if (this.dernierMessage >= envoi || this.socket.readyState !== WebSocket.OPEN) return;
      // Sur un réseau très lent, se reconnecter en boucle n'arrangerait rien : on patiente davantage la fois suivante.
      this.patience = Math.min(PATIENCE_MAX, this.patience * 2);
      this.enLigne = false;
      this.socket.reconnect();
    }, Math.max(delai, this.patience === PATIENCE_MIN ? 0 : this.patience));
  }

  /** Renvoie le vote qui n'a pas encore reçu de réponse du serveur. */
  private renvoyerVote(): void {
    const attente = this.voteEnAttente;
    if (!attente || this.socket.readyState !== WebSocket.OPEN) return;
    attente.envoi = Date.now();
    this.envoyer({ t: 'vote', manche: attente.manche, case: attente.case, n: attente.n });
  }

  /** Le chrono est écoulé depuis plusieurs secondes et rien n'arrive : on vérifie la connexion. */
  private verifierRetard(): void {
    if (this.voteEnAttente && Date.now() - this.voteEnAttente.envoi > 3000) this.renvoyerVote();
    const e = this.etat;
    if (!e || e.finPhase === null || e.pause !== null || e.attenteRegie || e.finPhase === this.retardVerifie) return;
    if (Date.now() + this.decalage < e.finPhase + 4000) return;
    this.retardVerifie = e.finPhase;
    this.ping(3000);
  }

  private recevoir(m: MessageServeur): void {
    switch (m.t) {
      case 'etat':
        // Première estimation de l'horloge, affinée ensuite par les pings.
        if (this.meilleurAllerRetour === Infinity) this.decalage = m.ts - Date.now();
        if (this.etat && m.e.session !== this.etat.session) this.tendance = null;
        this.etat = m.e;
        this.tsEtat = m.ts;
        break;
      case 'moi': {
        let attente = this.voteEnAttente;
        // Changement d'équipe ou de manche : le vote en attente n'a plus de sens.
        if (attente && (attente.manche !== m.manche || (this.moi !== null && this.moi.equipe !== m.equipe))) {
          attente = this.voteEnAttente = null;
        }
        if (m.ack !== undefined) {
          // Réponse à un vote que j'ai déjà remplacé par un autre : j'attends la réponse au dernier.
          if (attente && m.ack < attente.n) break;
          this.voteEnAttente = null;
          this.moi = { equipe: m.equipe, vote: m.vote, manche: m.manche };
        } else {
          // Message spontané du serveur (reconnexion…) : mon vote en attente est en route, je le garde affiché.
          this.moi = { equipe: m.equipe, vote: attente ? attente.case : m.vote, manche: m.manche };
        }
        break;
      }
      case 'tendance':
        this.tendance = m;
        break;
      case 'votants':
        this.votants = m;
        break;
      case 'regie':
        this.regie = m.r;
        break;
      case 'auth':
        // Le serveur répond d'abord « non authentifié » à toute connexion, puis au jeton envoyé.
        this.reponsesAuth++;
        if (m.ok) {
          this.auth = m;
          this.verification = false;
          if (m.jeton) ecrire(CLE_JETON, m.jeton);
        } else if (this.verification && this.reponsesAuth < 2) {
          // Réponse d'accueil : on attend celle du jeton. La régie déjà affichée reste en place
          // (une micro-coupure ne doit pas faire perdre un scénario en cours de saisie).
        } else {
          this.auth = m;
          this.regie = null;
          if (this.verification) {
            // Le jeton enregistré n'est plus valable : il faut ressaisir le code.
            this.verification = false;
            ecrire(CLE_JETON, null);
          }
        }
        break;
      case 'pong': {
        const maintenant = Date.now();
        const allerRetour = maintenant - m.c;
        this.patience = PATIENCE_MIN;
        if (allerRetour >= 0 && allerRetour <= this.meilleurAllerRetour + 30) {
          this.meilleurAllerRetour = Math.min(this.meilleurAllerRetour, allerRetour);
          this.decalage = m.ts + allerRetour / 2 - maintenant;
        }
        break;
      }
      case 'info':
        this.informer(m.texte, m.erreur === true);
        break;
    }
  }

  informer(texte: string, erreur = false): void {
    const id = ++this.compteurInfos;
    this.infos.push({ id, texte, erreur });
    setTimeout(() => {
      const index = this.infos.findIndex((i) => i.id === id);
      if (index >= 0) this.infos.splice(index, 1);
    }, erreur ? 6000 : 3500);
  }

  private envoyer(message: MessageClient): void {
    this.socket.send(JSON.stringify(message));
  }

  voter(c: Case): void {
    if (!this.etat || !this.moi) return;
    // On affiche le vote tout de suite. Il est numéroté : le serveur répond à chaque vote,
    // et tant que la réponse n'est pas arrivée, on le renvoie (coupure, reconnexion).
    const attente = { n: ++this.numeroVote, manche: this.etat.manche, case: c, envoi: Date.now() };
    this.voteEnAttente = attente;
    this.moi = { ...this.moi, vote: c, manche: attente.manche };
    this.envoyer({ t: 'vote', manche: attente.manche, case: c, n: attente.n });
  }

  renfort(): void {
    this.envoyer({ t: 'renfort' });
  }

  authentifier(pin: string): void {
    this.envoyer({ t: 'auth', pin });
  }

  definirPin(pin: string): void {
    this.envoyer({ t: 'definirPin', pin });
  }

  action(action: ActionRegie): void {
    // Hors ligne, la commande partirait à la reconnexion, avant que la régie soit
    // de nouveau reconnue, et serait ignorée sans rien dire : mieux vaut prévenir.
    if (this.socket.readyState !== WebSocket.OPEN) {
      this.informer('Connexion perdue : la commande n’est pas partie. Réessayez dans un instant.', true);
      return;
    }
    this.envoyer({ t: 'regie', action });
  }

  deconnecterRegie(): void {
    ecrire(CLE_JETON, null);
    this.regie = null;
    // On repart d'une connexion neuve : le serveur oublie que cet appareil était authentifié.
    this.socket.reconnect();
  }

  fermer(): void {
    if (this.minuteriePing) clearInterval(this.minuteriePing);
    if (this.minuterieRetard) clearInterval(this.minuterieRetard);
    if (this.surveillance) clearTimeout(this.surveillance);
    document.removeEventListener('visibilitychange', this.surVisibilite);
    this.socket.close();
  }
}
