/**
 * Le salon de jeu : un Durable Object unique qui fait autorité sur la partie.
 *
 * Il garde l'état, fait avancer les phases (chronos par « alarmes »), reçoit les
 * votes, applique les règles (src/shared/regles.ts) et diffuse le résultat à tous
 * les écrans. L'état est enregistré à chaque changement : si le serveur
 * redémarre, la partie reprend où elle en était.
 *
 * Les cases à trouver ne sont jamais envoyées aux téléphones ni au grand écran.
 */

import { Server, type Connection, type ConnectionContext, type WSMessage } from 'partyserver';
import { hachage01 } from '../shared/alea';
import { COULEURS, estCouleur, type Couleur } from '../shared/couleurs';
import { equipeLaMoinsNombreuse, repartir, voteSimule } from '../shared/equipes';
import { estCase, type Case } from '../shared/grille';
import { PIN_MAX, PIN_MIN, connexionValide, type ActionRegie, type MessageServeur, type Reglages, type Role } from '../shared/protocole';
import {
  appliquerMouvements,
  casesVerrouillees,
  casesVotables,
  depouiller,
  equipesEnJeu,
  etatsInitiaux,
  optionsVote,
  pionsEnJeu,
  resoudreManche,
  silhouetteDe,
  tousPlaces,
} from '../shared/regles';
import { SCENARIO_DEFAUT, copier, nettoyerDurees, nettoyerOptions, validerScenario, LIMITES } from '../shared/scenario';
import type {
  EtatPublic,
  EtatRegie,
  JournalManche,
  Mouvement,
  Phase,
  PionEtat,
  Scenario,
  StatsEquipe,
} from '../shared/types';

export interface Env {
  GameRoom: DurableObjectNamespace<GameRoom>;
  ASSETS: Fetcher;
  /** Code de la régie, défini comme secret Cloudflare (facultatif : sinon il est choisi à la première connexion). */
  REGIE_PIN?: string;
}

interface Joueur {
  equipe: Couleur | null;
  simule?: true;
}

/** Tout ce qui est enregistré. */
interface Sauvegarde {
  version: 1;
  session: number;
  scenario: Scenario;
  phase: Phase;
  manche: number;
  finPhase: number | null;
  dureePhase: number;
  pause: number | null;
  attenteRegie: boolean;
  avanceAuto: boolean;
  /** Temps de jeu : cumul hors pauses, et heure de la dernière reprise. */
  chrono: { cumul: number; depuis: number | null };
  debutVote: number;
  pions: Partial<Record<Couleur, PionEtat>>;
  mouvements: Mouvement[] | null;
  journal: JournalManche[];
  joueurs: Record<string, Joueur>;
  /** Votes de la manche en cours : identifiant du joueur → case. */
  votes: Record<string, Case>;
  pin: { sel: string; hache: string } | null;
  jetons: string[];
}

interface EtatConnexion {
  role: Role;
  id: string;
  auth?: boolean;
}

const CLE = 'etat';
const MAX_JOUEURS = 600;
const MAX_SIMULES = 300;
const MAX_JOURNAL = 40;
const TAILLE_MESSAGE_MAX = 64_000;
const PHASES_DE_JEU: readonly Phase[] = ['vote', 'affichage', 'deplacement'];

function nouvelleSauvegarde(): Sauvegarde {
  const scenario = copier(SCENARIO_DEFAUT);
  return {
    version: 1,
    session: 1,
    scenario,
    phase: 'accueil',
    manche: 0,
    finPhase: null,
    dureePhase: 0,
    pause: null,
    attenteRegie: false,
    avanceAuto: true,
    chrono: { cumul: 0, depuis: null },
    debutVote: 0,
    pions: etatsInitiaux(scenario),
    mouvements: null,
    journal: [],
    joueurs: {},
    votes: {},
    pin: null,
    jetons: [],
  };
}

function hexa(octets: Uint8Array): string {
  return [...octets].map((o) => o.toString(16).padStart(2, '0')).join('');
}

function jetonAleatoire(): string {
  return hexa(crypto.getRandomValues(new Uint8Array(16)));
}

async function hacher(sel: string, pin: string): Promise<string> {
  const donnees = new TextEncoder().encode(`${sel}:${pin}`);
  return hexa(new Uint8Array(await crypto.subtle.digest('SHA-256', donnees)));
}

