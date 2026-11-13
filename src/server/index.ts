/**
 * Point d'entrée du serveur (Cloudflare Worker).
 * Les pages et fichiers statiques sont servis directement par Cloudflare ;
 * seul le temps réel (/parties/…) arrive ici et est transmis au salon de jeu.
 */

import { routePartykitRequest } from 'partyserver';
import { SALON, connexionValide } from '../shared/protocole';
import type { Env } from './GameRoom';

export { GameRoom } from './GameRoom';

export default {
  async fetch(requete: Request, env: Env): Promise<Response> {
    const reponse = await routePartykitRequest(requete, env, {
      onBeforeConnect: (demande, salon) => {
        // Un seul salon existe : on refuse d'en créer d'autres.
        if (salon.name !== SALON) return new Response('Salon inconnu', { status: 404 });
        // Une connexion doit annoncer son rôle et son identifiant.
        const parametres = new URL(demande.url).searchParams;
        if (!connexionValide(parametres.get('role'), parametres.get('id'))) {
          return new Response('Connexion invalide', { status: 400 });
        }
        return undefined;
      },
      onBeforeRequest: () => new Response('Introuvable', { status: 404 }),
    });
    return reponse ?? env.ASSETS.fetch(requete);
  },
} satisfies ExportedHandler<Env>;
