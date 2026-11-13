<script lang="ts">
  /**
   * La régie : lancer, mettre en pause, corriger, donner des indices, révéler,
   * régler les durées, préparer le scénario, répéter avec des joueurs simulés.
   */
  import QRCode from 'qrcode';
  import { onMount } from 'svelte';
  import { INFOS, Le, type Couleur } from '../../shared/couleurs';
  import type { Case } from '../../shared/grille';
  import { PIN_MAX, PIN_MIN, type ActionRegie } from '../../shared/protocole';
  import type { Durees, Mouvement, OptionsScenario, Scenario } from '../../shared/types';
  import Grille from '../composants/Grille.svelte';
  import Infos from '../composants/Infos.svelte';
  import Jeton from '../composants/Jeton.svelte';
  import { Connexion } from '../lib/connexion.svelte';
  import { minutesSecondes, pluriel } from '../lib/format';
  import { demarrerHorloge, horloge } from '../lib/horloge.svelte';
  import Acces from './regie/Acces.svelte';
  import EditeurScenario from './regie/EditeurScenario.svelte';

  const c = new Connexion('regie');
  demarrerHorloge();

  const adresse = `${location.origin}/`;
  let qr = $state('');

  type Onglet = 'equipes' | 'reglages' | 'scenario' | 'repetition' | 'acces' | 'journal';
  let onglet = $state<Onglet>('equipes');
  let selection = $state<Couleur | null>(null);
  let modeClic = $state<'deplacer' | 'voter'>('deplacer');
  let confirmation = $state<null | { titre: string; texte: string; choix: Array<{ libelle: string; action: ActionRegie; danger?: boolean }> }>(null);
  let nouveauPin = $state('');

  const etat = $derived(c.etat);
  const r = $derived(c.regie);
  const enJeu = $derived(etat?.phase === 'vote' || etat?.phase === 'affichage' || etat?.phase === 'deplacement');
  const reste = $derived(
    !etat ? null : etat.pause !== null ? etat.pause : etat.finPhase === null ? null : Math.max(0, etat.finPhase - (horloge.t + c.decalage)),
  );
  const tempsJeu = $derived(c.tempsJeu(horloge.t));
  const dureeCible = $derived((r?.scenario.dureeCible ?? 0) * 1000);
  const depasse = $derived(enJeu && dureeCible > 0 && tempsJeu > dureeCible);
  const restants = $derived(etat?.pions.filter((p) => !p.absent && !p.verrouille) ?? []);
  const cibles = $derived(r ? Object.fromEntries(r.scenario.pions.map((p) => [p.couleur, p.cible])) : null);
  const choixRegie = $derived(r ? Object.fromEntries(Object.entries(r.pions).map(([couleur, pion]) => [couleur, pion?.choixRegie ?? null])) : null);
  const pionChoisi = $derived(selection && etat ? (etat.pions.find((p) => p.couleur === selection) ?? null) : null);

  const NOMS_PHASE: Record<string, string> = {
    accueil: 'Accueil',
    vote: 'Vote',
    affichage: 'Résultat',
    deplacement: 'Déplacement',
    final: 'Final',
  };

  onMount(() => {
    void QRCode.toString(adresse, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }).then((svg) => (qr = svg));
    const clavier = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement | null;
      if (!r || !enJeu || confirmation || (cible && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(cible.tagName))) return;
      if (e.code === 'Space') {
        e.preventDefault();
        c.action({ a: etat?.pause !== null ? 'reprendre' : 'pause' });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        c.action({ a: 'suivant' });
      } else if (e.key === '+') {
        c.action({ a: 'prolonger', secondes: 10 });
      }
    };
    window.addEventListener('keydown', clavier);
    return () => {
      window.removeEventListener('keydown', clavier);
      c.fermer();
    };
  });

  function demanderFin(): void {
    confirmation = {
      titre: 'Révéler les pions restants ?',
      texte: `${pluriel(restants.length, 'pion')} ${restants.length > 1 ? 'iront' : 'ira'} directement sur ${restants.length > 1 ? 'leur' : 'sa'} case, puis la partie se terminera.`,
      choix: [{ libelle: 'Révéler et terminer', action: { a: 'terminer' } }],
    };
  }

  function demanderReinitialisation(): void {
    confirmation = {
      titre: 'Revenir à l’accueil ?',
      texte: 'La partie en cours sera effacée. Les musiciens reprennent leur case de départ.',
      choix: [
        { libelle: 'Rejouer avec les mêmes équipes', action: { a: 'reinitialiser', joueurs: false } },
        { libelle: 'Tout remettre à zéro (nouveau public)', action: { a: 'reinitialiser', joueurs: true }, danger: true },
      ],
    };
  }

  function confirmer(action: ActionRegie): void {
    confirmation = null;
    selection = null;
    c.action(action);
  }

  function surPion(couleur: Couleur): void {
    selection = selection === couleur ? null : couleur;
  }

  function surCase(cas: Case): void {
    if (!selection) return;
    if (modeClic === 'voter') c.action({ a: 'choisir', couleur: selection, case: cas });
    else c.action({ a: 'deplacer', couleur: selection, case: cas });
  }

  function reglerDuree(champ: keyof Durees, valeur: string): void {
    const secondes = Number(valeur);
    if (Number.isFinite(secondes)) c.action({ a: 'reglages', reglages: { durees: { [champ]: secondes } } });
  }

  function reglerOption(champ: keyof OptionsScenario, valeur: boolean | number): void {
    c.action({ a: 'reglages', reglages: { options: { [champ]: valeur } } });
  }

  function teteDuVote(couleur: Couleur): string {
    const urne = Object.entries(r?.votes[couleur] ?? {}).sort((a, b) => b[1] - a[1]);
    if (urne.length === 0) return '—';
    return urne
      .slice(0, 3)
      .map(([cas, voix]) => `${cas} ×${voix}`)
      .join('  ');
  }

  function resume(m: Mouvement): string {
    const trajet = m.vers === m.de ? `reste en ${m.de}` : `${m.de} → ${m.vers}`;
    const issue = m.verrouille ? (m.revele ? 'révélé' : m.chance ? 'par chance' : 'trouvé') : m.issue === 'sansVote' ? 'pas de vote' : m.dispute ? `voulait ${m.choix}, case prise` : 'raté';
    const voix = m.votants > 0 ? ` (${m.voix}/${m.votants} voix)` : '';
    return `${trajet} · ${issue}${voix}`;
  }

  function changerPin(evenement: SubmitEvent): void {
    evenement.preventDefault();
    c.action({ a: 'changerPin', pin: nouveauPin });
    nouveauPin = '';
  }

  const DUREES: Array<{ champ: keyof Durees; nom: string; aide: string }> = [
    { champ: 'premierVote', nom: 'Premier vote', aide: 'plus long : le public découvre son énigme' },
    { champ: 'vote', nom: 'Vote', aide: 'manches suivantes' },
    { champ: 'affichage', nom: 'Résultat', aide: 'les musiciens anticipent leur déplacement' },
    { champ: 'deplacement', nom: 'Déplacement', aide: 'les musiciens changent de case' },
  ];
