import { cloudflare } from '@cloudflare/vite-plugin';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// En local, l'outil Cloudflare expose par défaut une interface de diagnostic qui
// permet de lire les données du serveur. En mode de secours (« npm run local »),
// les téléphones du public sont sur le même réseau : on la désactive, sinon
// n'importe qui pourrait y lire les cases à trouver.
process.env.X_LOCAL_EXPLORER ??= 'false';
process.env.X_LOCAL_OBSERVABILITY ??= 'false';

// TUTTI_SANS_MEMOIRE=1 : le serveur local repart de zéro à chaque démarrage (tests).
const sansMemoire = process.env.TUTTI_SANS_MEMOIRE === '1';

export default defineConfig({
  // inspectorPort: false — pas de port de débogage ouvert sur le réseau, pour la même raison.
  plugins: [svelte(), cloudflare({ persistState: !sansMemoire, inspectorPort: false })],
  environments: {
    client: {
      build: {
        // Le public vient avec son téléphone, parfois ancien : on vise large (iOS 14, Android de 2020),
        // et on garde dans les styles les solutions de repli écrites pour ces appareils.
        target: ['es2020', 'chrome87', 'safari14', 'firefox78'],
        cssTarget: ['chrome87', 'safari14', 'firefox78'],
      },
    },
  },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
});
