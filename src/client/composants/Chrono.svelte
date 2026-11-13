<script lang="ts">
  /** Compte à rebours circulaire. */
  interface Props {
    /** Millisecondes restantes (null : pas de chrono). */
    reste: number | null;
    /** Durée totale de la phase, en millisecondes. */
    duree: number;
    pause?: boolean;
    /** Le chrono est écoulé et la régie doit lancer la suite. */
    attente?: boolean;
    couleur?: string;
  }
  let { reste, duree, pause = false, attente = false, couleur = '#fff' }: Props = $props();

  const secondes = $derived(reste === null ? null : Math.ceil(reste / 1000));
  const part = $derived(reste === null || duree <= 0 ? 0 : Math.min(1, Math.max(0, reste / duree)));
  const urgent = $derived(secondes !== null && secondes <= 5 && !pause && !attente);
  const PERIMETRE = 2 * Math.PI * 44;
</script>

<div class="chrono" class:urgent class:pause style:--couleur={couleur} role="timer" aria-label={secondes === null ? 'Pas de chrono' : `${secondes} secondes`}>
  <svg viewBox="0 0 100 100" aria-hidden="true">
    <circle class="piste" cx="50" cy="50" r="44" />
    <circle class="arc" cx="50" cy="50" r="44" stroke-dasharray={PERIMETRE} stroke-dashoffset={PERIMETRE * (1 - part)} />
  </svg>
  <span class="valeur">
    {#if pause}
      <svg class="icone" viewBox="0 0 24 24" aria-label="Pause"><path d="M6 4h4.500v16H6zM13.500 4H18v16h-4.500z" fill="currentColor" /></svg>
    {:else if attente || secondes === null}
      …
    {:else}
      {secondes}
    {/if}
  </span>
</div>

<style>
  .chrono {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    container-type: inline-size;
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  circle {
    fill: none;
    stroke-width: 9;
  }
  .piste {
    stroke: rgba(255, 255, 255, 0.12);
  }
  .arc {
    stroke: var(--couleur);
    stroke-linecap: round;
    transform: rotate(-90deg);
    transform-origin: 50% 50%;
    transition:
      stroke-dashoffset 0.12s linear,
      stroke 0.3s;
  }
  .valeur {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-family: var(--titre);
    font-weight: 800;
    font-size: 44cqw;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .icone {
    width: 42%;
    height: 42%;
  }
  .urgent .arc {
    stroke: var(--danger);
  }
  .urgent .valeur {
    color: var(--danger);
    animation: battement 1s ease-in-out infinite;
  }
  .pause .arc {
    stroke: var(--texte-3);
  }
  @keyframes battement {
    0%,
    100% {
      transform: scale(1);
    }
    12% {
      transform: scale(1.16);
    }
  }
</style>
