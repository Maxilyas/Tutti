<script lang="ts">
  /**
   * Trois écrans, une seule application :
   *   /        le public, sur smartphone
   *   /ecran   le grand écran (vidéoprojecteur ou panneaux LED)
   *   /regie   le pilotage
   * Les écrans « ecran » et « regie » ne sont chargés que si on les demande :
   * les téléphones téléchargent le strict nécessaire.
   */
  import Joueur from './vues/Joueur.svelte';

  const chemin = location.pathname.replace(/\/+$/, '');
  const vue = chemin === '/ecran' ? import('./vues/Ecran.svelte') : chemin === '/regie' ? import('./vues/Regie.svelte') : null;
</script>

{#if vue}
  {#await vue then module}
    <module.default />
  {/await}
{:else}
  <Joueur />
{/if}
