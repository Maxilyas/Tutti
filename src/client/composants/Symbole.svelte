<script lang="ts" module>
  import type { Symbole } from '../../shared/couleurs';

  function etoile(): string {
    const points: string[] = [];
    for (let i = 0; i < 10; i++) {
      const rayon = i % 2 === 0 ? 10.4 : 4.5;
      const angle = (Math.PI / 5) * i - Math.PI / 2;
      points.push(`${(12 + rayon * Math.cos(angle)).toFixed(2)} ${(12.6 + rayon * Math.sin(angle)).toFixed(2)}`);
    }
    return `M${points.join('L')}Z`;
  }

  /** Formes dessinées dans un carré de 24 × 24. */
  const FORMES: Record<Symbole, string> = {
    carre: 'M6 3.5h12A2.5 2.5 0 0 1 20.5 6v12a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 18V6A2.5 2.5 0 0 1 6 3.5Z',
    triangle: 'M12 3.2 22 20.2H2Z',
    etoile: etoile(),
    rond: 'M12 2.8a9.2 9.2 0 1 0 0 18.4 9.2 9.2 0 0 0 0-18.4Z',
    losange: 'M12 1.8 22.2 12 12 22.2 1.8 12Z',
    croix: 'M8.8 2.5h6.4v6.3h6.3v6.4h-6.3v6.3H8.8v-6.3H2.5V8.8h6.3Z',
    coeur:
      'M12 21.4C6.2 17.2 2.4 13.6 2.4 9.1 2.4 6 4.8 3.6 7.8 3.6c1.7 0 3.2.8 4.2 2.2 1-1.4 2.5-2.2 4.2-2.2 3 0 5.4 2.4 5.4 5.5 0 4.5-3.8 8.1-9.6 12.3Z',
  };
</script>

<script lang="ts">
  import { INFOS, type Couleur } from '../../shared/couleurs';

  interface Props {
    couleur: Couleur;
    /** Couleur de remplissage (par défaut : la couleur de l'équipe). */
    encre?: string;
  }
  let { couleur, encre }: Props = $props();
</script>

<svg viewBox="0 0 24 24" aria-hidden="true" class="symbole">
  <path d={FORMES[INFOS[couleur].symbole]} fill={encre ?? INFOS[couleur].hex} stroke-linejoin="round" />
</svg>

<style>
  .symbole {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
