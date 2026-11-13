<script lang="ts">
  /**
   * Le grand écran (vidéoprojecteur ou panneaux LED), vu par le public ET par les
   * musiciens : il doit se lire de loin, d'un coup d'œil.
   */
  import QRCode from 'qrcode';
  import { onMount } from 'svelte';
  import { INFOS, type Couleur } from '../../shared/couleurs';
  import type { Mouvement, PionPublic } from '../../shared/types';
  import Chrono from '../composants/Chrono.svelte';
  import Confettis from '../composants/Confettis.svelte';
  import Grille from '../composants/Grille.svelte';
  import Jeton from '../composants/Jeton.svelte';
  import { ajuster } from '../lib/ajuster';
  import { Connexion } from '../lib/connexion.svelte';
  import { dureeLisible, pluriel } from '../lib/format';
  import { demarrerHorloge, horloge } from '../lib/horloge.svelte';
  import { garderEcranAllume } from '../lib/veille';

  const c = new Connexion('ecran');
  demarrerHorloge();

  const adresse = `${location.origin}/`;
  const adresseLisible = location.host;
  let qr = $state('');

  onMount(() => {
    const liberer = garderEcranAllume();
    void QRCode.toString(adresse, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }).then((svg) => {
      qr = svg;
    });
    return () => {
      liberer();
      c.fermer();
    };
  });

  const etat = $derived(c.etat);
  const presents = $derived(etat?.pions.filter((p) => !p.absent) ?? []);
  const reste = $derived(
    !etat ? null : etat.pause !== null ? etat.pause : etat.finPhase === null ? null : Math.max(0, etat.finPhase - (horloge.t + c.decalage)),
  );
  const part = $derived(!etat || reste === null || etat.dureePhase <= 0 ? 0 : Math.min(1, reste / etat.dureePhase));
  const votants = $derived(etat && etat.phase === 'vote' && c.votants?.manche === etat.manche ? c.votants.v : {});
  const mouvements = $derived(new Map<Couleur, Mouvement>((etat?.mouvements ?? []).map((m) => [m.couleur, m])));
  const enResultat = $derived(etat?.phase === 'affichage' || etat?.phase === 'deplacement');
  const moitie = $derived(Math.ceil(presents.length / 2));
  const places = $derived(presents.filter((p) => p.verrouille).length);

  const ETAPES = [
    { phase: 'vote', nom: 'Vote' },
    { phase: 'affichage', nom: 'Résultat' },
    { phase: 'deplacement', nom: 'Déplacement' },
  ] as const;

  const TITRES: Record<string, { titre: string; sousTitre: string }> = {
    vote: { titre: 'Votez !', sousTitre: 'Chaque équipe choisit la case de son musicien' },
    affichage: { titre: 'Résultat', sousTitre: 'Musiciens, préparez-vous' },
    deplacement: { titre: 'Déplacement', sousTitre: 'Les musiciens changent de case' },
  };

  // « C'est parti ! » au lancement.
  let depart = $state(false);
  let phasePrecedente = '';
  $effect(() => {
    const phase = etat?.phase ?? '';
    if (phasePrecedente === 'accueil' && phase === 'vote') {
      depart = true;
      setTimeout(() => (depart = false), 2200);
    }
    phasePrecedente = phase;
  });

  function statut(p: PionPublic, m: Mouvement | undefined): { ton: 'bon' | 'mauvais' | 'neutre'; texte: string } | null {
    if (!m) return null;
    if (m.verrouille) return { ton: 'bon', texte: m.revele ? 'Révélé' : m.chance ? 'Coup de chance' : 'En place' };
    if (m.issue === 'sansVote') return { ton: 'neutre', texte: m.echange ? 'Délogé' : 'Pas de vote' };
    if (m.dispute) return { ton: 'mauvais', texte: 'Case prise' };
    return { ton: 'mauvais', texte: 'Raté' };
  }
</script>

