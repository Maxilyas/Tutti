/**
 * Petit client temps réel pour les scripts de test (Node 22+, sans dépendance).
 * Il parle exactement le même protocole que les écrans de l'application.
 */

export function idAleatoire(prefixe = 'test') {
  return `${prefixe}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export class Client {
  constructor(base, role, id = idAleatoire(role)) {
    this.role = role;
    this.id = id;
    this.etat = null;
    this.moi = null;
    this.regie = null;
    this.auth = null;
    this.tendance = null;
    this.infos = [];
    this.recus = 0;
    this.octets = 0;
    this.bruts = [];
    this.ecouteurs = new Set();
    const url = new URL(`/parties/game-room/tutti`, base);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('role', role);
    url.searchParams.set('id', id);
    this.ws = new WebSocket(url);
    this.ouvert = new Promise((resoudre, rejeter) => {
      this.ws.addEventListener('open', () => resoudre(this), { once: true });
      this.ws.addEventListener('error', (e) => rejeter(new Error(`Connexion impossible : ${e.message ?? url}`)), { once: true });
    });
    this.ws.addEventListener('message', (evenement) => {
      this.recus++;
      this.octets += evenement.data.length;
      if (this.bruts.length < 5000) this.bruts.push(evenement.data);
      const m = JSON.parse(evenement.data);
      if (m.t === 'etat') this.etat = m.e;
      else if (m.t === 'moi') this.moi = m;
      else if (m.t === 'regie') this.regie = m.r;
      else if (m.t === 'auth') this.auth = m;
      else if (m.t === 'tendance') this.tendance = m;
      else if (m.t === 'info') this.infos.push(m);
      for (const ecouteur of this.ecouteurs) ecouteur(m);
    });
  }

  envoyer(message) {
    this.ws.send(JSON.stringify(message));
  }

  /** Envoie un texte tel quel (pour tester les messages illisibles). */
  brut(texte) {
    this.ws.send(texte);
  }

  action(action) {
    this.envoyer({ t: 'regie', action });
  }

  voter(c) {
    this.envoyer({ t: 'vote', manche: this.etat.manche, case: c });
  }

  /** Attend qu'une condition devienne vraie (vérifiée à chaque message reçu). */
  attendre(condition, delai = 10_000, quoi = 'condition') {
    return new Promise((resoudre, rejeter) => {
      if (condition(this)) return resoudre(this);
      const minuterie = setTimeout(() => {
        this.ecouteurs.delete(ecouteur);
        rejeter(new Error(`Délai dépassé en attendant : ${quoi}`));
      }, delai);
      const ecouteur = () => {
        if (!condition(this)) return;
        clearTimeout(minuterie);
        this.ecouteurs.delete(ecouteur);
        resoudre(this);
      };
      this.ecouteurs.add(ecouteur);
    });
  }

  fermer() {
    this.ws.close();
  }
}

/** Ouvre la régie : définit le code s'il n'existe pas encore, sinon s'authentifie. */
export async function ouvrirRegie(base, pin) {
  const regie = new Client(base, 'regie');
  await regie.ouvert;
  await regie.attendre((c) => c.auth !== null, 5000, 'réponse de la régie');
  regie.envoyer(regie.auth.aDefinir ? { t: 'definirPin', pin } : { t: 'auth', pin });
  await regie.attendre((c) => c.auth?.ok === true || !!c.auth?.raison, 5000, 'authentification');
  if (!regie.auth.ok) throw new Error(`Régie refusée : ${regie.auth.raison}`);
  await regie.attendre((c) => c.regie !== null, 5000, 'état de la régie');
  return regie;
}

export const pause = (ms) => new Promise((resoudre) => setTimeout(resoudre, ms));
