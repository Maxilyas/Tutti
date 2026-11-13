<script lang="ts">
  /**
   * La grille 5×5, commune aux trois écrans.
   * Lettre = colonne (boucle), chiffre = rangée (registre : 1 aigu, 5 grave).
   */
  import { INFOS, type Couleur } from '../../shared/couleurs';
  import { CHIFFRES, LETTRES, TOUTES_LES_CASES, coord, type Case } from '../../shared/grille';
  import type { Mouvement, Phase, PionPublic } from '../../shared/types';
  import Jeton from './Jeton.svelte';

  interface Props {
    pions: readonly PionPublic[];
    silhouette: readonly Case[] | null;
    phase: Phase;
    mouvements?: readonly Mouvement[] | null;
    /** Mon équipe : son pion est mis en avant. */
    equipe?: Couleur | null;
    /** Ma case votée. */
    vote?: Case | null;
    /** Votes de mon équipe : case → nombre de voix. */
    tendance?: Readonly<Record<Case, number>> | null;
    /** Cases sur lesquelles on peut cliquer. */
    votables?: ReadonlySet<Case> | null;
    /** Cases déjà essayées (✕). */
    essais?: readonly Case[];
    /** Régie : cases à trouver. */
    cibles?: Partial<Record<Couleur, Case>> | null;
    /** Régie : pion sélectionné. */
    selection?: Couleur | null;
    /** Régie : cases imposées pour la manche. */
    choixRegie?: Partial<Record<Couleur, Case | null>> | null;
    surCase?: (c: Case) => void;
    surPion?: (c: Couleur) => void;
    /** Affiche « aigu » et « grave » le long des rangées. */
    legende?: boolean;
  }

  let {
    pions,
    silhouette,
    phase,
    mouvements = null,
    equipe = null,
    vote = null,
    tendance = null,
    votables = null,
    essais = [],
    cibles = null,
    selection = null,
    choixRegie = null,
    surCase,
    surPion,
    legende = false,
  }: Props = $props();

  // Géométrie : une case fait 18 % du plateau, l'écart 2,5 %.
  const PAS = 20.5;
  const DEMI = 9;

  const parCouleur = $derived(new Map((mouvements ?? []).map((m) => [m.couleur, m])));
  const montrerResultat = $derived(phase === 'affichage' || phase === 'deplacement');

  /** Pendant l'affichage du résultat, les musiciens n'ont pas encore bougé. */
  function caseAffichee(p: PionPublic): Case {
    if (phase === 'affichage') return parCouleur.get(p.couleur)?.de ?? p.position;
    return p.position;
  }

  function verrouVisible(p: PionPublic): boolean {
    if (!p.verrouille || phase === 'final') return false;
    return !(phase === 'affichage' && parCouleur.get(p.couleur)?.verrouille);
  }

  /** Au final, chaque case de la figure s'illumine dans la couleur de son pion. */
  const casesFinales = $derived(
    new Map(phase === 'final' ? pions.filter((p) => !p.absent).map((p) => [p.position, p.couleur]) : []),
  );

  const casesGrisees = $derived(new Set(pions.filter((p) => verrouVisible(p)).map((p) => p.position)));
  const casesSilhouette = $derived(new Set(silhouette ?? []));
  const casesEssayees = $derived(new Set(essais));
  const maxTendance = $derived(Math.max(1, ...Object.values(tendance ?? {})));

  /** Effet sur la case d'arrivée : juste (elle se grise) ou faux (elle clignote). */
  const effets = $derived.by(() => {
    const resultat = new Map<Case, { couleur: Couleur; juste: boolean }>();
    if (!montrerResultat) return resultat;
    for (const m of mouvements ?? []) {
      if (m.verrouille) resultat.set(m.vers, { couleur: m.couleur, juste: true });
      else if (m.vers !== m.de && !resultat.has(m.vers)) resultat.set(m.vers, { couleur: m.couleur, juste: false });
    }
    return resultat;
  });

  interface Fleche {
    couleur: Couleur;
    trace: string;
    pointe: string;
  }

  const fleches = $derived.by(() => {
    const resultat: Fleche[] = [];
    if (!montrerResultat) return resultat;
    for (const m of mouvements ?? []) {
      if (m.de === m.vers) continue;
      const a = coord(m.de);
      const b = coord(m.vers);
      const x1 = a.col * PAS + DEMI;
      const y1 = a.rang * PAS + DEMI;
      const x2 = b.col * PAS + DEMI;
      const y2 = b.rang * PAS + DEMI;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const longueur = Math.hypot(dx, dy);
      const ux = dx / longueur;
      const uy = dy / longueur;
      // Légère courbe : deux flèches opposées (échange) ne se superposent pas.
      const courbure = Math.min(7, longueur * 0.14);
      const cx = (x1 + x2) / 2 - uy * courbure;
      const cy = (y1 + y2) / 2 + ux * courbure;
      const debut = { x: x1 + ux * 8, y: y1 + uy * 8 };
      const fin = { x: x2 - ux * 5.5, y: y2 - uy * 5.5 };
      // Direction de la pointe : tangente à l'arrivée.
      const tx = fin.x - cx;
      const ty = fin.y - cy;
      const t = Math.hypot(tx, ty) || 1;
      const vx = tx / t;
      const vy = ty / t;
      const base = { x: fin.x - vx * 4.6, y: fin.y - vy * 4.6 };
      const f = (n: number) => n.toFixed(2);
      resultat.push({
        couleur: m.couleur,
        trace: `M${f(debut.x)} ${f(debut.y)} Q${f(cx)} ${f(cy)} ${f(base.x)} ${f(base.y)}`,
        pointe: `M${f(fin.x)} ${f(fin.y)} L${f(base.x - vy * 2.9)} ${f(base.y + vx * 2.9)} L${f(base.x + vy * 2.9)} ${f(base.y - vx * 2.9)}Z`,
      });
    }
    return resultat;
  });

  function etiquette(c: Case): string {
    const morceaux = [`Case ${c}`];
    const occupant = pions.find((p) => caseAffichee(p) === c);
    if (occupant) morceaux.push(`pion ${INFOS[occupant.couleur].nom}${occupant.verrouille ? ' en place' : ''}`);
    if (casesSilhouette.has(c)) morceaux.push('case de la figure');
    if (casesEssayees.has(c)) morceaux.push('déjà essayée');
    if (vote === c) morceaux.push('votre vote');
    return morceaux.join(', ');
  }