/** Comparaison en temps constant, pour ne rien révéler du code. */
function egal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export class GameRoom extends Server<Env> {
  static options = { hibernate: true };

  private e: Sauvegarde = nouvelleSauvegarde();
  private minuterieDiffusion: ReturnType<typeof setTimeout> | null = null;
  private minuterieSauvegarde: ReturnType<typeof setTimeout> | null = null;
  private minuterieTendances: ReturnType<typeof setTimeout> | null = null;
  private equipesModifiees = new Set<Couleur>();
  private debit = new Map<string, { n: number; depuis: number }>();
  private echecsPin = { n: 0, depuis: 0 };

  // -------------------------------------------------------------------------
  // Cycle de vie
  // -------------------------------------------------------------------------

  async onStart(): Promise<void> {
    const sauvegarde = this.ctx.storage.kv.get<Sauvegarde>(CLE);
    if (sauvegarde?.version === 1) {
      const scenario = validerScenario(sauvegarde.scenario);
      this.e = { ...nouvelleSauvegarde(), ...sauvegarde, scenario: scenario.ok ? scenario.scenario : copier(SCENARIO_DEFAUT) };
      if (!scenario.ok) this.e.pions = etatsInitiaux(this.e.scenario);
    }
    await this.programmerReveil();
  }

  onConnect(connexion: Connection<EtatConnexion>, contexte: ConnectionContext): void {
    const parametres = new URL(contexte.request.url).searchParams;
    const role = parametres.get('role');
    const id = parametres.get('id');
    // Déjà vérifié à l'entrée du serveur (src/server/index.ts) : simple précaution.
    if (!connexionValide(role, id) || id === null) {
      this.plusTard(20, () => connexion.close(4000, 'Connexion invalide'));
      return;
    }
    connexion.setState({ role, id });
    if (role === 'joueur') this.inscrire(id);
    this.envoyer(connexion, { t: 'etat', ts: Date.now(), e: this.etatPublic() });
    if (role === 'joueur') {
      this.envoyerMoi(connexion, id);
      const equipe = this.e.joueurs[id]?.equipe;
      if (equipe && this.e.phase === 'vote') {
        this.envoyer(connexion, { t: 'tendance', manche: this.e.manche, equipe, votes: this.urnes()[equipe] ?? {} });
      }
    }
    if (this.e.phase === 'vote') this.envoyer(connexion, { t: 'votants', manche: this.e.manche, v: this.votantsParEquipe() });
    if (role === 'regie') {
      this.envoyer(connexion, { t: 'auth', ok: false, aDefinir: !this.env.REGIE_PIN && !this.e.pin });
    }
    this.diffuserBientot();
    this.sauverBientot();
  }

  async onMessage(connexion: Connection<EtatConnexion>, brut: WSMessage): Promise<void> {
    if (typeof brut !== 'string' || brut.length > TAILLE_MESSAGE_MAX) return;
    const etat = connexion.state;
    if (!etat || !this.debitAutorise(connexion.id)) return;
    let message: Record<string, unknown>;
    try {
      const lu: unknown = JSON.parse(brut);
      if (!lu || typeof lu !== 'object') return;
      message = lu as Record<string, unknown>;
    } catch {
      return;
    }

    switch (message.t) {
      case 'ping':
        this.envoyer(connexion, { t: 'pong', c: Number(message.c) || 0, ts: Date.now() });
        return;
      case 'vote':
        if (etat.role === 'joueur') this.voter(connexion, etat.id, message.manche, message.case);
        return;
      case 'renfort':
        if (etat.role === 'joueur') this.renforcer(connexion, etat.id);
        return;
      case 'auth':
        if (etat.role === 'regie') await this.authentifier(connexion, message);
        return;
      case 'definirPin':
        if (etat.role === 'regie') await this.definirPin(connexion, message.pin);
        return;
      case 'regie':
        if (etat.role === 'regie' && etat.auth) await this.executer(connexion, message.action as ActionRegie);
        return;
    }
  }

  onClose(connexion: Connection): void {
    this.debit.delete(connexion.id);
    this.diffuserBientot();
  }

  onError(): void {
    this.diffuserBientot();
  }

  async onAlarm(): Promise<void> {
    const e = this.e;
    if (e.pause !== null) return;
    try {
      const maintenant = Date.now();
      if (e.phase === 'vote') this.faireVoterLesSimules(maintenant);
      if (e.finPhase !== null && !e.attenteRegie && maintenant >= e.finPhase - 25) {
        if (e.avanceAuto) this.avancer();
        else e.attenteRegie = true;
        this.diffuser();
        this.sauver();
      }
    } catch (erreur) {
      // Une erreur ici ferait rejouer le réveil en boucle par Cloudflare et figerait
      // la partie : on la note, et on retente dans une seconde.
      console.error('Tutti : erreur pendant le changement de phase', erreur);
      if (e.finPhase !== null) e.finPhase = Date.now() + 1000;
    } finally {
      await this.programmerReveil();
    }
  }

  // -------------------------------------------------------------------------
  // Déroulement de la partie
  // -------------------------------------------------------------------------

  private enJeu(): boolean {
    return PHASES_DE_JEU.includes(this.e.phase);
  }

  private chronometrer(secondes: number): void {
    this.e.dureePhase = secondes * 1000;
    this.e.finPhase = Date.now() + this.e.dureePhase;
    this.e.pause = null;
    this.e.attenteRegie = false;
  }

  private lancer(): void {
    const e = this.e;
    if (e.phase !== 'accueil') return;
    e.pions = etatsInitiaux(e.scenario);
    e.manche = 1;
    e.mouvements = null;
    e.journal = [];
    e.votes = {};
    e.chrono = { cumul: 0, depuis: Date.now() };
    if (tousPlaces(e.scenario, e.pions)) {
      this.finir();
      return;
    }
    this.demarrerVote();
  }

  private demarrerVote(): void {
    const e = this.e;
    e.votes = {};
    e.mouvements = null;
    const restants = equipesEnJeu(e.scenario, e.pions);
    if (restants.length === 0) {
      this.finir();
      return;
    }
    e.phase = 'vote';
    e.debutVote = Date.now();
    // Si la régie a demandé à révéler tous les pions restants, inutile de voter.
    if (restants.every((c) => e.pions[c]?.reveler)) {
      this.terminerVote();
      return;
    }
    this.chronometrer(e.manche === 1 ? e.scenario.durees.premierVote : e.scenario.durees.vote);
  }

  private terminerVote(): void {
    const e = this.e;
    const pions = pionsEnJeu(e.scenario, e.pions);
    const mouvements = resoudreManche(pions, this.urnes(), optionsVote(e.scenario), Math.random);
    appliquerMouvements(e.scenario, e.pions, mouvements);
    e.mouvements = mouvements;
    e.journal.push({ manche: e.manche, mouvements });
    if (e.journal.length > MAX_JOURNAL) e.journal.splice(0, e.journal.length - MAX_JOURNAL);
    e.votes = {};
    e.phase = 'affichage';
    this.chronometrer(e.scenario.durees.affichage);
  }

  private finir(): void {
    const e = this.e;
    e.phase = 'final';
    e.finPhase = null;
    e.pause = null;
    e.attenteRegie = false;
    if (e.chrono.depuis !== null) {
      e.chrono.cumul += Date.now() - e.chrono.depuis;
      e.chrono.depuis = null;
    }
  }

  /** Passe à la phase suivante (fin du chrono, ou bouton « Suivant » de la régie). */
  private avancer(): void {
    const e = this.e;
    switch (e.phase) {
      case 'vote':
        this.terminerVote();
        break;
      case 'affichage':
        e.phase = 'deplacement';
        this.chronometrer(e.scenario.durees.deplacement);
        break;
      case 'deplacement':
        if (tousPlaces(e.scenario, e.pions)) {
          this.finir();
        } else {
          e.manche += 1;
          this.demarrerVote();
        }
        break;
      default:
        return;
    }
  }

  private mettreEnPause(): void {
    const e = this.e;
    if (!this.enJeu() || e.pause !== null) return;
    e.pause = e.finPhase === null ? 0 : Math.max(0, e.finPhase - Date.now());
    e.finPhase = null;
    if (e.chrono.depuis !== null) {
      e.chrono.cumul += Date.now() - e.chrono.depuis;
      e.chrono.depuis = null;
    }
  }

  private reprendre(): void {
    const e = this.e;
    if (!this.enJeu() || e.pause === null) return;
    e.finPhase = Date.now() + e.pause;
    e.pause = null;
    e.chrono.depuis = Date.now();
  }

  private prolonger(secondes: number): void {
    const e = this.e;
    if (!this.enJeu()) return;
    const ajout = Math.min(120, Math.max(1, Math.round(secondes))) * 1000;
    if (e.pause !== null) {
      e.pause += ajout;
    } else {
      e.finPhase = Math.max(e.finPhase ?? 0, Date.now()) + ajout;
      e.attenteRegie = false;
    }
    e.dureePhase += ajout;
  }

  // -------------------------------------------------------------------------
  // Joueurs et équipes
  // -------------------------------------------------------------------------

  private equipesActives(): Couleur[] {
    return this.e.scenario.pions.filter((p) => !p.absent).map((p) => p.couleur);
  }

  /** Identifiants des joueurs réellement connectés. */
  private connectes(): Set<string> {
    const ids = new Set<string>();
    for (const connexion of this.getConnections<EtatConnexion>()) {
      if (connexion.state?.role === 'joueur') ids.add(connexion.state.id);
    }
    return ids;
  }

  /** Joueurs présents par équipe : connectés + simulés. */
  private presentsParEquipe(connectes = this.connectes()): Partial<Record<Couleur, number>> {
    const effectifs: Partial<Record<Couleur, number>> = {};
    for (const [id, joueur] of Object.entries(this.e.joueurs)) {
      if (!joueur.equipe) continue;
      if (joueur.simule || connectes.has(id)) effectifs[joueur.equipe] = (effectifs[joueur.equipe] ?? 0) + 1;
    }
    return effectifs;
  }

  /** Choisit une équipe pour un nouveau joueur : la moins nombreuse, au hasard en cas d'égalité. */
  private choisirEquipe(): Couleur | null {
    const actives = this.equipesActives();
    const enJeu = this.enJeu() ? equipesEnJeu(this.e.scenario, this.e.pions) : [];
    return equipeLaMoinsNombreuse(this.presentsParEquipe(), enJeu.length > 0 ? enJeu : actives, Math.random);
  }

  private inscrire(id: string): void {
    const e = this.e;
    const connu = e.joueurs[id];
    if (connu) {
      // Son équipe a pu disparaître (musicien marqué absent entre-temps).
      if (!connu.equipe || !this.equipesActives().includes(connu.equipe)) connu.equipe = this.choisirEquipe();
      return;
    }
    if (Object.keys(e.joueurs).length >= MAX_JOUEURS) {
      // Salon plein : on oublie d'abord les joueurs partis, pour laisser la place aux présents.
      const connectes = this.connectes();
      for (const [autre, joueur] of Object.entries(e.joueurs)) {
        if (!joueur.simule && !connectes.has(autre)) {
          delete e.joueurs[autre];
          delete e.votes[autre];
        }
      }
    }
    // Toujours plein : le nouveau venu regarde la partie en spectateur.
    const plein = Object.keys(e.joueurs).length >= MAX_JOUEURS;
    e.joueurs[id] = { equipe: plein ? null : this.choisirEquipe() };
  }

  private nbSimules(): number {
    let n = 0;
    for (const joueur of Object.values(this.e.joueurs)) if (joueur.simule) n++;
    return n;
  }

  private reglerSimules(nombre: number): void {
    const e = this.e;
    const voulu = Math.min(MAX_SIMULES, Math.max(0, Math.round(nombre) || 0));
    const actuels = Object.keys(e.joueurs).filter((id) => e.joueurs[id]?.simule);
    for (const id of actuels.slice(voulu)) {
      delete e.joueurs[id];
      delete e.votes[id];
    }
    for (let i = actuels.length; i < voulu; i++) {
      let numero = i + 1;
      while (e.joueurs[`simule-${numero}`]) numero++;
      e.joueurs[`simule-${numero}`] = { equipe: this.choisirEquipe(), simule: true };
    }
  }

  /** Redistribue tout le monde au hasard, en équipes égales. Les joueurs partis sont oubliés. */
  private reequilibrer(): void {
    const e = this.e;
    const connectes = this.connectes();
    for (const [id, joueur] of Object.entries(e.joueurs)) {
      if (!joueur.simule && !connectes.has(id)) delete e.joueurs[id];
    }
    const affectation = repartir(Object.keys(e.joueurs), this.equipesActives(), Math.random);
    for (const [id, joueur] of Object.entries(e.joueurs)) joueur.equipe = affectation[id] ?? null;
    e.votes = {};
    this.rappelerLesJoueurs();
  }

  /** Replace les joueurs dont l'équipe n'existe plus. */
  private recaserLesOrphelins(): void {
    const actives = this.equipesActives();
    for (const [id, joueur] of Object.entries(this.e.joueurs)) {
      if (joueur.equipe && actives.includes(joueur.equipe)) continue;
      joueur.equipe = null;
      joueur.equipe = this.choisirEquipe();
      delete this.e.votes[id];
    }
    this.rappelerLesJoueurs();
  }

  /** Un joueur dont l'équipe a trouvé rejoint une équipe encore en jeu. */
  private renforcer(connexion: Connection<EtatConnexion>, id: string): void {
    const e = this.e;
    const joueur = e.joueurs[id];
    if (!joueur?.equipe || !this.enJeu() || !e.scenario.options.renfort) return;
    if (!e.pions[joueur.equipe]?.verrouille) return;
    const restantes = equipesEnJeu(e.scenario, e.pions);
    const equipe = equipeLaMoinsNombreuse(this.presentsParEquipe(), restantes, Math.random);
    if (!equipe) return;
    joueur.equipe = equipe;
    delete e.votes[id];
    this.envoyerMoi(connexion, id);
    if (e.phase === 'vote') {
      this.envoyer(connexion, { t: 'tendance', manche: e.manche, equipe, votes: this.urnes()[equipe] ?? {} });
    }
    this.diffuserBientot();
    this.sauverBientot();
  }

  // -------------------------------------------------------------------------
  // Votes
  // -------------------------------------------------------------------------

  /** Voix par case, pour chaque équipe. */
  private urnes(): Partial<Record<Couleur, Record<Case, number>>> {
    const urnes: Partial<Record<Couleur, Record<Case, number>>> = {};
    for (const [id, c] of Object.entries(this.e.votes)) {
      const equipe = this.e.joueurs[id]?.equipe;
      if (!equipe) continue;
      const urne = (urnes[equipe] ??= {});
      urne[c] = (urne[c] ?? 0) + 1;
    }
    return urnes;
  }

  private votantsParEquipe(): Partial<Record<Couleur, number>> {
    const votants: Partial<Record<Couleur, number>> = {};
    for (const id of Object.keys(this.e.votes)) {
      const equipe = this.e.joueurs[id]?.equipe;
      if (equipe) votants[equipe] = (votants[equipe] ?? 0) + 1;
    }
    return votants;
  }

  private votablesPour(equipe: Couleur): Case[] {
    const pions = pionsEnJeu(this.e.scenario, this.e.pions);
    const pion = pions.find((p) => p.couleur === equipe);
    return pion ? casesVotables(pion, pions, optionsVote(this.e.scenario)) : [];
  }

  private voter(connexion: Connection<EtatConnexion>, id: string, manche: unknown, c: unknown): void {
    const e = this.e;
    const equipe = e.joueurs[id]?.equipe;
    if (e.phase !== 'vote' || manche !== e.manche || !equipe || !estCase(c) || !this.votablesPour(equipe).includes(c)) {
      // Le téléphone est en retard ou la case n'est plus disponible : on le remet à jour.
      this.envoyerMoi(connexion, id);
      return;
    }
    if (e.votes[id] === c) return;
    e.votes[id] = c;
    this.equipesModifiees.add(equipe);
    this.diffuserTendancesBientot();
    this.sauverBientot();
  }

  /** Mode répétition : les joueurs simulés votent chacun à leur moment. */
  private faireVoterLesSimules(maintenant: number): void {
    const e = this.e;
    const dureeVote = Math.max(2000, e.dureePhase);
    const options = optionsVote(e.scenario);
    const pions = pionsEnJeu(e.scenario, e.pions);
    const urnes = this.urnes();
    for (const [id, joueur] of Object.entries(e.joueurs)) {
      if (!joueur.simule || !joueur.equipe || e.votes[id]) continue;
      const moment = e.debutVote + (0.08 + 0.8 * hachage01(`${id}:${e.manche}:${e.session}`)) * dureeVote;
      if (maintenant < moment) continue;
      const pion = pions.find((p) => p.couleur === joueur.equipe);
      if (!pion || pion.verrouille) continue;
      const votables = casesVotables(pion, pions, options);
      const urne = (urnes[joueur.equipe] ??= {});
      const meneuse = depouiller(urne, new Set(votables), Math.random).choix;
      const vote = voteSimule(
        { votables, silhouette: options.silhouette, cible: pion.cible, echecs: e.pions[pion.couleur]?.echecs ?? 0, meneuse },
        Math.random,
      );
      if (!vote) continue;
      e.votes[id] = vote;
      urne[vote] = (urne[vote] ?? 0) + 1;
      this.equipesModifiees.add(joueur.equipe);
    }
    if (this.equipesModifiees.size > 0) {
      this.diffuserTendancesBientot();
      this.sauverBientot();
    }
  }

  private simulesEnAttente(): boolean {
    if (this.e.phase !== 'vote') return false;
    for (const [id, joueur] of Object.entries(this.e.joueurs)) {
      if (joueur.simule && joueur.equipe && !this.e.votes[id] && !this.e.pions[joueur.equipe]?.verrouille) return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Régie
  // -------------------------------------------------------------------------

  private async authentifier(connexion: Connection<EtatConnexion>, message: Record<string, unknown>): Promise<void> {
    const etat = connexion.state;
    if (!etat) return;
    if (typeof message.jeton === 'string') {
      if (this.e.jetons.includes(message.jeton)) this.ouvrirRegie(connexion, message.jeton);
      else this.envoyer(connexion, { t: 'auth', ok: false, aDefinir: !this.env.REGIE_PIN && !this.e.pin });
      return;
    }
    const pin = typeof message.pin === 'string' ? message.pin : '';
    const maintenant = Date.now();
    if (maintenant - this.echecsPin.depuis > 60_000) this.echecsPin = { n: 0, depuis: maintenant };
    if (this.echecsPin.n >= 8) {
      this.envoyer(connexion, { t: 'auth', ok: false, raison: 'Trop d’essais. Réessayez dans une minute.' });
      return;
    }
    let correct = false;
    if (this.env.REGIE_PIN) correct = egal(pin, this.env.REGIE_PIN);
    else if (this.e.pin) correct = egal(await hacher(this.e.pin.sel, pin), this.e.pin.hache);
    else {
      this.envoyer(connexion, { t: 'auth', ok: false, aDefinir: true });
      return;
    }
    if (!correct) {
      this.echecsPin.n++;
      this.envoyer(connexion, { t: 'auth', ok: false, raison: 'Code incorrect.' });
      return;
    }
    this.ouvrirRegie(connexion, this.nouveauJeton());
  }

  private async definirPin(connexion: Connection<EtatConnexion>, pin: unknown): Promise<void> {
    if (this.env.REGIE_PIN || this.e.pin) {
      this.envoyer(connexion, { t: 'auth', ok: false, raison: 'Un code régie existe déjà.' });
      return;
    }
    if (typeof pin !== 'string' || pin.length < PIN_MIN || pin.length > PIN_MAX) {
      this.envoyer(connexion, { t: 'auth', ok: false, aDefinir: true, raison: `Le code doit faire entre ${PIN_MIN} et ${PIN_MAX} caractères.` });
      return;
    }
    const sel = jetonAleatoire();
    this.e.pin = { sel, hache: await hacher(sel, pin) };
    this.ouvrirRegie(connexion, this.nouveauJeton());
  }

  private nouveauJeton(): string {
    const jeton = jetonAleatoire();
    this.e.jetons.push(jeton);
    if (this.e.jetons.length > 20) this.e.jetons.splice(0, this.e.jetons.length - 20);
    this.sauver();
    return jeton;
  }

  private ouvrirRegie(connexion: Connection<EtatConnexion>, jeton: string): void {
    const etat = connexion.state;
    if (!etat) return;
    connexion.setState({ role: etat.role, id: etat.id, auth: true });
    this.envoyer(connexion, { t: 'auth', ok: true, jeton });
    this.envoyer(connexion, { t: 'regie', r: this.etatRegie() });
  }

  private info(connexion: Connection, texte: string, erreur = false): void {
    this.envoyer(connexion, { t: 'info', texte, erreur });
  }

  /** Exécute une commande de la régie. Chaque paramètre est contrôlé. */
  private async executer(connexion: Connection<EtatConnexion>, action: ActionRegie): Promise<void> {
    if (!action || typeof action !== 'object') return;
    const e = this.e;
    const pionDe = (couleur: unknown) => (estCouleur(couleur) ? e.scenario.pions.find((p) => p.couleur === couleur) : undefined);

    switch (action.a) {
      case 'lancer':
        if (e.phase !== 'accueil') return this.info(connexion, 'La partie est déjà lancée.', true);
        this.lancer();
        break;
      case 'pause':
        this.mettreEnPause();
        break;
      case 'reprendre':
        this.reprendre();
        break;
      case 'suivant':
        if (!this.enJeu()) return;
        if (e.pause !== null) this.reprendre();
        this.avancer();
        break;
      case 'prolonger':
        this.prolonger(Number(action.secondes));
        break;
      case 'terminer': {
        if (!this.enJeu()) return;
        for (const couleur of equipesEnJeu(e.scenario, e.pions)) e.pions[couleur]!.reveler = true;
        if (e.pause !== null) this.reprendre();
        if (e.phase === 'vote') this.avancer();
        break;
      }
      case 'reveler': {
        const etat = pionDe(action.couleur) && e.pions[action.couleur];
        if (!etat || etat.verrouille || !this.enJeu()) return;
        etat.reveler = action.actif !== false;
        break;
      }
      case 'indice': {
        const pion = pionDe(action.couleur);
        const etat = pion && e.pions[pion.couleur];
        if (!pion || !etat || etat.verrouille) return;
        if (etat.indices >= pion.indices.length) return this.info(connexion, 'Tous les indices de cette équipe sont déjà révélés.');
        etat.indices += 1;
        break;
      }
      case 'deplacer': {
        const pion = pionDe(action.couleur);
        const etat = pion && e.pions[pion.couleur];
        if (!pion || !etat || pion.absent || !estCase(action.case) || !this.enJeu()) return;
        if (etat.verrouille) return this.info(connexion, 'Ce pion est verrouillé : déverrouillez-le d’abord.', true);
        if (etat.position === action.case) return;
        const occupant = e.scenario.pions.find((p) => e.pions[p.couleur]?.position === action.case);
        if (occupant) {
          const etatOccupant = e.pions[occupant.couleur]!;
          if (etatOccupant.verrouille || occupant.absent) return this.info(connexion, 'Cette case est occupée par un pion verrouillé.', true);
          this.placer(occupant.couleur, etat.position);
        }
        this.placer(pion.couleur, action.case);
        if (e.phase === 'vote' && tousPlaces(e.scenario, e.pions)) this.finir();
        break;
      }
      case 'deverrouiller': {
        const pion = pionDe(action.couleur);
        const etat = pion && e.pions[pion.couleur];
        if (!pion || !etat || pion.absent || !etat.verrouille || !this.enJeu()) return;
        etat.verrouille = false;
        break;
      }
      case 'choisir': {
        const etat = pionDe(action.couleur) && e.pions[action.couleur];
        if (!etat || etat.verrouille || e.phase !== 'vote') return;
        if (action.case === null) {
          etat.choixRegie = null;
        } else {
          if (!estCase(action.case)) return;
          if (casesVerrouillees(pionsEnJeu(e.scenario, e.pions)).has(action.case)) {
            return this.info(connexion, 'Cette case est verrouillée.', true);
          }
          etat.choixRegie = action.case;
        }
        break;
      }
      case 'absent': {
        const pion = pionDe(action.couleur);
        if (!pion) return;
        if (e.phase !== 'accueil') return this.info(connexion, 'Les absences se règlent avant de lancer la partie.', true);
        const essai = copier(e.scenario);
        essai.pions.find((p) => p.couleur === pion.couleur)!.absent = action.absent === true;
        if (!this.remplacerScenario(connexion, essai)) return;
        break;
      }
      case 'reglages':
        this.regler(action.reglages);
        break;
      case 'scenario':
        if (e.phase !== 'accueil') return this.info(connexion, 'Revenez à l’accueil (Réinitialiser) pour changer le scénario.', true);
        if (!this.remplacerScenario(connexion, action.scenario)) return;
        this.info(connexion, 'Scénario enregistré.');
        break;
      case 'scenarioDefaut':
        if (e.phase !== 'accueil') return this.info(connexion, 'Revenez à l’accueil (Réinitialiser) pour changer le scénario.', true);
        this.remplacerScenario(connexion, copier(SCENARIO_DEFAUT));
        this.info(connexion, 'Scénario du concert rétabli.');
        break;
      case 'simules':
        this.reglerSimules(Number(action.nombre));
        break;
      case 'reequilibrer':
        if (e.phase !== 'accueil') return this.info(connexion, 'Les équipes ne peuvent être refaites qu’avant le lancement.', true);
        this.reequilibrer();
        break;
      case 'reinitialiser':
        this.reinitialiser(action.joueurs === true);
        break;
      case 'changerPin': {
        if (this.env.REGIE_PIN) return this.info(connexion, 'Le code est défini dans la configuration du serveur.', true);
        if (typeof action.pin !== 'string' || action.pin.length < PIN_MIN || action.pin.length > PIN_MAX) {
          return this.info(connexion, `Le code doit faire entre ${PIN_MIN} et ${PIN_MAX} caractères.`, true);
        }
        const sel = jetonAleatoire();
        e.pin = { sel, hache: await hacher(sel, action.pin) };
        e.jetons = [];
        this.envoyer(connexion, { t: 'auth', ok: true, jeton: this.nouveauJeton() });
        this.info(connexion, 'Code régie modifié.');
        break;
      }
      default:
        return;
    }
    this.diffuser();
    this.sauver();
    await this.programmerReveil();
  }

  /** Déplacement manuel d'un pion (correction en direct). */
  private placer(couleur: Couleur, c: Case): void {
    const e = this.e;
    const etat = e.pions[couleur];
    const pion = e.scenario.pions.find((p) => p.couleur === couleur);
    if (!etat || !pion) return;
    etat.position = c;
    etat.verrouille = c === pion.cible;
    etat.reveler = false;
    etat.choixRegie = null;
    if (!etat.verrouille && !etat.essais.includes(c)) etat.essais = [...etat.essais, c].sort();
    // Les flèches de la manche ne sont plus valables pour ce pion.
    if (e.mouvements) e.mouvements = e.mouvements.filter((m) => m.couleur !== couleur);
    let votesEffaces = false;
    for (const [id, joueur] of Object.entries(e.joueurs)) {
      if (joueur.equipe === couleur && e.votes[id]) {
        delete e.votes[id];
        votesEffaces = true;
      }
    }
    if (votesEffaces) {
      this.rappelerLesJoueurs();
      this.equipesModifiees.add(couleur);
      this.diffuserTendancesBientot();
    }
  }

  private regler(reglages: Reglages): void {
    if (!reglages || typeof reglages !== 'object') return;
    const s = this.e.scenario;
    if (reglages.durees) s.durees = nettoyerDurees({ ...s.durees, ...reglages.durees }, s.durees);
    if (reglages.options) s.options = nettoyerOptions({ ...s.options, ...reglages.options }, s.options);
    if (typeof reglages.dureeCible === 'number' && Number.isFinite(reglages.dureeCible)) {
      s.dureeCible = Math.min(LIMITES.dureeCibleMax, Math.max(0, Math.round(reglages.dureeCible)));
    }
    if (typeof reglages.avanceAuto === 'boolean') {
      this.e.avanceAuto = reglages.avanceAuto;
      // On repasse en automatique alors que le chrono est écoulé : on enchaîne.
      if (reglages.avanceAuto && this.e.attenteRegie) {
        this.e.attenteRegie = false;
        this.e.finPhase = Date.now();
      }
    }
  }

  private remplacerScenario(connexion: Connection, brut: unknown): boolean {
    const resultat = validerScenario(brut);
    if (!resultat.ok) {
      this.info(connexion, resultat.erreurs.join(' '), true);
      return false;
    }
    this.e.scenario = resultat.scenario;
    this.e.pions = etatsInitiaux(resultat.scenario);
    this.e.mouvements = null;
    this.e.votes = {};
    this.recaserLesOrphelins();
    return true;
  }

  private reinitialiser(joueursAussi: boolean): void {
    const e = this.e;
    e.phase = 'accueil';
    e.manche = 0;
    e.finPhase = null;
    e.dureePhase = 0;
    e.pause = null;
    e.attenteRegie = false;
    e.chrono = { cumul: 0, depuis: null };
    e.pions = etatsInitiaux(e.scenario);
    e.mouvements = null;
    e.journal = [];
    e.votes = {};
    if (joueursAussi) {
      e.session += 1;
      e.joueurs = {};
      // Les téléphones encore connectés sont réinscrits tout de suite.
      for (const id of this.connectes()) this.inscrire(id);
    } else {
      this.recaserLesOrphelins();
    }
    this.rappelerLesJoueurs();
  }

  // -------------------------------------------------------------------------
  // Diffusion
  // -------------------------------------------------------------------------

  private tempsJeu(): number {
    const { cumul, depuis } = this.e.chrono;
    return cumul + (depuis === null ? 0 : Date.now() - depuis);
  }

  private etatPublic(): EtatPublic {
    const e = this.e;
    const equipes = this.presentsParEquipe();
    let joueurs = 0;
    for (const n of Object.values(equipes)) joueurs += n ?? 0;
    const avantLeJeu = e.phase === 'accueil';
    const lexique = new Set<string>();
    for (const p of e.scenario.pions) for (const c of p.contraintes) lexique.add(c.type);
    return {
      session: e.session,
      titre: e.scenario.titre,
      sousTitre: e.scenario.sousTitre,
      phase: e.phase,
      manche: e.manche,
      finPhase: e.finPhase,
      dureePhase: e.dureePhase,
      pause: e.pause,
      attenteRegie: e.attenteRegie,
      pions: e.scenario.pions.map((p) => {
        const etat = e.pions[p.couleur];
        return {
          couleur: p.couleur,
          position: etat?.position ?? p.depart,
          verrouille: etat?.verrouille ?? false,
          absent: p.absent,
          essais: etat?.essais ?? [],
          echecs: etat?.echecs ?? 0,
          // Les énigmes ne sont dévoilées qu'au lancement.
          enigme: avantLeJeu ? '' : p.enigme,
          indices: avantLeJeu ? [] : p.indices.slice(0, etat?.indices ?? 0),
        };
      }),
      silhouette: e.scenario.options.afficherSilhouette ? silhouetteDe(e.scenario) : null,
      mouvements: e.phase === 'affichage' || e.phase === 'deplacement' || e.phase === 'final' ? e.mouvements : null,
      equipes,
      joueurs,
      options: {
        enigmesPubliques: e.scenario.options.enigmesPubliques,
        voteLibre: e.scenario.options.voteLibre,
        renfort: e.scenario.options.renfort,
      },
      lexique: [...lexique],
      tempsJeu: this.tempsJeu(),
    };
  }

  private etatRegie(): EtatRegie {
    const e = this.e;
    const connectes = this.connectes();
    const votants = this.votantsParEquipe();
    const equipes: Partial<Record<Couleur, StatsEquipe>> = {};
    for (const couleur of COULEURS) {
      if (e.scenario.pions.some((p) => p.couleur === couleur)) {
        equipes[couleur] = { inscrits: 0, connectes: 0, simules: 0, votants: votants[couleur] ?? 0 };
      }
    }
    let inscrits = 0;
    let simules = 0;
    for (const [id, joueur] of Object.entries(e.joueurs)) {
      if (joueur.simule) simules++;
      else inscrits++;
      const stats = joueur.equipe ? equipes[joueur.equipe] : undefined;
      if (!stats) continue;
      if (joueur.simule) stats.simules++;
      else {
        stats.inscrits++;
        if (connectes.has(id)) stats.connectes++;
      }
    }
    return {
      scenario: e.scenario,
      pions: e.pions,
      votes: this.urnes(),
      equipes,
      inscrits,
      simules,
      avanceAuto: e.avanceAuto,
      journal: e.journal,
      pinImpose: !!this.env.REGIE_PIN,
    };
  }

  private envoyer(connexion: Connection, message: MessageServeur): void {
    this.envoyerTexte(connexion, JSON.stringify(message));
  }

  private envoyerTexte(connexion: Connection, texte: string): void {
    try {
      connexion.send(texte);
    } catch {
      // La connexion vient de se fermer : rien à faire.
    }
  }

  private envoyerMoi(connexion: Connection, id: string): void {
    this.envoyer(connexion, {
      t: 'moi',
      equipe: this.e.joueurs[id]?.equipe ?? null,
      vote: this.e.votes[id] ?? null,
      manche: this.e.manche,
    });
  }

  /** Renvoie à chaque joueur son équipe et son vote (après un changement d'équipe ou de manche). */
  private rappelerLesJoueurs(): void {
    for (const connexion of this.getConnections<EtatConnexion>()) {
      if (connexion.state?.role === 'joueur') this.envoyerMoi(connexion, connexion.state.id);
    }
  }

  /** Envoie l'état à tous les écrans, et la vue complète aux régies. */
  private diffuser(): void {
    if (this.minuterieDiffusion) {
      clearTimeout(this.minuterieDiffusion);
      this.minuterieDiffusion = null;
    }
    this.broadcast(JSON.stringify({ t: 'etat', ts: Date.now(), e: this.etatPublic() } satisfies MessageServeur));
    this.diffuserAuxRegies();
  }

  private diffuserAuxRegies(): void {
    let message: string | null = null;
    for (const connexion of this.getConnections<EtatConnexion>()) {
      if (connexion.state?.role !== 'regie' || !connexion.state.auth) continue;
      message ??= JSON.stringify({ t: 'regie', r: this.etatRegie() } satisfies MessageServeur);
      this.envoyerTexte(connexion, message);
    }
  }

  /** Lance une tâche un peu plus tard, sans qu'une erreur puisse faire tomber le salon. */
  private plusTard(delai: number, tache: () => void): ReturnType<typeof setTimeout> {
    return setTimeout(() => {
      try {
        tache();
      } catch (erreur) {
        console.error('Tutti : erreur dans une tâche différée', erreur);
      }
    }, delai);
  }

  private diffuserBientot(): void {
    this.minuterieDiffusion ??= this.plusTard(300, () => {
      this.minuterieDiffusion = null;
      this.diffuser();
    });
  }

  /** Votes en direct : à chaque équipe ses votes, à tous le nombre de votants. */
  private diffuserTendancesBientot(): void {
    this.minuterieTendances ??= this.plusTard(400, () => {
      this.minuterieTendances = null;
      const e = this.e;
      if (e.phase !== 'vote') {
        this.equipesModifiees.clear();
        return;
      }
      const urnes = this.urnes();
      const parEquipe = new Map<Couleur, string>();
      for (const equipe of this.equipesModifiees) {
        parEquipe.set(equipe, JSON.stringify({ t: 'tendance', manche: e.manche, equipe, votes: urnes[equipe] ?? {} } satisfies MessageServeur));
      }
      this.equipesModifiees.clear();
      for (const connexion of this.getConnections<EtatConnexion>()) {
        if (connexion.state?.role !== 'joueur') continue;
        const equipe = e.joueurs[connexion.state.id]?.equipe;
        const message = equipe ? parEquipe.get(equipe) : undefined;
        if (message) this.envoyerTexte(connexion, message);
      }
      this.broadcast(JSON.stringify({ t: 'votants', manche: e.manche, v: this.votantsParEquipe() } satisfies MessageServeur));
      this.diffuserAuxRegies();
    });
  }

  // -------------------------------------------------------------------------
  // Enregistrement et réveils
  // -------------------------------------------------------------------------

  private sauver(): void {
    if (this.minuterieSauvegarde) {
      clearTimeout(this.minuterieSauvegarde);
      this.minuterieSauvegarde = null;
    }
    this.ctx.storage.kv.put(CLE, this.e);
  }

  private sauverBientot(): void {
    this.minuterieSauvegarde ??= this.plusTard(800, () => {
      this.minuterieSauvegarde = null;
      this.sauver();
    });
  }

  /** Programme le prochain réveil : fin de la phase, ou prochain vote des joueurs simulés. */
  private async programmerReveil(): Promise<void> {
    const e = this.e;
    let reveil: number | null = null;
    if (e.pause === null && this.enJeu()) {
      if (e.finPhase !== null && !e.attenteRegie) reveil = e.finPhase;
      if (this.simulesEnAttente()) reveil = Math.min(reveil ?? Infinity, Date.now() + 500);
    }
    if (reveil === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(Math.max(reveil, Date.now() + 5));
  }

  private debitAutorise(idConnexion: string): boolean {
    const maintenant = Date.now();
    const compteur = this.debit.get(idConnexion);
    if (!compteur || maintenant - compteur.depuis > 3000) {
      this.debit.set(idConnexion, { n: 1, depuis: maintenant });
      return true;
    }
    compteur.n++;
    return compteur.n <= 40;
  }
}
