<script lang="ts">
  import { INFOS, type Couleur } from '../../shared/couleurs';
  import Symbole from './Symbole.svelte';

  interface Props {
    couleur: Couleur;
    /** Pion en place : grisé, avec un liseré de sa couleur. */
    verrouille?: boolean;
    /** Musicien absent : pion fantôme. */
    absent?: boolean;
    /** Le pion de mon équipe. */
    amoi?: boolean;
  }
  let { couleur, verrouille = false, absent = false, amoi = false }: Props = $props();
  const info = $derived(INFOS[couleur]);
</script>

<span class="jeton" class:verrouille class:absent class:amoi style:--couleur={info.hex} style:--sombre={info.sombre}>
  <span class="disque">
    <span class="forme"><Symbole {couleur} encre={verrouille || absent ? info.hex : '#101018'} /></span>
  </span>
  {#if verrouille && !absent}
    <span class="cadenas" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M7 10V7.5a5 5 0 0 1 10 0V10h1.2c.7 0 1.3.6 1.3 1.3v8.4c0 .7-.6 1.3-1.3 1.3H5.800c-.7 0-1.3-.6-1.3-1.300v-8.400c0-.7.6-1.3 1.300-1.300Zm2.400 0h5.200V7.500a2.600 2.600 0 0 0-5.200 0Z" fill="currentColor" /></svg>
    </span>
  {/if}
</span>

<style>
  .jeton {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 1;
  }
  .disque {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: radial-gradient(circle at 32% 26%, color-mix(in srgb, var(--couleur) 72%, #fff) 0%, var(--couleur) 46%, color-mix(in srgb, var(--couleur) 78%, #000) 100%);
    box-shadow:
      0 0 0 0.06em rgba(0, 0, 0, 0.35),
      0 0.12em 0.5em color-mix(in srgb, var(--couleur) 55%, transparent);
    transition:
      background 0.6s,
      box-shadow 0.6s;
  }
  .forme {
    width: 54%;
    height: 54%;
  }
  .amoi .disque {
    box-shadow:
      0 0 0 0.09em #fff,
      0 0 0.9em 0.18em color-mix(in srgb, var(--couleur) 80%, transparent);
  }
  .verrouille .disque {
    background: var(--verrou);
    box-shadow:
      inset 0 0 0 0.1em var(--couleur),
      0 0 0 0.05em rgba(0, 0, 0, 0.4);
  }
  .absent .disque {
    background: transparent;
    box-shadow: none;
    border: 0.08em dashed color-mix(in srgb, var(--couleur) 70%, transparent);
    opacity: 0.75;
  }
  .cadenas {
    position: absolute;
    right: -6%;
    bottom: -6%;
    width: 40%;
    height: 40%;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: #f5f5fa;
    color: #14141c;
    box-shadow: 0 0 0 0.08em var(--fond);
    animation: apparition 0.5s cubic-bezier(0.3, 1.6, 0.5, 1) both;
  }
  .cadenas svg {
    width: 68%;
    height: 68%;
  }
  @keyframes apparition {
    from {
      transform: scale(0);
    }
    to {
      transform: scale(1);
    }
  }
</style>
