<script lang="ts">
  /** L'écran du public, sur smartphone. */
  import { onMount } from 'svelte';
  import { INFOS, equipe as nomEquipe, le } from '../../shared/couleurs';
  import { lexique, type TypeContrainte } from '../../shared/enigmes';
  import type { Case } from '../../shared/grille';
  import { filtrerVotables } from '../../shared/regles';
  import Grille from '../composants/Grille.svelte';
  import Jeton from '../composants/Jeton.svelte';
  import { Connexion } from '../lib/connexion.svelte';
  import { dureeLisible, pluriel } from '../lib/format';
  import { demarrerHorloge, horloge } from '../lib/horloge.svelte';
  import { garderEcranAllume, vibrer } from '../lib/veille';

  const c = new Connexion('joueur');
  demarrerHorloge();

  onMount(() => () => c.fermer());

  // L'écran reste allumé pendant la partie. Au final, on le laisse s'éteindre :
  // le concert continue, et une salle pleine de téléphones allumés gênerait.
  const partieFinie = $derived(c.etat?.phase === 'final');
  $effect(() => {
    if (partieFinie) return;
    return garderEcranAllume();
  });

  let aideOuverte = $state(false);

  const etat = $derived(c.etat);
  const equipe = $derived(c.moi?.equipe ?? null);
  const info = $derived(equipe ? INFOS[equipe] : null);
  const monPion = $derived(etat && equipe ? (etat.pions.find((p) => p.couleur === equipe) ?? null) : null);
  const enVote = $derived(etat?.phase === 'vote');
  const vote = $derived(etat && enVote && c.moi && c.moi.manche === etat.manche ? c.moi.vote : null);
  const tendance = $derived(
    etat && enVote && c.tendance && c.tendance.manche === etat.manche && c.tendance.equipe === equipe ? c.tendance.votes : null,
  );
  const votants = $derived(Object.values(tendance ?? {}).reduce((a, b) => a + b, 0));
  const daccord = $derived(vote && tendance ? (tendance[vote] ?? 0) : 0);
  const votables = $derived.by(() => {
    if (!etat || !enVote || !monPion || monPion.verrouille) return new Set<Case>();
    const verrouillees = new Set(etat.pions.filter((p) => p.verrouille).map((p) => p.position));
    return new Set(filtrerVotables(monPion.essais, verrouillees, { voteLibre: etat.options.voteLibre, silhouette: etat.silhouette }));
  });
  const reste = $derived(
    !etat ? null : etat.pause !== null ? etat.pause : etat.finPhase === null ? null : Math.max(0, etat.finPhase - (horloge.t + c.decalage)),
  );
  const secondes = $derived(reste === null ? null : Math.ceil(reste / 1000));
  const part = $derived(!etat || reste === null || etat.dureePhase <= 0 ? 0 : Math.min(1, reste / etat.dureePhase));
  const monMouvement = $derived(etat?.mouvements?.find((m) => m.couleur === equipe) ?? null);
  const restantes = $derived(etat?.pions.filter((p) => !p.verrouille && !p.absent) ?? []);
  const presents = $derived(etat?.pions.filter((p) => !p.absent) ?? []);
  const enJeu = $derived(etat?.phase === 'vote' || etat?.phase === 'affichage' || etat?.phase === 'deplacement');
  /** Mon équipe a trouvé lors d'une manche précédente. */
  const resolue = $derived(!!monPion?.verrouille && !monMouvement);
  const mots = $derived(lexique((etat?.lexique ?? []) as TypeContrainte[]));

  // Petites vibrations aux moments clés (Android).
  let dernierePhase = '';
  $effect(() => {
    const phase = etat?.phase ?? '';
    if (phase === dernierePhase) return;
    const precedente = dernierePhase;
    dernierePhase = phase;
    if (!precedente) return;
    if (phase === 'vote') vibrer(40);
    else if (phase === 'affichage' && monMouvement) vibrer(monMouvement.verrouille ? [70, 50, 160] : 220);
    else if (phase === 'final') vibrer([80, 60, 80, 60, 240]);
  });

  function choisir(cas: Case): void {
    if (!votables.has(cas)) return;
    vibrer(15);
    c.voter(cas);
  }

  interface Verdict {
    ton: 'bon' | 'mauvais' | 'neutre';
    titre: string;
    detail: string;
  }

  const verdict = $derived.by((): Verdict | null => {
    const m = monMouvement;
    if (!m || !equipe) return null;
    const musicien = `votre musicien`;
    if (m.verrouille) {
      if (m.revele) return { ton: 'bon', titre: 'Solution révélée', detail: `La régie place ${musicien} en ${m.vers}.` };
      if (m.chance) return { ton: 'bon', titre: 'Coup de chance !', detail: `Un échange envoie ${musicien} pile sur sa case, en ${m.vers}.` };
      return { ton: 'bon', titre: 'Bravo !', detail: `${m.vers} est la bonne case. Votre musicien est en place.` };
    }
    const suite = m.vers === m.de ? `Votre musicien reste en ${m.de}.` : `Une autre équipe prend sa place : il va en ${m.vers}.`;
    if (m.issue === 'sansVote') {
      return { ton: 'neutre', titre: 'Pas de vote', detail: `Personne n’a voté dans votre équipe. ${suite}` };
    }
    if (m.dispute) {
      return { ton: 'mauvais', titre: 'Raté', detail: `${m.choix} n’est pas la bonne case, et une autre équipe l’a prise. ${suite}` };
    }
    return { ton: 'mauvais', titre: 'Raté', detail: `${m.vers} n’est pas la bonne case. Votre musicien y va quand même.` };
  });
