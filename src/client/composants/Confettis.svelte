<script lang="ts">
  /** Pluie de confettis aux couleurs des équipes (final). */
  import { INFOS, type Couleur } from '../../shared/couleurs';

  interface Props {
    couleurs: readonly Couleur[];
    nombre?: number;
  }
  let { couleurs, nombre = 70 }: Props = $props();

  // Valeurs pseudo-aléatoires stables : pas de saut à chaque rafraîchissement.
  const graine = (i: number, k: number) => {
    const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  const confettis = $derived(
    Array.from({ length: nombre }, (_, i) => ({
      i,
      couleur: INFOS[couleurs[i % Math.max(1, couleurs.length)] ?? 'jaune'].hex,
      gauche: graine(i, 1) * 100,
      delai: graine(i, 2) * 6,
      duree: 5 + graine(i, 3) * 5,
      taille: 0.6 + graine(i, 4) * 0.9,
      derive: (graine(i, 5) - 0.5) * 30,
      rond: graine(i, 6) > 0.6,
    })),
  );
</script>

<div class="confettis" aria-hidden="true">
  {#each confettis as c (c.i)}
    <i
      class:rond={c.rond}
      style:left="{c.gauche}%"
      style:background={c.couleur}
      style:animation-delay="-{c.delai}s"
      style:animation-duration="{c.duree}s"
      style:--taille="{c.taille}vmin"
      style:--derive="{c.derive}vw"
    ></i>
  {/each}
</div>

<style>
  .confettis {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }
  i {
    position: absolute;
    top: -4vmin;
    width: var(--taille);
    height: calc(var(--taille) * 1.7);
    border-radius: 2px;
    opacity: 0.9;
    animation: chute linear infinite;
  }
  i.rond {
    height: var(--taille);
    border-radius: 50%;
  }
  @keyframes chute {
    from {
      transform: translate3d(0, -6vh, 0) rotate(0deg);
    }
    to {
      transform: translate3d(var(--derive), 110vh, 0) rotate(900deg);
    }
  }
</style>