</script>

<div class="grille" class:legende>
  <div class="lettres" aria-hidden="true">
    {#each LETTRES as lettre (lettre)}<span>{lettre}</span>{/each}
  </div>
  <div class="chiffres" aria-hidden="true">
    {#each CHIFFRES as chiffre (chiffre)}<span>{chiffre}</span>{/each}
  </div>
  {#if legende}
    <div class="registres" aria-hidden="true"><span>aigu</span><i></i><span>grave</span></div>
  {/if}

  <div class="plateau">
    {#each TOUTES_LES_CASES as c (c)}
      {@const effet = effets.get(c)}
      {@const voix = tendance?.[c] ?? 0}
      {@const cliquable = !!surCase && (votables ? votables.has(c) : true)}
      {@const finale = casesFinales.get(c)}
      <button
        type="button"
        class="case"
        class:silhouette={casesSilhouette.has(c)}
        class:grisee={casesGrisees.has(c)}
        class:cliquable
        class:inactive={!!votables && !votables.has(c)}
        class:vote={vote === c}
        class:juste={effet?.juste === true}
        class:faux={effet?.juste === false}
        class:calme={phase === 'deplacement'}
        class:finale={!!finale}
        style:--effet={effet ? INFOS[effet.couleur].hex : finale ? INFOS[finale].hex : null}
        style:--equipe={equipe ? INFOS[equipe].hex : null}
        style:--part={voix / maxTendance}
        disabled={!cliquable}
        aria-label={etiquette(c)}
        aria-pressed={surCase ? vote === c : undefined}
        data-case={c}
        onclick={() => surCase?.(c)}
      >
        {#if voix > 0}<span class="voix" class:tete={voix === maxTendance}>{voix}</span>{/if}
        {#if casesEssayees.has(c) && !pions.some((p) => caseAffichee(p) === c)}<span class="croix" aria-hidden="true"></span>{/if}
        {#if cibles}
          {#each Object.entries(cibles) as [couleur, cible] (couleur)}
            {#if cible === c}<span class="cible" style:--c={INFOS[couleur as Couleur].hex} title="Case à trouver : {couleur}"></span>{/if}
          {/each}
        {/if}
        {#if choixRegie}
          {#each Object.entries(choixRegie) as [couleur, choix] (couleur)}
            {#if choix === c}<span class="choix-regie" style:--c={INFOS[couleur as Couleur].hex}>régie</span>{/if}
          {/each}
        {/if}
      </button>
    {/each}

    <svg class="fleches" class:calme={phase === 'deplacement'} viewBox="0 0 100 100" aria-hidden="true">
      {#each fleches as f (f.couleur)}
        <g style:--c={INFOS[f.couleur].hex}>
          <path class="fond" d={f.trace} />
          <path class="trace" d={f.trace} />
          <path class="pointe" d={f.pointe} />
        </g>
      {/each}
    </svg>

    {#each pions as p (p.couleur)}
      {@const pos = coord(caseAffichee(p))}
      {#if surPion}
        <button
          type="button"
          class="pion"
          class:amoi={p.couleur === equipe}
          class:selection={selection === p.couleur}
          style:--col={pos.col}
          style:--rang={pos.rang}
          style:--couleur={INFOS[p.couleur].hex}
          data-pion={p.couleur}
          aria-label="Pion {INFOS[p.couleur].nom}"
          onclick={() => surPion?.(p.couleur)}
        >
          <Jeton couleur={p.couleur} verrouille={verrouVisible(p)} absent={p.absent} amoi={selection === p.couleur} />
        </button>
      {:else}
        <div
          class="pion"
          class:amoi={p.couleur === equipe}
          style:--col={pos.col}
          style:--rang={pos.rang}
          style:--couleur={INFOS[p.couleur].hex}
          data-pion={p.couleur}
          data-case={caseAffichee(p)}
          data-verrouille={p.verrouille}
        >
          <Jeton couleur={p.couleur} verrouille={verrouVisible(p)} absent={p.absent} amoi={p.couleur === equipe} />
        </div>
      {/if}
    {/each}
  </div>
</div>

<style>
  .grille {
    container-type: inline-size;
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
    width: 100%;
    user-select: none;
    -webkit-user-select: none;
  }
  .lettres,
  .chiffres {
    display: grid;
    font-family: var(--titre);
    font-weight: 700;
    font-size: clamp(11px, 3.6cqw, 34px);
    line-height: 1;
    color: var(--texte-3);
    text-align: center;
  }
  .lettres {
    grid-row: 1;
    grid-column: 3;
    grid-template-columns: repeat(5, 18%);
    column-gap: 2.5%;
    padding-bottom: 1.6cqw;
  }
  .chiffres {
    grid-row: 2;
    grid-column: 2;
    grid-template-rows: repeat(5, 18%);
    row-gap: 2.5%;
    align-items: center;
    padding-right: 1.8cqw;
    min-width: 4.4cqw;
  }
  .registres {
    grid-row: 2;
    grid-column: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-right: 1.4cqw;
    font-size: clamp(8px, 2.1cqw, 19px);
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--texte-3);
    pointer-events: none;
  }
  .registres span {
    writing-mode: vertical-rl;
    rotate: 180deg;
  }
  .registres i {
    flex: 1;
    width: 2px;
    margin: 1.4cqw 0;
    background: linear-gradient(var(--trait-fort), var(--trait));
    border-radius: 2px;
  }

  .plateau {
    grid-row: 2;
    grid-column: 3;
    position: relative;
    aspect-ratio: 1;
    display: grid;
    grid-template: repeat(5, 18%) / repeat(5, 18%);
    gap: 2.5%;
  }

  .case {
    position: relative;
    padding: 0;
    border: 1px solid var(--trait);
    border-radius: 16%;
    background: rgba(255, 255, 255, 0.045);
    transition:
      background 0.35s,
      border-color 0.35s,
      opacity 0.35s,
      transform 0.12s;
  }
  .case:disabled {
    color: inherit;
  }
  .case.silhouette {
    border: clamp(1.5px, 0.55cqw, 5px) dashed rgba(255, 255, 255, 0.5);
    background: rgba(255, 255, 255, 0.1);
  }
  .case.grisee {
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: var(--verrou);
  }
  .case.inactive:not(.grisee) {
    opacity: 0.38;
  }
  .case.cliquable:active {
    transform: scale(0.93);
  }
  @media (hover: hover) {
    .case.cliquable:hover {
      border-color: var(--equipe, #fff);
      background: rgba(255, 255, 255, 0.16);
    }
  }

  /* Votes de l'équipe : plus il y a de voix, plus la case s'allume. */
  .case::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: var(--equipe, transparent);
    opacity: calc(var(--part, 0) * 0.42);
    transition: opacity 0.3s;
    pointer-events: none;
  }
  .case.vote {
    border: clamp(2.5px, 0.9cqw, 6px) solid var(--equipe, #fff);
    box-shadow: 0 0 0 clamp(2px, 0.6cqw, 5px) color-mix(in srgb, var(--equipe, #fff) 35%, transparent);
  }
  .voix {
    position: absolute;
    top: -9%;
    right: -9%;
    min-width: 38%;
    padding: 0 6%;
    border-radius: 99px;
    background: var(--surface-3);
    border: 1px solid var(--trait-fort);
    font-size: clamp(10px, 3cqw, 22px);
    font-weight: 700;
    line-height: 1.5;
    z-index: 3;
  }
  .voix.tete {
    background: var(--equipe, #fff);
    border-color: transparent;
    color: var(--encre);
  }
  .croix {
    position: absolute;
    inset: 30%;
    opacity: 0.55;
    background:
      linear-gradient(45deg, transparent 43%, var(--texte-2) 43% 57%, transparent 57%),
      linear-gradient(-45deg, transparent 43%, var(--texte-2) 43% 57%, transparent 57%);
  }

  /* Résultat : la bonne case se grise, la mauvaise clignote dans la couleur de l'équipe. */
  .case.juste {
    border: 1px solid rgba(255, 255, 255, 0.3);
    background: var(--verrou);
    animation: bonne-case 0.9s cubic-bezier(0.3, 1.5, 0.5, 1) both;
  }
  .case.faux::after {
    content: '';
    position: absolute;
    inset: -1px;
    border-radius: inherit;
    background: var(--effet);
    animation: clignotement 0.55s ease-in-out infinite alternate;
    pointer-events: none;
  }
  .case.faux.calme::after {
    animation: none;
    opacity: 0.16;
    transition: opacity 0.8s;
  }
  @keyframes clignotement {
    from {
      opacity: 0.12;
    }
    to {
      opacity: 0.8;
    }
  }
  @keyframes bonne-case {
    0% {
      transform: scale(1);
      box-shadow: 0 0 0 0 var(--effet);
    }
    45% {
      transform: scale(1.12);
      box-shadow: 0 0 0 0.6cqw var(--effet);
    }
    100% {
      transform: scale(1);
      box-shadow: 0 0 0 0.35cqw color-mix(in srgb, var(--effet) 70%, transparent);
    }
  }

  .case.finale {
    border: clamp(1.5px, 0.5cqw, 5px) solid var(--effet);
    background: rgba(255, 255, 255, 0.14);
    background: color-mix(in srgb, var(--effet) 26%, transparent);
    box-shadow: 0 0 4cqw color-mix(in srgb, var(--effet) 45%, transparent);
  }

  .cible {
    position: absolute;
    left: 6%;
    top: 6%;
    width: 24%;
    height: 24%;
    border-radius: 50%;
    background: var(--c);
    box-shadow: 0 0 0 2px var(--fond);
  }
  .choix-regie {
    position: absolute;
    left: 50%;
    bottom: 4%;
    translate: -50% 0;
    padding: 0 6%;
    border-radius: 99px;
    background: var(--c);
    color: var(--encre);
    font-size: clamp(8px, 2.2cqw, 13px);
    font-weight: 700;
  }

  .fleches {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
    z-index: 4;
    transition: opacity 0.8s;
  }
  .fleches.calme {
    opacity: 0.35;
  }
  .fleches path {
    fill: none;
    stroke-linecap: round;
  }
  .fleches .fond {
    stroke: var(--fond);
    stroke-width: 3.6;
    opacity: 0.85;
  }
  .fleches .trace {
    stroke: var(--c);
    stroke-width: 1.9;
    stroke-dasharray: 3.2 2.6;
    animation: defilement 0.9s linear infinite;
  }
  .fleches .pointe {
    fill: var(--c);
    stroke: var(--fond);
    stroke-width: 0.7;
    stroke-linejoin: round;
  }
  @keyframes defilement {
    to {
      stroke-dashoffset: -5.8;
    }
  }

  .pion {
    position: absolute;
    left: 0;
    top: 0;
    width: 18%;
    height: 18%;
    padding: 2.1%;
    border: 0;
    background: none;
    transform: translate(calc(var(--col) * 113.89%), calc(var(--rang) * 113.89%));
    transition: transform 1.4s cubic-bezier(0.6, 0, 0.3, 1);
    z-index: 2;
    pointer-events: none;
    font-size: clamp(8px, 14cqw, 120px);
  }
  button.pion {
    pointer-events: auto;
  }
  .pion.amoi {
    z-index: 3;
  }
  .pion.amoi::after {
    content: '';
    position: absolute;
    inset: 4%;
    border-radius: 50%;
    border: clamp(1.5px, 0.5cqw, 4px) solid var(--couleur);
    animation: halo 1.6s ease-out infinite;
    pointer-events: none;
  }
  .pion.selection {
    z-index: 5;
  }
  @keyframes halo {
    from {
      transform: scale(0.9);
      opacity: 0.9;
    }
    to {
      transform: scale(1.5);
      opacity: 0;
    }
  }

  /*
   * Anciens téléphones (iOS 15) : les unités « cqw » n'existent pas, les tailles
   * ci-dessus sont ignorées. Voici des valeurs fixes de remplacement.
   */
  @supports not (width: 1cqw) {
    .lettres,
    .chiffres {
      font-size: 13px;
    }
    .registres {
      font-size: 9px;
    }
    .voix {
      font-size: 11px;
    }
    .pion {
      font-size: 40px;
    }
    .pion.amoi::after {
      border: 2px solid var(--couleur);
    }
    .case.silhouette:not(.grisee):not(.juste):not(.vote):not(.finale) {
      border: 2px dashed rgba(255, 255, 255, 0.5);
    }
    .case.vote {
      border: 3px solid var(--equipe, #fff);
    }
    .case.finale {
      border: 2px solid var(--effet);
    }
  }
</style>