{#snippet carte(p: PionPublic)}
  {@const info = INFOS[p.couleur]}
  {@const m = mouvements.get(p.couleur)}
  {@const s = enResultat ? statut(p, m) : null}
  {@const dejaPlace = p.verrouille && (!m || etat?.phase === 'final')}
  {@const effectif = etat?.equipes[p.couleur] ?? 0}
  {@const aVote = votants[p.couleur] ?? 0}
  <article
    class="carte"
    use:ajuster
    class:placee={dejaPlace}
    class:bon={s?.ton === 'bon'}
    class:mauvais={s?.ton === 'mauvais' && etat?.phase === 'affichage'}
    style:--couleur={info.hex}
    data-equipe={p.couleur}
  >
    <span class="jeton"><Jeton couleur={p.couleur} verrouille={dejaPlace || (s?.ton === 'bon' && etat?.phase === 'deplacement')} /></span>
    <div class="contenu">
      <header>
        <span class="nom">{info.nom}</span>
        {#if dejaPlace}
          <span class="pastille bon">En place</span>
        {:else if s}
          <span class="pastille {s.ton}">{s.texte}</span>
        {:else}
          <span class="effectif">{effectif}</span>
        {/if}
      </header>

      {#if enResultat && m}
        <p class="trajet">
          {#if m.vers !== m.de}
            <span>{m.de}</span><i aria-hidden="true">→</i><b>{m.vers}</b>
          {:else}
            <span class="reste">reste en</span><b>{m.de}</b>
          {/if}
        </p>
      {:else if !dejaPlace && etat?.options.enigmesPubliques && p.enigme}
        <p class="enigme">{p.enigme}</p>
        {#each p.indices as indice, i (i)}
          <p class="indice"><span>Indice</span>{indice}</p>
        {/each}
      {/if}

      {#if etat?.phase === 'vote' && !p.verrouille}
        <div class="participation" title="{aVote} votants sur {effectif}">
          <i style:width="{effectif > 0 ? Math.min(100, (aVote / effectif) * 100) : 0}%"></i>
        </div>
      {/if}
    </div>
  </article>
{/snippet}

{#if !etat}
  <main class="chargement"><h1 class="logo">Tutti</h1></main>
{:else if etat.phase === 'accueil'}
  <main class="accueil">
    <section class="rejoindre">
      <div class="qr" aria-label="QR code pour rejoindre la partie">{@html qr}</div>
      <p class="adresse">{adresseLisible}</p>
    </section>
    <section class="presentation">
      <h1 class="logo">{etat.titre}</h1>
      <p class="sous-titre">{etat.sousTitre}</p>
      <ol class="etapes-accueil">
        <li><span><b>Scannez</b> le QR code avec votre téléphone</span></li>
        <li><span><b>Découvrez</b> votre équipe et son énigme</span></li>
        <li><span><b>Votez</b> pour déplacer votre musicien</span></li>
      </ol>
      <div class="equipes-accueil">
        {#each presents as p (p.couleur)}
          {@const n = etat.equipes[p.couleur] ?? 0}
          <div class="equipe-accueil" style:--couleur={INFOS[p.couleur].hex} data-equipe={p.couleur}>
            <span class="jeton"><Jeton couleur={p.couleur} /></span>
            <span class="compte">{n}</span>
          </div>
        {/each}
      </div>
      <p class="total" data-total={etat.joueurs}>
        {etat.joueurs === 0 ? 'En attente des premiers joueurs…' : `${pluriel(etat.joueurs, 'joueur')} ${etat.joueurs > 1 ? 'connectés' : 'connecté'}`}
      </p>
    </section>
  </main>
{:else}
  <main class="jeu" class:final={etat.phase === 'final'} data-phase={etat.phase}>
    <header class="haut">
      <div class="marque">
        <span class="logo petit">{etat.titre}</span>
        <span class="manche">
          {#if etat.phase === 'final'}
            {places} / {presents.length} en place
          {:else}
            Manche {etat.manche} · {places} / {presents.length} en place
          {/if}
        </span>
      </div>

      <div class="phase">
        {#if etat.phase === 'final'}
          <h1 class="titre-final">Tutti !</h1>
          <p>Puzzle résolu en {pluriel(etat.manche, 'manche')} · {dureeLisible(etat.tempsJeu)}</p>
        {:else}
          <ol class="etapes" aria-hidden="true">
            {#each ETAPES as etape, i (etape.phase)}
              <li class:active={etat.phase === etape.phase}><span>{i + 1}</span>{etape.nom}</li>
            {/each}
          </ol>
          {#key etat.phase}
            <h1 class="titre-phase">{etat.pause !== null ? 'Pause' : TITRES[etat.phase]?.titre}</h1>
          {/key}
          <p>{etat.pause !== null ? 'La partie reprend dans un instant' : TITRES[etat.phase]?.sousTitre}</p>
        {/if}
      </div>

      <div class="temps">
        {#if etat.phase !== 'final'}
          <div class="chrono"><Chrono {reste} duree={etat.dureePhase} pause={etat.pause !== null} attente={etat.attenteRegie} /></div>
        {/if}
      </div>
      {#if etat.phase !== 'final'}
        <div class="barre" class:pause={etat.pause !== null}><i style:width="{part * 100}%"></i></div>
      {/if}
    </header>

    <section class="colonne gauche">
      {#each presents.slice(0, moitie) as p (p.couleur)}{@render carte(p)}{/each}
    </section>

    <section class="centre">
      <div class="cadre-grille">
        <Grille pions={etat.pions} silhouette={etat.silhouette} phase={etat.phase} mouvements={etat.mouvements} legende />
      </div>
    </section>

    <section class="colonne droite">
      {#each presents.slice(moitie) as p (p.couleur)}{@render carte(p)}{/each}
      <div class="rappel">
        <div class="mini-qr">{@html qr}</div>
        <p><b>{adresseLisible}</b>{pluriel(etat.joueurs, 'joueur')}</p>
      </div>
    </section>

    {#if etat.phase === 'final'}
      <Confettis couleurs={presents.map((p) => p.couleur)} />
    {/if}
    {#if depart}
      <div class="depart" aria-hidden="true"><span>C’est parti !</span></div>
    {/if}
  </main>
{/if}

{#if etat && !c.enLigne}
  <div class="hors-ligne" role="status">Reconnexion…</div>
{/if}

<style>
  main {
    --u: min(1vw, 1.78vh);
    height: 100vh;
    overflow: hidden;
    background:
      radial-gradient(60% 50% at 12% 0%, rgba(143, 123, 255, 0.16), transparent 70%),
      radial-gradient(50% 45% at 92% 100%, rgba(61, 139, 255, 0.12), transparent 70%),
      var(--fond);
    font-size: calc(var(--u) * 1.5);
  }
  .logo {
    font-family: var(--titre);
    font-weight: 800;
    letter-spacing: -0.03em;
    line-height: 0.95;
    font-size: calc(var(--u) * 11);
  }
  .logo.petit {
    font-size: calc(var(--u) * 3.4);
  }
  .chargement {
    display: grid;
    place-items: center;
  }

  /* ---------- Accueil ---------- */
  .accueil {
    display: grid;
    grid-template-columns: 40fr 60fr;
    align-items: center;
    gap: calc(var(--u) * 4.5);
    padding: calc(var(--u) * 3) calc(var(--u) * 5);
  }
  .accueil .logo {
    font-size: calc(var(--u) * 9.5);
  }
  .rejoindre {
    display: grid;
    justify-items: center;
    gap: calc(var(--u) * 1.6);
  }
  .qr {
    width: min(100%, 66vh);
    aspect-ratio: 1;
    padding: calc(var(--u) * 2);
    border-radius: calc(var(--u) * 2.4);
    background: #fff;
    box-shadow: 0 0 calc(var(--u) * 8) rgba(143, 123, 255, 0.35);
  }
  .qr :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
  .adresse {
    font-family: var(--titre);
    font-weight: 700;
    font-size: calc(var(--u) * 2.5);
    color: var(--texte-2);
    word-break: break-all;
    text-align: center;
  }
  .presentation .logo {
    background: linear-gradient(90deg, #ff4545, #ff9a1f, #ffe03a, #2fd673, #3d8bff, #a66bff, #ff86c8);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    padding-bottom: 0.08em;
    width: fit-content;
  }
  .sous-titre {
    font-family: var(--titre);
    font-size: calc(var(--u) * 3.2);
    font-weight: 600;
    color: var(--texte-2);
  }
  .etapes-accueil {
    margin: calc(var(--u) * 2.4) 0;
    padding: 0;
    list-style: none;
    counter-reset: etape;
    display: grid;
    gap: calc(var(--u) * 1.1);
    font-size: calc(var(--u) * 2.15);
    color: var(--texte-2);
  }
  .etapes-accueil li {
    counter-increment: etape;
    display: flex;
    align-items: center;
    gap: calc(var(--u) * 1.4);
  }
  .etapes-accueil li::before {
    content: counter(etape);
    flex: none;
    display: grid;
    place-items: center;
    width: calc(var(--u) * 3.6);
    height: calc(var(--u) * 3.6);
    border-radius: 50%;
    background: var(--surface-3);
    color: var(--texte);
    font-family: var(--titre);
    font-weight: 800;
  }
  .etapes-accueil b {
    color: var(--texte);
  }
  .equipes-accueil {
    display: flex;
    flex-wrap: wrap;
    gap: calc(var(--u) * 1);
  }
  .equipe-accueil {
    display: grid;
    justify-items: center;
    gap: calc(var(--u) * 0.6);
    width: calc(var(--u) * 5.6);
    padding: calc(var(--u) * 0.9) 0 calc(var(--u) * 0.6);
    border-radius: calc(var(--u) * 1.6);
    background: color-mix(in srgb, var(--couleur) 14%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--couleur) 55%, transparent);
  }
  .equipe-accueil .jeton {
    width: calc(var(--u) * 3.8);
    font-size: calc(var(--u) * 3.8);
  }
  .equipe-accueil .compte {
    animation: none;
  }
  .compte {
    font-family: var(--titre);
    font-weight: 800;
    font-size: calc(var(--u) * 2.6);
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .total {
    margin-top: calc(var(--u) * 1.8);
    font-size: calc(var(--u) * 2.2);
    color: var(--texte-2);
  }

  /* ---------- Jeu ---------- */
  .jeu {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 27fr) minmax(0, 46fr) minmax(0, 27fr);
    grid-template-rows: auto minmax(0, 1fr);
    gap: calc(var(--u) * 1.6) calc(var(--u) * 2);
    padding: calc(var(--u) * 1.6) calc(var(--u) * 2.4) calc(var(--u) * 2);
  }
  .haut {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: calc(var(--u) * 2);
    position: relative;
    padding-bottom: calc(var(--u) * 1.3);
  }
  .marque {
    display: grid;
    gap: calc(var(--u) * 0.4);
  }
  .manche {
    font-size: calc(var(--u) * 1.7);
    color: var(--texte-2);
    font-variant-numeric: tabular-nums;
  }
  .phase {
    text-align: center;
  }
  .phase p {
    font-size: calc(var(--u) * 1.9);
    color: var(--texte-2);
  }
  .etapes {
    display: flex;
    justify-content: center;
    gap: calc(var(--u) * 0.8);
    margin: 0 0 calc(var(--u) * 0.5);
    padding: 0;
    list-style: none;
    font-size: calc(var(--u) * 1.35);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--texte-3);
  }
  .etapes li {
    display: flex;
    align-items: center;
    gap: 0.5em;
    padding: 0.25em 0.9em 0.25em 0.3em;
    border-radius: 99px;
    border: 1px solid var(--trait);
    transition:
      background 0.4s,
      color 0.4s;
  }
  .etapes span {
    display: grid;
    place-items: center;
    width: 1.7em;
    height: 1.7em;
    border-radius: 50%;
    background: var(--surface-3);
  }
  .etapes li.active {
    background: var(--texte);
    border-color: transparent;
    color: var(--encre);
  }
  .etapes li.active span {
    background: var(--encre);
    color: var(--texte);
  }
  .titre-phase,
  .titre-final {
    font-family: var(--titre);
    font-weight: 800;
    font-size: calc(var(--u) * 4.8);
    line-height: 1;
    letter-spacing: -0.02em;
    animation: titre 0.5s cubic-bezier(0.3, 1.4, 0.5, 1) both;
  }
  .titre-final {
    font-size: calc(var(--u) * 6.4);
    background: linear-gradient(90deg, #ff4545, #ff9a1f, #ffe03a, #2fd673, #3d8bff, #a66bff, #ff86c8);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    padding-bottom: 0.1em;
  }
  @keyframes titre {
    from {
      opacity: 0;
      transform: translateY(40%) scale(0.92);
    }
  }
  .temps {
    display: flex;
    justify-content: flex-end;
  }
  .chrono {
    width: calc(var(--u) * 8.2);
  }
  .barre {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: calc(var(--u) * 0.55);
    border-radius: 99px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .barre i {
    display: block;
    height: 100%;
    border-radius: 99px;
    background: var(--texte);
    transition: width 0.12s linear;
  }
  .barre.pause i {
    background: var(--texte-3);
  }

  .colonne {
    display: flex;
    flex-direction: column;
    gap: calc(var(--u) * 1.1);
    min-height: 0;
  }
  .centre {
    min-height: 0;
    display: grid;
    place-items: center;
    container-type: size;
  }
  .cadre-grille {
    width: min(96cqw, 91cqh);
    padding-right: 2%;
  }

  .carte {
    flex: 1 1 0;
    min-height: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.75em;
    padding: 0.45em 0.8em 0.45em 0.7em;
    border-radius: calc(var(--u) * 1.5);
    background: color-mix(in srgb, var(--couleur) 9%, var(--surface));
    border: calc(var(--u) * 0.14) solid color-mix(in srgb, var(--couleur) 45%, transparent);
    border-left: calc(var(--u) * 0.7) solid var(--couleur);
    overflow: hidden;
    /* Tout le contenu se règle en « em » : l'action « ajuster » réduit l'échelle si le texte déborde. */
    font-size: calc(var(--u) * 1.5 * var(--echelle, 1));
    transition:
      background 0.5s,
      border-color 0.5s,
      opacity 0.5s,
      flex-grow 0.6s;
  }
  .carte .jeton {
    width: 2.4em;
    font-size: 1em;
  }
  .carte .jeton :global(.jeton) {
    font-size: 2.4em;
  }
  .contenu {
    display: grid;
    gap: 0.22em;
    min-width: 0;
  }
  .carte header {
    display: flex;
    align-items: center;
    gap: 0.55em;
  }
  .carte .nom {
    font-family: var(--titre);
    font-weight: 800;
    font-size: 1.35em;
    line-height: 1;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: var(--couleur);
  }
  .effectif {
    margin-left: auto;
    font-family: var(--titre);
    font-weight: 700;
    font-size: 1em;
    color: var(--texte-3);
    font-variant-numeric: tabular-nums;
  }
  .pastille {
    margin-left: auto;
    padding: 0.2em 0.75em;
    border-radius: 99px;
    font-size: 0.87em;
    font-weight: 700;
    line-height: 1.2;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    background: var(--surface-3);
    white-space: nowrap;
  }
  .pastille.bon {
    background: var(--texte);
    color: var(--encre);
  }
  .pastille.mauvais {
    background: var(--couleur);
    color: var(--encre);
  }
  .enigme {
    font-size: 1.15em;
    font-weight: 700;
    line-height: 1.16;
  }
  .indice {
    font-size: 0.95em;
    line-height: 1.16;
    animation: nouvel-indice 1.4s ease-out both;
  }
  .indice span {
    display: inline-block;
    margin-right: 0.5em;
    padding: 0 0.6em;
    border-radius: 99px;
    background: var(--alerte);
    color: var(--encre);
    font-size: 0.72em;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    vertical-align: 0.1em;
  }
  @keyframes nouvel-indice {
    0% {
      opacity: 0;
      transform: translateX(-1em);
    }
    30% {
      opacity: 1;
      transform: none;
    }
  }
  .trajet {
    display: flex;
    align-items: baseline;
    gap: 0.35em;
    font-family: var(--titre);
    font-weight: 800;
    font-size: 2.6em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .trajet span {
    color: var(--texte-3);
  }
  .trajet i {
    font-style: normal;
    color: var(--couleur);
  }
  .trajet .reste {
    font-family: var(--police);
    font-size: 0.42em;
    font-weight: 400;
  }
  .participation {
    height: 0.32em;
    border-radius: 99px;
    background: rgba(255, 255, 255, 0.1);
    overflow: hidden;
  }
  .participation i {
    display: block;
    height: 100%;
    border-radius: 99px;
    background: var(--couleur);
    transition: width 0.4s;
  }
  /* Équipe déjà en place : la carte se replie et laisse la place aux autres. */
  .carte.placee {
    flex-grow: 0.42;
    background: var(--surface);
    border-color: var(--trait);
    border-left-color: var(--verrou);
    opacity: 0.75;
  }
  .carte.placee .nom {
    color: var(--texte-2);
  }
  .carte.placee .jeton {
    width: 1.8em;
  }
  .carte.placee .jeton :global(.jeton) {
    font-size: 1.8em;
  }
  /* Bonne réponse : la carte se grise, comme la case. */
  .carte.bon {
    background: var(--verrou);
    border-color: var(--texte);
    border-left-color: var(--couleur);
    animation: carte-juste 0.7s cubic-bezier(0.3, 1.5, 0.5, 1) both;
  }
  @keyframes carte-juste {
    40% {
      transform: scale(1.04);
    }
  }
  .final .carte.placee {
    flex-grow: 1;
    opacity: 1;
    border-left-color: var(--couleur);
  }
  .final .carte.placee .nom {
    color: var(--couleur);
  }
  .carte.mauvais {
    animation: carte-fausse 0.55s ease-in-out infinite alternate;
  }
  @keyframes carte-fausse {
    from {
      background: color-mix(in srgb, var(--couleur) 9%, var(--surface));
    }
    to {
      background: color-mix(in srgb, var(--couleur) 34%, var(--surface));
    }
  }

  .rappel {
    display: flex;
    align-items: center;
    gap: calc(var(--u) * 1);
    padding: calc(var(--u) * 0.7) calc(var(--u) * 1);
    border-radius: calc(var(--u) * 1.4);
    background: var(--surface);
    border: 1px solid var(--trait);
    color: var(--texte-2);
    font-size: calc(var(--u) * 1.35);
  }
  .rappel b {
    display: block;
    color: var(--texte);
    word-break: break-all;
  }
  .mini-qr {
    flex: none;
    width: calc(var(--u) * 5.4);
    padding: calc(var(--u) * 0.4);
    border-radius: calc(var(--u) * 0.6);
    background: #fff;
  }
  .mini-qr :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }

  .depart {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(10, 10, 17, 0.82);
    z-index: 20;
    animation: voile-depart 2.2s ease-in-out both;
    pointer-events: none;
  }
  .depart span {
    font-family: var(--titre);
    font-weight: 800;
    font-size: calc(var(--u) * 13);
    letter-spacing: -0.03em;
    animation: mot-depart 2.2s cubic-bezier(0.3, 1.4, 0.5, 1) both;
  }
  @keyframes voile-depart {
    0%,
    75% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
  @keyframes mot-depart {
    0% {
      transform: scale(0.4);
      opacity: 0;
    }
    25%,
    80% {
      transform: scale(1);
      opacity: 1;
    }
    100% {
      transform: scale(1.3);
      opacity: 0;
    }
  }

  .hors-ligne {
    position: fixed;
    top: 12px;
    right: 12px;
    padding: 6px 16px;
    border-radius: 99px;
    background: var(--alerte);
    color: var(--encre);
    font-weight: 700;
    z-index: 40;
  }

  /* Écrans presque carrés (4:3, panneaux LED) : les cartes passent sous la grille. */
  @media (max-aspect-ratio: 5 / 4) {
    .jeu {
      --u: min(1.5vw, 1.2vh);
      grid-template-columns: 1fr 1fr;
      grid-template-rows: auto minmax(0, 1fr) auto;
    }
    .centre {
      grid-column: 1 / -1;
      grid-row: 2;
    }
    .colonne {
      grid-row: 3;
    }
    .rappel {
      display: none;
    }
    .accueil {
      grid-template-columns: 1fr;
      justify-items: center;
      text-align: center;
    }
    .qr {
      width: min(70vw, 42vh);
    }
    .equipes-accueil {
      justify-content: center;
    }
  }
</style>
