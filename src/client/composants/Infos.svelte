<script lang="ts">
  import type { Info } from '../lib/connexion.svelte';

  interface Props {
    infos: Info[];
  }
  let { infos }: Props = $props();
</script>

<div class="infos" aria-live="polite">
  {#each infos as info (info.id)}
    <div class="info" class:erreur={info.erreur}>{info.texte}</div>
  {/each}
</div>

<style>
  .infos {
    position: fixed;
    left: 50%;
    bottom: max(16px, env(safe-area-inset-bottom));
    translate: -50% 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: min(92vw, 520px);
    z-index: 50;
    pointer-events: none;
  }
  .info {
    padding: 12px 16px;
    border-radius: 12px;
    background: var(--surface-3);
    border: 1px solid var(--trait-fort);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
    animation: entree 0.25s ease-out both;
  }
  .info.erreur {
    background: #4a1620;
    border-color: var(--danger);
  }
  @keyframes entree {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
  }
</style>