</script>

{#if !r || !etat}
  <Acces {c} />
{:else}
  <main class="regie">
    <header class="entete">
      <h1>Tutti <span>Régie</span></h1>
      <div class="indicateur phase" data-phase={etat.phase}>
        <small>Phase</small>
        <b>{etat.pause !== null ? 'Pause' : NOMS_PHASE[etat.phase]}{enJeu ? ` · manche ${etat.manche}` : ''}</b>
      </div>
      <div class="indicateur" class:alerte={etat.attenteRegie}>
        <small>Chrono</small>
        <b class="chiffres">{etat.attenteRegie ? 'En attente' : reste === null ? '—' : `${Math.ceil(reste / 1000)} s`}</b>
      </div>
      <div class="indicateur" class:alerte={depasse}>
        <small>Temps de jeu</small>
        <b class="chiffres">{minutesSecondes(tempsJeu)}{dureeCible > 0 ? ` / ${minutesSecondes(dureeCible)}` : ''}</b>
      </div>
      <div class="indicateur">
        <small>Joueurs</small>
        <b class="chiffres" data-joueurs={etat.joueurs}>{etat.joueurs}{r.simules > 0 ? ` (dont ${r.simules} simulés)` : ''}</b>
      </div>
      <span class="liaison" class:coupee={!c.enLigne}>{c.enLigne ? 'Connecté' : 'Reconnexion…'}</span>
    </header>

    {#if depasse}
      <div class="bandeau-alerte" role="alert">
        <span>Durée visée dépassée ({minutesSecondes(dureeCible)}). Il reste {pluriel(restants.length, 'pion')} à placer.</span>
        <button onclick={demanderFin}>Révéler les pions restants</button>
      </div>
    {/if}

    <section class="pilotage">
      <div class="commandes">
        {#if etat.phase === 'accueil'}
          <button class="geant" onclick={() => c.action({ a: 'lancer' })} data-action="lancer">▶ Lancer la partie</button>
          <p class="aide">{pluriel(etat.joueurs, 'joueur')} {etat.joueurs > 1 ? 'connectés' : 'connecté'}. Les énigmes apparaîtront au lancement.</p>
        {:else if etat.phase === 'final'}
          <p class="fin">Partie terminée en {pluriel(etat.manche, 'manche')} · {minutesSecondes(tempsJeu)}</p>
          <button class="geant" onclick={demanderReinitialisation} data-action="reinitialiser">Revenir à l’accueil</button>
        {:else}
          <div class="transport">
            {#if etat.pause !== null}
              <button class="gros accent" onclick={() => c.action({ a: 'reprendre' })} data-action="reprendre">▶ Reprendre <kbd>Espace</kbd></button>
            {:else}
              <button class="gros" onclick={() => c.action({ a: 'pause' })} data-action="pause">⏸ Pause <kbd>Espace</kbd></button>
            {/if}
            <button class="gros" class:accent={etat.attenteRegie} onclick={() => c.action({ a: 'suivant' })} data-action="suivant">⏭ Phase suivante <kbd>→</kbd></button>
            <button class="gros" onclick={() => c.action({ a: 'prolonger', secondes: 10 })} data-action="prolonger">+10 s <kbd>+</kbd></button>
          </div>
          <label class="bascule">
            <input type="checkbox" checked={r.avanceAuto} onchange={(e) => c.action({ a: 'reglages', reglages: { avanceAuto: e.currentTarget.checked } })} />
            Enchaîner les phases automatiquement
            <small>Décoché : chaque phase attend « Phase suivante ».</small>
          </label>
          <div class="fins">
            <button onclick={demanderFin} disabled={restants.length === 0} data-action="terminer">Révéler les pions restants</button>
            <button onclick={demanderReinitialisation} data-action="reinitialiser">Revenir à l’accueil</button>
          </div>
        {/if}
      </div>

      <div class="plateau">
        <Grille
          pions={etat.pions}
          silhouette={etat.silhouette}
          phase={etat.phase}
          mouvements={etat.mouvements}
          {cibles}
          {selection}
          {choixRegie}
          surPion={enJeu ? surPion : undefined}
          surCase={enJeu && selection ? surCase : undefined}
        />
        {#if enJeu}
          <div class="correction">
            {#if pionChoisi && selection}
              <p>
                <span class="puce"><Jeton couleur={selection} verrouille={pionChoisi.verrouille} /></span>
                <b>{Le(selection)}</b> est en {pionChoisi.position}{pionChoisi.verrouille ? ' (en place)' : ''}.
              </p>
              {#if pionChoisi.absent}
                <p class="aide">Ce musicien est absent : son pion ne bouge pas.</p>
              {:else if pionChoisi.verrouille}
                <button onclick={() => selection && c.action({ a: 'deverrouiller', couleur: selection })}>Déverrouiller ce pion</button>
              {:else}
                <div class="modes" role="radiogroup" aria-label="Effet d’un clic sur une case">
                  <label><input type="radio" bind:group={modeClic} value="deplacer" /> Cliquer une case le <b>déplace tout de suite</b></label>
                  <label class:inactif={etat.phase !== 'vote'}>
                    <input type="radio" bind:group={modeClic} value="voter" disabled={etat.phase !== 'vote'} /> Cliquer une case <b>vote à la place de l’équipe</b>
                  </label>
                </div>
                {#if r.pions[selection]?.choixRegie}
                  <button onclick={() => selection && c.action({ a: 'choisir', couleur: selection, case: null })}>Annuler le vote de la régie</button>
                {/if}
              {/if}
            {:else}
              <p class="aide">Cliquez un pion pour le corriger. Les petits points indiquent les cases à trouver (visibles ici seulement).</p>
            {/if}
          </div>
        {:else if etat.phase === 'accueil'}
          <p class="aide">Position de départ. Les petits points indiquent les cases à trouver (visibles ici seulement).</p>
        {/if}
      </div>
    </section>

    <nav class="onglets" aria-label="Sections de la régie">
      {#each [['equipes', 'Équipes'], ['reglages', 'Réglages'], ['scenario', 'Scénario'], ['repetition', 'Répétition'], ['acces', 'Accès'], ['journal', 'Journal']] as [id, nom] (id)}
        <button class:actif={onglet === id} onclick={() => (onglet = id as Onglet)} data-onglet={id}>{nom}</button>
      {/each}
    </nav>

    <section class="panneau">
      {#if onglet === 'equipes'}
        <table class="equipes">
          <thead>
            <tr><th>Équipe</th><th>Joueurs</th><th>Vote en cours</th><th>Échecs</th><th>Indices</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {#each r.scenario.pions as pion (pion.couleur)}
              {@const p = r.pions[pion.couleur]}
              {@const stats = r.equipes[pion.couleur]}
              <tr class:placee={p?.verrouille && !pion.absent} class:absente={pion.absent} style:--couleur={INFOS[pion.couleur].hex} data-equipe={pion.couleur}>
                <td>
                  <span class="nom-equipe">
                    <span class="puce"><Jeton couleur={pion.couleur} verrouille={p?.verrouille && !pion.absent} absent={pion.absent} /></span>
                    <b>{INFOS[pion.couleur].nom}</b>
                    {#if pion.absent}<em>absent</em>{:else if p?.verrouille}<em>en place</em>{:else if p?.reveler}<em>sera révélé</em>{/if}
                  </span>
                </td>
                <td class="chiffres">
                  {#if !pion.absent}{(stats?.connectes ?? 0) + (stats?.simules ?? 0)}{#if stats && stats.inscrits > stats.connectes}<small> (+{stats.inscrits - stats.connectes} partis)</small>{/if}{/if}
                </td>
                <td class="chiffres">
                  {#if etat.phase === 'vote' && p && !p.verrouille}
                    {#if p.choixRegie}régie : {p.choixRegie}{:else}{stats?.votants ?? 0} votants · {teteDuVote(pion.couleur)}{/if}
                  {/if}
                </td>
                <td class="chiffres">{pion.absent || !enJeu ? '' : (p?.echecs ?? 0)}</td>
                <td class="chiffres">{pion.absent ? '' : `${p?.indices ?? 0} / ${pion.indices.length}`}</td>
                <td class="actions">
                  {#if etat.phase === 'accueil'}
                    <label class="bascule-ligne">
                      <input type="checkbox" checked={pion.absent} onchange={(e) => c.action({ a: 'absent', couleur: pion.couleur, absent: e.currentTarget.checked })} data-absent={pion.couleur} />
                      Musicien absent
                    </label>
                  {:else if enJeu && p && !p.verrouille && !pion.absent}
                    <button disabled={p.indices >= pion.indices.length} onclick={() => c.action({ a: 'indice', couleur: pion.couleur })} data-indice={pion.couleur}>Donner un indice</button>
                    <button class:accent={p.reveler} onclick={() => c.action({ a: 'reveler', couleur: pion.couleur, actif: !p.reveler })} data-reveler={pion.couleur}>
                      {p.reveler ? 'Annuler la révélation' : 'Révéler à la prochaine manche'}
                    </button>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
        {#if etat.phase === 'accueil'}
          <p class="aide marge">
            Un musicien absent ? Cochez la case : son pion reste « fantôme » sur sa case, les énigmes restent justes et son équipe est répartie dans les autres.
          </p>
          <button onclick={() => c.action({ a: 'reequilibrer' })}>Refaire les équipes au hasard</button>
        {/if}
      {:else if onglet === 'reglages'}
        <div class="reglages">
          <fieldset>
            <legend>Durées (en secondes)</legend>
            {#each DUREES as d (d.champ)}
              <label class="ligne">
                <span>{d.nom}<small>{d.aide}</small></span>
                <input type="number" min="2" max="300" value={r.scenario.durees[d.champ]} onchange={(e) => reglerDuree(d.champ, e.currentTarget.value)} data-duree={d.champ} />
              </label>
            {/each}
            <label class="ligne">
              <span>Durée visée de la partie<small>au-delà, la régie est invitée à révéler les pions restants (0 = pas d’alerte)</small></span>
              <input type="number" min="0" max="3600" step="10" value={r.scenario.dureeCible} onchange={(e) => c.action({ a: 'reglages', reglages: { dureeCible: Number(e.currentTarget.value) } })} />
            </label>
            <p class="aide">
              Une manche dure {r.scenario.durees.vote + r.scenario.durees.affichage + r.scenario.durees.deplacement} s. Les durées peuvent être modifiées pendant la partie.
            </p>
          </fieldset>
          <fieldset>
            <legend>Règles</legend>
            <label class="case-a-cocher"><input type="checkbox" checked={r.scenario.options.afficherSilhouette} onchange={(e) => reglerOption('afficherSilhouette', e.currentTarget.checked)} /> Montrer la silhouette de la figure (cases en pointillés)</label>
            <label class="case-a-cocher"><input type="checkbox" checked={r.scenario.options.enigmesPubliques} onchange={(e) => reglerOption('enigmesPubliques', e.currentTarget.checked)} /> Afficher toutes les énigmes sur le grand écran</label>
            <label class="case-a-cocher"><input type="checkbox" checked={r.scenario.options.voteLibre} disabled={!r.scenario.options.afficherSilhouette} onchange={(e) => reglerOption('voteLibre', e.currentTarget.checked)} /> Autoriser le vote sur toutes les cases (sinon : seulement la silhouette)</label>
            <label class="case-a-cocher"><input type="checkbox" checked={r.scenario.options.renfort} onchange={(e) => reglerOption('renfort', e.currentTarget.checked)} /> Une équipe qui a trouvé peut aider les autres</label>
            <label class="ligne">
              <span>Révéler un indice tous les…<small>échecs d’une équipe (0 = seulement à la main)</small></span>
              <input type="number" min="0" max="10" value={r.scenario.options.echecsParIndice} onchange={(e) => reglerOption('echecsParIndice', Number(e.currentTarget.value))} />
            </label>
            <label class="case-a-cocher"><input type="checkbox" checked={r.avanceAuto} onchange={(e) => c.action({ a: 'reglages', reglages: { avanceAuto: e.currentTarget.checked } })} /> Enchaîner les phases automatiquement</label>
          </fieldset>
        </div>
      {:else if onglet === 'scenario'}
        <EditeurScenario
          scenario={r.scenario}
          modifiable={etat.phase === 'accueil'}
          surEnregistrer={(scenario: Scenario) => c.action({ a: 'scenario', scenario })}
          surDefaut={() => c.action({ a: 'scenarioDefaut' })}
          surMessage={(texte, erreur) => c.informer(texte, erreur)}
        />
      {:else if onglet === 'repetition'}
        <div class="repetition">
          <h3>Joueurs simulés</h3>
          <p class="aide">
            Pour répéter sans public : des joueurs fictifs rejoignent les équipes et votent tout seuls, à peu près comme un vrai public. Pensez à les retirer avant le concert.
          </p>
          <div class="simules">
            {#each [0, 14, 49, 98] as n (n)}
              <button class:actif={r.simules === n} onclick={() => c.action({ a: 'simules', nombre: n })} data-simules={n}>{n === 0 ? 'Aucun' : n}</button>
            {/each}
            <label>Autre nombre <input type="number" min="0" max="300" value={r.simules} onchange={(e) => c.action({ a: 'simules', nombre: Number(e.currentTarget.value) })} /></label>
          </div>
          <h3>Sans réseau dans la salle ?</h3>
          <p class="aide">
            Le public vote à main levée et la régie joue pour lui : pendant le vote, cliquez un pion sur la grille, choisissez « vote à la place de l’équipe », puis cliquez la case.
          </p>
        </div>
      {:else if onglet === 'acces'}
        <div class="acces">
          <div>
            <h3>Pour le public</h3>
            <div class="qr">{@html qr}</div>
            <p class="lien"><a href={adresse} target="_blank" rel="noopener">{adresse}</a></p>
            <p class="aide">Ce QR code s’affiche aussi sur le grand écran avant le lancement.</p>
          </div>
          <div>
            <h3>Grand écran</h3>
            <p class="lien"><a href="/ecran" target="_blank" rel="noopener">{location.origin}/ecran</a></p>
            <p class="aide">À ouvrir sur l’ordinateur relié au vidéoprojecteur, en plein écran (touche F11).</p>
            <h3>Code de la régie</h3>
            {#if r.pinImpose}
              <p class="aide">Le code est défini dans la configuration du serveur.</p>
            {:else}
              <form class="pin" onsubmit={changerPin}>
                <input type="password" bind:value={nouveauPin} placeholder="Nouveau code" minlength={PIN_MIN} maxlength={PIN_MAX} autocomplete="new-password" />
                <button type="submit" disabled={nouveauPin.length < PIN_MIN}>Changer le code</button>
              </form>
            {/if}
            <button onclick={() => c.deconnecterRegie()}>Quitter la régie sur cet appareil</button>
          </div>
        </div>
      {:else}
        {#if r.journal.length === 0}
          <p class="aide">Le journal se remplit à chaque manche.</p>
        {:else}
          <ol class="journal">
            {#each [...r.journal].reverse() as entree (entree.manche)}
              <li>
                <b>Manche {entree.manche}</b>
                <ul>
                  {#each entree.mouvements as m (m.couleur)}
                    <li style:--couleur={INFOS[m.couleur].hex}><span>{INFOS[m.couleur].nom}</span> {resume(m)}</li>
                  {/each}
                </ul>
              </li>
            {/each}
          </ol>
        {/if}
      {/if}
    </section>
  </main>
{/if}

{#if confirmation}
  <div class="voile" role="presentation" onclick={() => (confirmation = null)}></div>
  <div class="dialogue" role="alertdialog" aria-modal="true" aria-label={confirmation.titre}>
    <h2>{confirmation.titre}</h2>
    <p>{confirmation.texte}</p>
    <div class="choix">
      {#each confirmation.choix as choix (choix.libelle)}
        <button class:danger={choix.danger} class:accent={!choix.danger} onclick={() => confirmer(choix.action)} data-confirmer={choix.action.a}>{choix.libelle}</button>
      {/each}
      <button onclick={() => (confirmation = null)}>Annuler</button>
    </div>
  </div>
{/if}

<Infos infos={c.infos} />

<style>
  .regie {
    min-height: 100dvh;
    max-width: 1280px;
    margin: 0 auto;
    padding: 14px 18px 40px;
    display: grid;
    gap: 14px;
    align-content: start;
  }
  h1 {
    font-family: var(--titre);
    font-weight: 800;
    font-size: 26px;
    margin-right: auto;
  }
  h1 span {
    font-weight: 400;
    color: var(--texte-2);
  }
  h3 {
    font-family: var(--titre);
    font-size: 18px;
    margin: 0 0 8px;
  }
  .aide {
    color: var(--texte-2);
    font-size: 14.5px;
  }
  .aide.marge {
    margin: 12px 0;
  }
  .chiffres {
    font-variant-numeric: tabular-nums;
  }

  .entete {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
  .indicateur {
    display: grid;
    padding: 6px 14px;
    border-radius: 12px;
    background: var(--surface);
    border: 1px solid var(--trait);
    min-width: 96px;
  }
  .indicateur small {
    font-size: 11.5px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--texte-3);
  }
  .indicateur b {
    font-size: 18px;
  }
  .indicateur.alerte {
    border-color: var(--alerte);
    background: color-mix(in srgb, var(--alerte) 20%, var(--surface));
  }
  .liaison {
    padding: 4px 12px;
    border-radius: 99px;
    font-size: 13px;
    font-weight: 700;
    background: color-mix(in srgb, var(--ok) 22%, var(--surface));
    color: var(--ok);
  }
  .liaison.coupee {
    background: var(--alerte);
    color: var(--encre);
  }
  .bandeau-alerte {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--alerte) 24%, var(--surface));
    border: 2px solid var(--alerte);
    font-weight: 700;
  }

  button {
    padding: 9px 14px;
    border-radius: 10px;
    border: 1px solid var(--trait-fort);
    background: var(--surface-2);
    font-size: 15px;
    font-weight: 700;
  }
  button:disabled {
    opacity: 0.4;
  }
  button.accent,
  button.actif {
    background: var(--texte);
    color: var(--encre);
    border-color: transparent;
  }
  button.danger {
    background: var(--danger);
    color: var(--encre);
    border-color: transparent;
  }
  kbd {
    margin-left: 6px;
    padding: 1px 6px;
    border-radius: 5px;
    border: 1px solid currentColor;
    font: inherit;
    font-size: 12px;
    font-weight: 400;
    opacity: 0.6;
  }

  .pilotage {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 400px);
    gap: 18px;
    align-items: start;
    padding: 16px;
    border-radius: 18px;
    background: var(--surface);
    border: 1px solid var(--trait);
  }
  .commandes {
    display: grid;
    gap: 14px;
  }
  .geant {
    padding: 26px;
    border-radius: 18px;
    border: 0;
    background: var(--texte);
    color: var(--encre);
    font-family: var(--titre);
    font-size: 30px;
  }
  .fin {
    font-family: var(--titre);
    font-size: 22px;
    font-weight: 700;
  }
  .transport {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  .gros {
    padding: 22px 10px;
    border-radius: 14px;
    font-size: 18px;
  }
  .bascule {
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 10px;
    align-items: center;
    font-weight: 700;
  }
  .bascule small {
    grid-column: 2;
    font-weight: 400;
    color: var(--texte-2);
  }
  input[type='checkbox'],
  input[type='radio'] {
    width: 20px;
    height: 20px;
    accent-color: #fff;
  }
  .fins {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .plateau {
    display: grid;
    gap: 10px;
  }
  .correction {
    display: grid;
    gap: 8px;
    font-size: 14.5px;
  }
  .correction p {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .puce {
    display: inline-block;
    width: 26px;
    font-size: 26px;
    flex: none;
  }
  .modes {
    display: grid;
    gap: 6px;
  }
  .modes label {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .modes .inactif {
    opacity: 0.45;
  }

  .onglets {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    border-bottom: 1px solid var(--trait);
    padding-bottom: 10px;
  }
  .onglets button {
    border-radius: 99px;
    background: transparent;
  }
  .onglets button.actif {
    background: var(--texte);
    color: var(--encre);
  }
  .panneau {
    min-width: 0;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 15px;
  }
  th {
    text-align: left;
    padding: 6px 10px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--texte-3);
  }
  td {
    padding: 8px 10px;
    border-top: 1px solid var(--trait);
    vertical-align: middle;
  }
  tr.placee td,
  tr.absente td {
    color: var(--texte-3);
  }
  .nom-equipe {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .nom-equipe b {
    text-transform: uppercase;
    color: var(--couleur);
    font-family: var(--titre);
  }
  .nom-equipe em {
    padding: 1px 9px;
    border-radius: 99px;
    background: var(--surface-3);
    font-style: normal;
    font-size: 12.5px;
    color: var(--texte-2);
  }
  td small {
    color: var(--texte-3);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .actions button {
    padding: 6px 10px;
    font-size: 13.5px;
  }
  .bascule-ligne {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .reglages {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 16px;
  }
  fieldset {
    margin: 0;
    padding: 14px 16px;
    border-radius: 14px;
    border: 1px solid var(--trait);
    background: var(--surface);
    display: grid;
    gap: 12px;
    align-content: start;
  }
  legend {
    padding: 0 8px;
    font-family: var(--titre);
    font-weight: 700;
    font-size: 17px;
  }
  .ligne {
    display: grid;
    grid-template-columns: 1fr 96px;
    gap: 12px;
    align-items: center;
    font-weight: 700;
  }
  .ligne small {
    display: block;
    font-weight: 400;
    color: var(--texte-2);
  }
  input[type='number'],
  input[type='password'] {
    width: 100%;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--trait-fort);
    background: var(--fond-2);
    font-size: 16px;
  }
  .case-a-cocher {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .repetition {
    display: grid;
    gap: 10px;
    max-width: 720px;
  }
  .repetition h3:not(:first-child) {
    margin-top: 14px;
  }
  .simules {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .simules label {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--texte-2);
  }
  .simules input {
    width: 90px;
  }

  .acces {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 24px;
  }
  .acces > div {
    display: grid;
    gap: 10px;
    align-content: start;
    justify-items: start;
  }
  .qr {
    width: 200px;
    padding: 12px;
    border-radius: 14px;
    background: #fff;
  }
  .qr :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
  .lien a {
    color: var(--texte);
    font-weight: 700;
    word-break: break-all;
  }
  .pin {
    display: flex;
    gap: 8px;
  }

  .journal {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 12px;
  }
  .journal ul {
    margin: 4px 0 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 2px;
    color: var(--texte-2);
    font-size: 14.5px;
  }
  .journal span {
    display: inline-block;
    min-width: 64px;
    font-weight: 700;
    color: var(--couleur);
  }

  .voile {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    z-index: 30;
  }
  .dialogue {
    position: fixed;
    left: 50%;
    top: 50%;
    translate: -50% -50%;
    width: min(92vw, 460px);
    padding: 22px;
    border-radius: 18px;
    background: var(--surface);
    border: 1px solid var(--trait-fort);
    z-index: 31;
    display: grid;
    gap: 12px;
  }
  .dialogue h2 {
    font-family: var(--titre);
    font-size: 22px;
  }
  .dialogue p {
    color: var(--texte-2);
  }
  .choix {
    display: grid;
    gap: 8px;
  }
  .choix button {
    padding: 13px;
  }

  @media (max-width: 860px) {
    .pilotage {
      grid-template-columns: 1fr;
    }
    .plateau {
      max-width: 420px;
    }
    th:nth-child(4),
    td:nth-child(4) {
      display: none;
    }
  }
</style>