</script>

{#snippet enigme()}
  {#if monPion && monPion.enigme}
    <section class="enigme">
      <p class="texte">{monPion.enigme}</p>
      {#each monPion.indices as indice, i (i)}
        <p class="indice"><span>Indice</span>{indice}</p>
      {/each}
    </section>
  {/if}
{/snippet}

{#snippet grille(interactive: boolean)}
  {#if etat}
    <div class="zone-grille">
      <div class="cadre-grille">
        <Grille
          pions={etat.pions}
          silhouette={etat.silhouette}
          phase={etat.phase}
          mouvements={etat.mouvements}
          {equipe}
          vote={interactive ? vote : null}
          tendance={interactive ? tendance : null}
          votables={interactive ? votables : null}
          essais={monPion && !monPion.verrouille ? monPion.essais : []}
          surCase={interactive ? choisir : undefined}
          legende
        />
      </div>
    </div>
  {/if}
{/snippet}

{#if !etat}
  <main class="attente">
    <h1 class="logo">Tutti</h1>
    <p class="clignote">Connexion…</p>
  </main>
{:else if etat.phase === 'accueil'}
  <main class="accueil" style:--equipe={info?.hex ?? '#8f7bff'}>
    <header>
      <h1 class="logo">{etat.titre}</h1>
      <p class="sous-titre">{etat.sousTitre}</p>
    </header>
    {#if equipe && info}
      <section class="carte-equipe" data-equipe={equipe}>
        <div class="grand-jeton"><Jeton couleur={equipe} /></div>
        <p class="annonce">Vous êtes dans l’</p>
        <p class="nom-equipe">{nomEquipe(equipe)}</p>
        <p class="repere">Votre symbole : {info.nomSymbole}</p>
      </section>
      <ol class="regles">
        <li><span><b>Lisez l’énigme</b> de votre équipe.</span></li>
        <li><span><b>Touchez la case</b> où doit aller le musicien {info.nom}.</span></li>
        <li><span><b>La majorité l’emporte</b> : le musicien se déplace… et la musique change.</span></li>
      </ol>
      <p class="effectif">
        {pluriel(etat.equipes[equipe] ?? 1, 'joueur')} dans votre équipe · {pluriel(etat.joueurs, 'connecté')}
      </p>
    {:else}
      <p class="effectif">Vous regardez la partie en spectateur.</p>
    {/if}
    <p class="bientot clignote">La partie va bientôt commencer</p>
    <footer>Aucune donnée personnelle n’est collectée.</footer>
  </main>
{:else if etat.phase === 'final'}
  <main class="final" style:--equipe={info?.hex ?? '#fff'}>
    <h1 class="logo grand">Tutti !</h1>
    <p class="resume">
      Puzzle résolu en {pluriel(etat.manche, 'manche')}{etat.tempsJeu > 0 ? ` · ${dureeLisible(etat.tempsJeu)}` : ''}
    </p>
    {@render grille(false)}
    <p class="merci">Merci d’avoir joué ! Rangez votre téléphone et profitez de la musique.</p>
  </main>
{:else}
  <main class="jeu" class:pause={etat.pause !== null} style:--equipe={info?.hex ?? '#8f7bff'} data-phase={etat.phase}>
    <header class="bandeau">
      {#if equipe && info}
        <span class="mini-jeton"><Jeton couleur={equipe} verrouille={resolue} /></span>
        <span class="nom" data-equipe={equipe}>{nomEquipe(equipe)}</span>
      {:else}
        <span class="nom">Spectateur</span>
      {/if}
      <span class="manche">Manche {etat.manche}</span>
    </header>

    {#if !equipe}
      <section class="consigne"><h2>La partie est en cours</h2></section>
      {@render grille(false)}
    {:else if resolue}
      <section class="verdict bon calme">
        <span class="signe" aria-hidden="true">✓</span>
        <div>
          <h2>Votre musicien est en place</h2>
          <p>Votre équipe a trouvé. Bravo !</p>
        </div>
      </section>
      {@render grille(false)}
      {#if etat.options.renfort && restantes.length > 0}
        <button class="bouton-renfort" onclick={() => c.renfort()}>
          Aider une autre équipe
          <small>{restantes.length === 1 ? 'Il en reste une' : `Il en reste ${restantes.length}`}</small>
        </button>
      {/if}
    {:else if etat.phase === 'vote'}
      <section class="minuteur" class:urgent={secondes !== null && secondes <= 5 && etat.pause === null}>
        <h2>{etat.pause !== null ? 'Pause' : 'Votez !'}</h2>
        <span class="secondes" role="timer">{etat.pause !== null ? '⏸' : etat.attenteRegie ? '…' : (secondes ?? '')}</span>
        <div class="barre"><i style:width="{part * 100}%"></i></div>
      </section>
      {@render enigme()}
      {@render grille(true)}
      <footer class="pied">
        {#if vote}
          <p class="mon-vote">
            Votre vote : <b>{vote}</b>
            {#if votants > 1}<span>· {daccord} sur {votants} d’accord</span>{/if}
          </p>
          <p class="astuce">Vous pouvez changer d’avis jusqu’à la fin du chrono.</p>
        {:else}
          <p class="mon-vote">Touchez la case où doit aller {le(equipe)}.</p>
          <p class="astuce">
            {etat.silhouette ? 'Les cases en pointillés forment la figure à reconstituer.' : 'La majorité de l’équipe l’emporte.'}
          </p>
        {/if}
      </footer>
    {:else if etat.phase === 'affichage'}
      {#if verdict}
        <section class="verdict {verdict.ton}" data-verdict={verdict.ton}>
          <span class="signe" aria-hidden="true">{verdict.ton === 'bon' ? '✓' : verdict.ton === 'mauvais' ? '✕' : '–'}</span>
          <div>
            <h2>{verdict.titre}</h2>
            <p>{verdict.detail}</p>
          </div>
        </section>
      {/if}
      {@render grille(false)}
      {@render enigme()}
    {:else}
      <section class="consigne">
        <h2>Regardez la scène</h2>
        <p>
          {#if monMouvement && monMouvement.vers !== monMouvement.de}
            Votre musicien va en <b>{monMouvement.vers}</b>. Écoutez : la musique change.
          {:else}
            Les musiciens se déplacent. Écoutez : la musique change.
          {/if}
        </p>
      </section>
      {@render grille(false)}
      {@render enigme()}
    {/if}

    {#if etat.options.enigmesPubliques || mots.length > 0}
      <button class="bouton-aide" onclick={() => (aideOuverte = true)}>Énigmes et lexique</button>
    {/if}
  </main>
{/if}

{#if etat && !c.enLigne}
  <div class="hors-ligne" role="status">Reconnexion…</div>
{/if}

{#if aideOuverte && etat}
  <div class="voile" role="presentation" onclick={() => (aideOuverte = false)}></div>
  <div class="aide" role="dialog" aria-label="Énigmes et lexique" aria-modal="true">
    <button class="fermer" onclick={() => (aideOuverte = false)} aria-label="Fermer">×</button>
    {#if etat.options.enigmesPubliques}
      <h3>Toutes les énigmes</h3>
      <ul class="liste-enigmes">
        {#each presents as p (p.couleur)}
          <li class:trouve={p.verrouille}>
            <span class="puce"><Jeton couleur={p.couleur} verrouille={p.verrouille} /></span>
            <div>
              <p>{p.enigme}</p>
              {#each p.indices as indice, i (i)}<p class="indice-liste">Indice : {indice}</p>{/each}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
    {#if mots.length > 0}
      <h3>Le sens des mots</h3>
      <dl class="lexique">
        {#each mots as mot (mot.mot)}
          <dt>{mot.mot}</dt>
          <dd>{mot.definition}</dd>
        {/each}
      </dl>
    {/if}
    <p class="note-grille">Sur la grille : la lettre (A à E) donne la colonne, le chiffre (1 à 5) la rangée. En haut, les sons aigus ; en bas, les graves.</p>
  </div>
{/if}

<style>
  main {
    /* « vh » puis « dvh » : la seconde ligne est ignorée par les anciens navigateurs (iOS 15). */
    height: 100vh;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    padding: max(10px, env(safe-area-inset-top)) 14px max(10px, env(safe-area-inset-bottom));
    gap: 10px;
    overflow: hidden;
    background: var(--fond);
    background:
      radial-gradient(120% 60% at 50% -10%, color-mix(in srgb, var(--equipe, #8f7bff) 22%, transparent), transparent 70%),
      var(--fond);
  }
  .logo {
    font-family: var(--titre);
    font-weight: 800;
    font-size: 44px;
    letter-spacing: -0.02em;
    line-height: 1;
  }
  .logo.grand {
    font-size: 64px;
  }
  .clignote {
    animation: clignote 1.8s ease-in-out infinite;
  }
  @keyframes clignote {
    50% {
      opacity: 0.45;
    }
  }

  /* Attente et accueil */
  .attente {
    align-items: center;
    justify-content: center;
    gap: 16px;
    color: var(--texte-2);
  }
  .attente .logo {
    color: var(--texte);
  }
  .accueil {
    align-items: center;
    text-align: center;
    justify-content: space-between;
    padding-top: max(26px, env(safe-area-inset-top));
    overflow-y: auto;
  }
  .sous-titre {
    margin-top: 4px;
    color: var(--texte-2);
    font-size: 17px;
  }
  .carte-equipe {
    width: 100%;
    max-width: 380px;
    padding: 20px 16px 18px;
    border-radius: 24px;
    background: var(--surface);
    background: color-mix(in srgb, var(--equipe) 14%, var(--surface));
    border: 2px solid var(--equipe);
    box-shadow: 0 10px 50px color-mix(in srgb, var(--equipe) 28%, transparent);
  }
  .grand-jeton {
    width: 92px;
    margin: 0 auto 12px;
    font-size: 92px;
  }
  .annonce {
    color: var(--texte-2);
    font-size: 16px;
  }
  .nom-equipe {
    font-family: var(--titre);
    font-weight: 800;
    font-size: 34px;
    line-height: 1.1;
    text-transform: uppercase;
    color: var(--equipe);
  }
  .repere {
    margin-top: 6px;
    color: var(--texte-2);
    font-size: 14px;
  }
  .regles {
    width: 100%;
    max-width: 380px;
    margin: 0;
    padding: 0;
    list-style: none;
    counter-reset: etape;
    display: grid;
    gap: 8px;
    text-align: left;
    font-size: 15.5px;
    color: var(--texte-2);
  }
  .regles li {
    counter-increment: etape;
    display: grid;
    grid-template-columns: 30px 1fr;
    align-items: center;
    gap: 10px;
  }
  .regles li::before {
    content: counter(etape);
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--surface-3);
    color: var(--texte);
    font-weight: 700;
  }
  .regles b {
    color: var(--texte);
  }
  .effectif {
    color: var(--texte-2);
    font-size: 15px;
  }
  .bientot {
    font-size: 18px;
    font-weight: 700;
  }
  .accueil footer {
    color: var(--texte-3);
    font-size: 12.5px;
  }

  /* Jeu */
  .bandeau {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 -14px;
    padding: 8px 14px;
    background: var(--equipe);
    color: var(--encre);
  }
  .mini-jeton {
    width: 34px;
    font-size: 34px;
    flex: none;
  }
  .bandeau .nom {
    font-family: var(--titre);
    font-weight: 800;
    font-size: 21px;
    text-transform: uppercase;
    letter-spacing: 0.01em;
  }
  .bandeau .manche {
    margin-left: auto;
    font-weight: 700;
    font-size: 14px;
    opacity: 0.8;
  }

  .minuteur {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: baseline;
    row-gap: 6px;
  }
  .minuteur h2 {
    font-family: var(--titre);
    font-weight: 800;
    font-size: 30px;
    line-height: 1;
  }
  .secondes {
    font-family: var(--titre);
    font-weight: 800;
    font-size: 34px;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .barre {
    grid-column: 1 / -1;
    height: 8px;
    border-radius: 8px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .barre i {
    display: block;
    height: 100%;
    border-radius: 8px;
    background: var(--equipe);
    transition: width 0.12s linear;
  }
  .minuteur.urgent .secondes {
    color: var(--danger);
  }
  .minuteur.urgent .barre i {
    background: var(--danger);
  }

  .enigme {
    flex: none;
    max-height: 34vh;
    max-height: 34dvh;
    overflow-y: auto;
    padding: 11px 14px;
    border-radius: 16px;
    background: var(--surface);
    border-left: 6px solid var(--equipe);
  }
  .enigme .texte {
    font-size: clamp(17px, 5vw, 21px);
    font-weight: 700;
    line-height: 1.25;
  }
  .indice {
    margin-top: 7px;
    font-size: 15.5px;
    color: var(--texte);
    animation: nouvel-indice 1.2s ease-out both;
  }
  .indice span {
    display: inline-block;
    margin-right: 8px;
    padding: 1px 8px;
    border-radius: 99px;
    background: var(--alerte);
    color: var(--encre);
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    vertical-align: 1px;
  }
  @keyframes nouvel-indice {
    from {
      opacity: 0;
      transform: translateX(-10px);
    }
  }

  .zone-grille {
    flex: 1;
    min-height: 0;
    display: grid;
    place-items: center;
    container-type: size;
  }
  .cadre-grille {
    width: min(100%, 52vh);
    width: min(100cqw, 91cqh);
    padding-right: 2%;
  }

  .consigne,
  .verdict {
    padding: 12px 14px;
    border-radius: 16px;
    background: var(--surface);
  }
  .consigne h2,
  .verdict h2 {
    font-family: var(--titre);
    font-weight: 800;
    font-size: 27px;
    line-height: 1.1;
  }
  .consigne p,
  .verdict p {
    margin-top: 4px;
    font-size: 16.5px;
    color: var(--texte-2);
  }
  .verdict {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 12px;
    animation: verdict 0.5s cubic-bezier(0.3, 1.5, 0.5, 1) both;
  }
  .verdict.calme {
    animation: none;
  }
  .verdict p {
    color: var(--texte);
  }
  .signe {
    display: grid;
    place-items: center;
    width: 46px;
    height: 46px;
    border-radius: 50%;
    background: var(--surface-3);
    font-size: 26px;
    font-weight: 700;
    line-height: 1;
  }
  /* Bonne réponse : carte claire (le vert est la couleur d'une équipe). */
  .verdict.bon {
    background: var(--texte);
    color: var(--encre);
  }
  .verdict.bon p {
    color: #33334a;
  }
  .verdict.bon .signe {
    background: var(--encre);
    color: var(--texte);
  }
  .verdict.mauvais {
    background: color-mix(in srgb, var(--equipe) 16%, var(--surface));
    border: 2px solid var(--equipe);
    animation:
      verdict 0.5s cubic-bezier(0.3, 1.5, 0.5, 1) both,
      secousse 0.5s 0.1s;
  }
  .verdict.mauvais .signe {
    background: var(--equipe);
    color: var(--encre);
  }
  .verdict.neutre {
    border: 2px solid var(--trait-fort);
  }
  @keyframes verdict {
    from {
      opacity: 0;
      transform: scale(0.9);
    }
  }
  @keyframes secousse {
    20%,
    60% {
      translate: -7px 0;
    }
    40%,
    80% {
      translate: 7px 0;
    }
  }

  .pied {
    min-height: 46px;
    text-align: center;
  }
  .mon-vote {
    font-size: 17px;
    font-weight: 700;
  }
  .mon-vote b {
    display: inline-block;
    padding: 0 9px;
    border-radius: 8px;
    background: var(--equipe);
    color: var(--encre);
  }
  .mon-vote span {
    font-weight: 400;
    color: var(--texte-2);
  }
  .astuce {
    margin-top: 2px;
    font-size: 13.5px;
    color: var(--texte-3);
  }

  .bouton-aide {
    align-self: center;
    padding: 9px 18px;
    border-radius: 99px;
    border: 1px solid var(--trait-fort);
    background: var(--surface);
    font-size: 15px;
    font-weight: 700;
  }
  .bouton-renfort {
    padding: 14px 18px;
    border-radius: 18px;
    border: 0;
    background: var(--texte);
    color: var(--encre);
    font-size: 19px;
    font-weight: 700;
  }
  .bouton-renfort small {
    display: block;
    font-size: 13.5px;
    font-weight: 400;
    opacity: 0.7;
  }

  /* Final */
  .final {
    align-items: center;
    text-align: center;
    padding-top: max(22px, env(safe-area-inset-top));
  }
  .final .logo {
    background: linear-gradient(90deg, #ff4545, #ff9a1f, #ffe03a, #2fd673, #3d8bff, #a66bff, #ff86c8);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .resume {
    color: var(--texte-2);
    font-size: 17px;
  }
  .merci {
    font-size: 16.5px;
    padding: 0 8px 8px;
  }
  .final .zone-grille {
    width: 100%;
  }

  .hors-ligne {
    position: fixed;
    top: max(6px, env(safe-area-inset-top));
    left: 50%;
    translate: -50% 0;
    padding: 6px 16px;
    border-radius: 99px;
    background: var(--alerte);
    color: var(--encre);
    font-weight: 700;
    font-size: 14px;
    z-index: 40;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  }

  /* Volet d'aide */
  .voile {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 20;
  }
  .aide {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    max-height: 86vh;
    max-height: 86dvh;
    overflow-y: auto;
    padding: 20px 18px max(20px, env(safe-area-inset-bottom));
    border-radius: 24px 24px 0 0;
    background: var(--surface);
    border-top: 1px solid var(--trait-fort);
    z-index: 21;
    animation: volet 0.28s ease-out both;
  }
  @keyframes volet {
    from {
      transform: translateY(100%);
    }
  }
  .aide h3 {
    font-family: var(--titre);
    font-size: 21px;
    margin: 4px 0 10px;
  }
  .aide h3:not(:first-of-type) {
    margin-top: 20px;
  }
  .fermer {
    position: sticky;
    top: 0;
    float: right;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 0;
    background: var(--surface-3);
    font-size: 24px;
    line-height: 1;
  }
  .liste-enigmes {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 10px;
  }
  .liste-enigmes li {
    display: grid;
    grid-template-columns: 30px 1fr;
    gap: 10px;
    align-items: start;
    font-size: 16px;
  }
  .liste-enigmes li.trouve {
    color: var(--texte-3);
  }
  .puce {
    width: 30px;
    font-size: 30px;
  }
  .indice-liste {
    color: var(--alerte);
    font-size: 14.5px;
  }
  .lexique {
    margin: 0;
    display: grid;
    gap: 2px;
  }
  .lexique dt {
    font-weight: 700;
    margin-top: 6px;
  }
  .lexique dd {
    margin: 0;
    color: var(--texte-2);
    font-size: 15px;
  }
  .note-grille {
    margin-top: 18px;
    padding-top: 12px;
    border-top: 1px solid var(--trait);
    color: var(--texte-3);
    font-size: 14px;
  }

  /* Téléphone tenu en paysage : le texte à gauche, la grille à droite sur toute la hauteur. */
  @media (orientation: landscape) and (max-height: 520px) {
    .jeu,
    .final {
      --cote: min(50vw, calc(100vh - 12px));
      position: relative;
      align-items: stretch;
      text-align: left;
      padding-right: calc(var(--cote) + 22px);
      overflow-y: auto;
    }
    .jeu .zone-grille,
    .final .zone-grille {
      position: absolute;
      top: 6px;
      right: 8px;
      bottom: 6px;
      width: var(--cote);
      flex: none;
    }
    .bandeau {
      margin-right: 0;
      border-radius: 0 0 12px 0;
    }
    .bouton-aide {
      align-self: flex-start;
    }
    .pied {
      text-align: left;
    }
  }

  @supports (height: 100dvh) {
    @media (orientation: landscape) and (max-height: 520px) {
      .jeu,
      .final {
        --cote: min(50vw, calc(100dvh - 12px));
      }
    }
  }

  @media (max-height: 620px) {
    .astuce,
    .repere {
      display: none;
    }
    main {
      gap: 6px;
      padding-top: max(6px, env(safe-area-inset-top));
      padding-bottom: max(6px, env(safe-area-inset-bottom));
    }
    .bandeau {
      padding: 4px 14px;
    }
    .mini-jeton {
      width: 26px;
      font-size: 26px;
    }
    .bandeau .nom {
      font-size: 18px;
    }
    .minuteur h2,
    .secondes {
      font-size: 24px;
    }
    .barre {
      height: 6px;
    }
    .enigme {
      padding: 7px 12px;
    }
    .pied {
      min-height: 0;
    }
    .bouton-aide {
      padding: 5px 14px;
      font-size: 14px;
    }
    .consigne,
    .verdict {
      padding: 8px 12px;
    }
    .consigne h2,
    .verdict h2 {
      font-size: 21px;
    }
    .logo {
      font-size: 34px;
    }
    .grand-jeton {
      width: 64px;
      font-size: 64px;
    }
  }
</style>
