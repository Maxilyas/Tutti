<script lang="ts">
  /**
   * Éditeur du scénario : cases de départ et à trouver, énigmes, indices.
   * Le vérificateur contrôle en direct que les énigmes sont vraies et ne
   * laissent qu'une seule solution.
   */
  import { untrack } from 'svelte';
  import { COULEURS, INFOS, Le, type Couleur } from '../../../shared/couleurs';
  import { CATALOGUE, COTES, TYPES_CONTRAINTE, proposerEnigme, verifierEnigmes, type Contrainte, type TypeContrainte } from '../../../shared/enigmes';
  import { CHIFFRES, LETTRES, TOUTES_LES_CASES, type Case } from '../../../shared/grille';
  import { departsEffectifs } from '../../../shared/regles';
  import { LIMITES, copier, validerScenario } from '../../../shared/scenario';
  import type { PionScenario, Scenario } from '../../../shared/types';
  import Jeton from '../../composants/Jeton.svelte';

  interface Props {
    /** Le scénario enregistré sur le serveur. */
    scenario: Scenario;
    /** Faux pendant une partie : le scénario ne se modifie qu'à l'accueil. */
    modifiable: boolean;
    surEnregistrer: (scenario: Scenario) => void;
    surDefaut: () => void;
    surMessage: (texte: string, erreur?: boolean) => void;
  }
  let { scenario, modifiable, surEnregistrer, surDefaut, surMessage }: Props = $props();

  let brouillon = $state<Scenario>(copier(untrack(() => scenario)));
  let modifie = $state(false);

  // Tant qu'on n'a rien modifié, le brouillon suit le serveur (absences, réglages…).
  $effect(() => {
    const serveur = scenario;
    if (!untrack(() => modifie)) brouillon = copier(serveur);
  });

  /** Le brouillon, complété par ce qui se règle ailleurs (absences, durées, options). */
  function complet(): Scenario {
    const b = $state.snapshot(brouillon) as Scenario;
    return {
      ...b,
      options: scenario.options,
      durees: scenario.durees,
      dureeCible: scenario.dureeCible,
      pions: b.pions.map((p) => ({ ...p, absent: scenario.pions.find((x) => x.couleur === p.couleur)?.absent ?? false })),
    };
  }

  const candidat = $derived(complet());
  const validation = $derived(validerScenario(candidat));
  const rapport = $derived(validation.ok ? verifierEnigmes(candidat.pions, candidat.options.afficherSilhouette) : null);
  const departs = $derived(departsEffectifs(candidat.pions));
  const libres = $derived(COULEURS.filter((couleur) => !brouillon.pions.some((p) => p.couleur === couleur)));

  function toucher(): void {
    modifie = true;
  }

  function parametresParDefaut(type: TypeContrainte, pion: Couleur): Contrainte {
    const c: Contrainte = { type };
    for (const parametre of CATALOGUE[type].parametres) {
      if (parametre === 'autre') c.autre = brouillon.pions.find((p) => p.couleur !== pion)?.couleur;
      if (parametre === 'n') c.n = 3;
      if (parametre === 'lettre') c.lettre = 'A';
      if (parametre === 'chiffre') c.chiffre = 1;
      if (parametre === 'cote') c.cote = 'haut';
    }
    return c;
  }

  function changerType(pion: PionScenario, index: number, type: TypeContrainte): void {
    pion.contraintes[index] = parametresParDefaut(type, pion.couleur);
    toucher();
  }

  function ajouterContrainte(pion: PionScenario): void {
    pion.contraintes.push(parametresParDefaut('aCote', pion.couleur));
    toucher();
  }

  function ajouterPion(couleur: Couleur): void {
    const prises = new Set(brouillon.pions.flatMap((p) => [p.depart, p.cible]));
    const disponibles = TOUTES_LES_CASES.filter((c) => !prises.has(c));
    brouillon.pions.push({
      couleur,
      depart: disponibles[0] ?? 'A1',
      cible: disponibles[1] ?? 'A2',
      enigme: '',
      contraintes: [],
      indices: [],
      absent: false,
    });
    toucher();
  }

  function supprimerPion(couleur: Couleur): void {
    brouillon.pions = brouillon.pions.filter((p) => p.couleur !== couleur);
    for (const p of brouillon.pions) p.contraintes = p.contraintes.filter((c) => c.autre !== couleur);
    toucher();
  }

  function enregistrer(): void {
    if (!validation.ok) return;
    surEnregistrer(validation.scenario);
    modifie = false;
  }

  function annuler(): void {
    brouillon = copier(scenario);
    modifie = false;
  }

  function exporter(): void {
    const contenu = JSON.stringify(validation.ok ? validation.scenario : candidat, null, 2);
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(new Blob([contenu], { type: 'application/json' }));
    lien.download = 'tutti-scenario.json';
    lien.click();
    setTimeout(() => URL.revokeObjectURL(lien.href), 2000);
  }

  async function importer(evenement: Event): Promise<void> {
    const champ = evenement.currentTarget as HTMLInputElement;
    const fichier = champ.files?.[0];
    champ.value = '';
    if (!fichier) return;
    try {
      const resultat = validerScenario(JSON.parse(await fichier.text()));
      if (!resultat.ok) return surMessage(`Fichier refusé. ${resultat.erreurs.join(' ')}`, true);
      brouillon = resultat.scenario;
      modifie = true;
      surMessage('Scénario importé : vérifiez-le puis enregistrez.');
    } catch {
      surMessage('Ce fichier n’est pas un scénario Tutti.', true);
    }
  }

  function indicesEnTexte(pion: PionScenario): string {
    return pion.indices.join('\n');
  }

  function texteEnIndices(pion: PionScenario, texte: string): void {
    pion.indices = texte
      .split('\n')
      .map((ligne) => ligne.trim())
      .filter(Boolean)
      .slice(0, LIMITES.indices);
    toucher();
  }
</script>

{#snippet miniGrille(titre: string, positions: Partial<Record<Couleur, Case>>)}
  <figure class="mini">
    <figcaption>{titre}</figcaption>
    <div class="mini-plateau">
      <span></span>
      {#each LETTRES as lettre (lettre)}<span class="axe">{lettre}</span>{/each}
      {#each CHIFFRES as chiffre, rang (chiffre)}
        <span class="axe">{chiffre}</span>
        {#each LETTRES as lettre (lettre)}
          {@const nom = `${lettre}${rang + 1}`}
          {@const occupant = brouillon.pions.find((p) => positions[p.couleur] === nom)}
          <span class="mini-case" title={nom}>
            {#if occupant}<Jeton couleur={occupant.couleur} absent={candidat.pions.find((p) => p.couleur === occupant.couleur)?.absent} />{/if}
          </span>
        {/each}
      {/each}
    </div>
  </figure>
{/snippet}

<div class="editeur" class:fige={!modifiable}>
  {#if !modifiable}
    <p class="note">Le scénario ne se modifie qu’avant le lancement. Utilisez « Réinitialiser » pour revenir à l’accueil.</p>
  {/if}

  <div class="haut">
    <div class="apercus">
      {@render miniGrille('Départ', departs)}
      {@render miniGrille('Figure à trouver', Object.fromEntries(brouillon.pions.map((p) => [p.couleur, p.cible])))}
    </div>

    <section class="verificateur" aria-live="polite">
      <h3>Vérificateur d’énigmes</h3>
      {#if !validation.ok}
        <ul class="problemes">
          {#each validation.erreurs as erreur (erreur)}<li>{erreur}</li>{/each}
        </ul>
      {:else if rapport}
        {#if rapport.unique}
          <p class="verdict ok" data-verif="unique">✓ Solution unique : les énigmes désignent exactement la figure.</p>
        {:else if rapport.fausses.length > 0}
          <p class="verdict ko" data-verif="fausse">✕ Énigme fausse : la figure ne la respecte pas.</p>
          <ul class="problemes">
            {#each rapport.fausses as fausse (fausse.phrase)}<li>{fausse.phrase}</li>{/each}
          </ul>
        {:else if rapport.plafonne}
          <p class="verdict ko" data-verif="multiple">✕ Beaucoup trop de solutions possibles : les énigmes ne suffisent pas.</p>
        {:else}
          <p class="verdict ko" data-verif="multiple">
            ✕ {rapport.nbSolutions} solutions possibles. Pions interchangeables : {rapport.ambigus.map((c) => INFOS[c].nom).join(', ')}.
          </p>
          {#each rapport.alternatives.slice(0, 1) as autre, i (i)}
            <p class="exemple">
              Par exemple : {rapport.ambigus.map((c) => `${INFOS[c].nom} en ${autre[c]}`).join(', ')}. Ajoutez une précision à l’une de ces énigmes.
            </p>
          {/each}
        {/if}
        {#if rapport.sansContrainte.length > 0}
          <p class="exemple">
            Sans contrainte (non vérifié) : {rapport.sansContrainte.map((c) => INFOS[c].nom).join(', ')}.
          </p>
        {/if}
        {#if !scenario.options.afficherSilhouette}
          <p class="exemple">La silhouette est cachée : les pions peuvent aller sur les 25 cases.</p>
        {/if}
      {/if}
      {#each candidat.pions.filter((p) => !p.absent && departs[p.couleur] !== p.depart) as p (p.couleur)}
        <p class="exemple">
          {Le(p.couleur)} démarrera en {departs[p.couleur]} : sa case de départ ({p.depart}) est occupée par un pion absent.
        </p>
      {/each}
    </section>
  </div>

  <fieldset disabled={!modifiable}>
    <div class="titres">
      <label>Titre<input type="text" bind:value={brouillon.titre} maxlength={LIMITES.titre} oninput={toucher} /></label>
      <label>Sous-titre<input type="text" bind:value={brouillon.sousTitre} maxlength={LIMITES.titre} oninput={toucher} /></label>
    </div>

    {#each brouillon.pions as pion (pion.couleur)}
      <article class="pion" style:--couleur={INFOS[pion.couleur].hex} data-pion={pion.couleur}>
        <header>
          <span class="jeton"><Jeton couleur={pion.couleur} /></span>
          <h4>{INFOS[pion.couleur].nom}</h4>
          <label class="court">Départ
            <select bind:value={pion.depart} onchange={toucher} name="depart">
              {#each TOUTES_LES_CASES as c (c)}<option value={c}>{c}</option>{/each}
            </select>
          </label>
          <label class="court">À trouver
            <select bind:value={pion.cible} onchange={toucher} name="cible">
              {#each TOUTES_LES_CASES as c (c)}<option value={c}>{c}</option>{/each}
            </select>
          </label>
          {#if brouillon.pions.length > LIMITES.pionsMin}
            <button type="button" class="discret" onclick={() => supprimerPion(pion.couleur)} title="Retirer ce pion du scénario">Retirer</button>
          {/if}
        </header>

        <label>Énigme (affichée au public)
          <input type="text" bind:value={pion.enigme} maxlength={LIMITES.enigme} oninput={toucher} name="enigme" />
        </label>

        <div class="contraintes">
          <span class="etiquette">Ce que dit l’énigme (pour le vérificateur)</span>
          {#each pion.contraintes as contrainte, i (i)}
            <div class="contrainte">
              <select value={contrainte.type} onchange={(e) => changerType(pion, i, e.currentTarget.value as TypeContrainte)} aria-label="Type de contrainte">
                {#each TYPES_CONTRAINTE as type (type)}<option value={type}>{CATALOGUE[type].libelle}</option>{/each}
              </select>
              {#if CATALOGUE[contrainte.type].parametres.includes('n')}
                <select bind:value={contrainte.n} onchange={toucher} aria-label="Nombre de cases">
                  {#each [1, 2, 3, 4] as n (n)}<option value={n}>{n} case{n > 1 ? 's' : ''}</option>{/each}
                </select>
              {/if}
              {#if CATALOGUE[contrainte.type].parametres.includes('autre')}
                <select bind:value={contrainte.autre} onchange={toucher} aria-label="Autre pion">
                  {#each brouillon.pions.filter((p) => p.couleur !== pion.couleur) as autre (autre.couleur)}
                    <option value={autre.couleur}>{INFOS[autre.couleur].nom}</option>
                  {/each}
                </select>
              {/if}
              {#if CATALOGUE[contrainte.type].parametres.includes('lettre')}
                <select bind:value={contrainte.lettre} onchange={toucher} aria-label="Colonne">
                  {#each LETTRES as lettre (lettre)}<option value={lettre}>{lettre}</option>{/each}
                </select>
              {/if}
              {#if CATALOGUE[contrainte.type].parametres.includes('chiffre')}
                <select bind:value={contrainte.chiffre} onchange={toucher} aria-label="Rangée">
                  {#each CHIFFRES as chiffre (chiffre)}<option value={chiffre}>{chiffre}</option>{/each}
                </select>
              {/if}
              {#if CATALOGUE[contrainte.type].parametres.includes('cote')}
                <select bind:value={contrainte.cote} onchange={toucher} aria-label="Bord">
                  {#each COTES as cote (cote)}<option value={cote}>{cote}</option>{/each}
                </select>
              {/if}
              <button type="button" class="discret" onclick={() => { pion.contraintes.splice(i, 1); toucher(); }} aria-label="Supprimer cette contrainte">×</button>
            </div>
          {/each}
          <div class="actions-contraintes">
            {#if pion.contraintes.length < LIMITES.contraintes}
              <button type="button" class="discret" onclick={() => ajouterContrainte(pion)}>+ Ajouter une contrainte</button>
            {/if}
            {#if pion.contraintes.length > 0}
              <button type="button" class="discret" onclick={() => { pion.enigme = proposerEnigme(pion.couleur, pion.contraintes); toucher(); }}>
                Rédiger l’énigme à partir des contraintes
              </button>
            {/if}
          </div>
        </div>

        <label>Indices, un par ligne (révélés après des échecs ; ils peuvent être musicaux)
          <textarea rows="2" value={indicesEnTexte(pion)} onchange={(e) => texteEnIndices(pion, e.currentTarget.value)} name="indices"></textarea>
        </label>
      </article>
    {/each}

    {#if libres.length > 0 && brouillon.pions.length < LIMITES.pionsMax}
      <div class="ajout">
        Ajouter un pion :
        {#each libres as couleur (couleur)}
          <button type="button" class="discret" onclick={() => ajouterPion(couleur)}>{INFOS[couleur].nom}</button>
        {/each}
      </div>
    {/if}
  </fieldset>

  <footer class="barre-actions">
    <button type="button" class="principal" disabled={!modifiable || !modifie || !validation.ok} onclick={enregistrer} data-action="enregistrer-scenario">
      Enregistrer le scénario
    </button>
    <button type="button" disabled={!modifie} onclick={annuler}>Annuler les modifications</button>
    <span class="espace"></span>
    <button type="button" onclick={exporter}>Exporter</button>
    <label class="bouton-fichier" class:inactif={!modifiable}>
      Importer<input type="file" accept="application/json,.json" onchange={importer} disabled={!modifiable} />
    </label>
    <button type="button" disabled={!modifiable} onclick={() => { modifie = false; surDefaut(); }}>Rétablir le scénario du concert</button>
  </footer>
</div>

<style>
  .editeur {
    display: grid;
    gap: 16px;
  }
  .note {
    padding: 10px 14px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--alerte) 18%, var(--surface));
    border: 1px solid var(--alerte);
  }
  .haut {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 20px;
    align-items: start;
  }
  .apercus {
    display: flex;
    gap: 16px;
  }
  .mini {
    margin: 0;
  }
  .mini figcaption {
    margin-bottom: 6px;
    font-weight: 700;
    color: var(--texte-2);
    font-size: 14px;
  }
  .mini-plateau {
    display: grid;
    grid-template-columns: 16px repeat(5, 30px);
    grid-auto-rows: 30px;
    gap: 3px;
    align-items: center;
  }
  .mini-plateau > span:first-child {
    height: 14px;
  }
  .axe {
    font-size: 11px;
    font-weight: 700;
    color: var(--texte-3);
    text-align: center;
  }
  .mini-case {
    width: 30px;
    height: 30px;
    padding: 3px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid var(--trait);
    font-size: 24px;
  }
  .verificateur {
    padding: 14px 16px;
    border-radius: 14px;
    background: var(--fond-2);
    border: 1px solid var(--trait);
  }
  h3 {
    font-family: var(--titre);
    font-size: 17px;
    margin-bottom: 8px;
  }
  .verdict {
    font-weight: 700;
  }
  .verdict.ok {
    color: var(--ok);
  }
  .verdict.ko {
    color: var(--alerte);
  }
  .problemes {
    margin: 6px 0 0;
    padding-left: 20px;
    color: var(--alerte);
  }
  .exemple {
    margin-top: 6px;
    color: var(--texte-2);
    font-size: 14.5px;
  }
  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
    display: grid;
    gap: 12px;
    min-width: 0;
  }
  .fige fieldset {
    opacity: 0.6;
  }
  .titres {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  label {
    display: grid;
    gap: 4px;
    font-size: 13.5px;
    font-weight: 700;
    color: var(--texte-2);
  }
  input[type='text'],
  select,
  textarea {
    width: 100%;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--trait-fort);
    background: var(--fond-2);
    font-size: 15.5px;
    font-weight: 400;
    color: var(--texte);
  }
  textarea {
    resize: vertical;
  }
  .pion {
    display: grid;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 14px;
    background: var(--surface);
    border: 1px solid var(--trait);
    border-left: 6px solid var(--couleur);
  }
  .pion header {
    display: flex;
    align-items: end;
    gap: 12px;
    flex-wrap: wrap;
  }
  .pion .jeton {
    width: 34px;
    font-size: 34px;
    align-self: center;
  }
  h4 {
    margin: 0 auto 0 0;
    align-self: center;
    font-family: var(--titre);
    font-size: 19px;
    text-transform: uppercase;
    color: var(--couleur);
  }
  .court {
    width: 96px;
  }
  .contraintes {
    display: grid;
    gap: 6px;
  }
  .etiquette {
    font-size: 13.5px;
    font-weight: 700;
    color: var(--texte-2);
  }
  .contrainte {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .contrainte select {
    width: auto;
    min-width: 96px;
    flex: 0 1 auto;
  }
  .contrainte select:first-child {
    flex: 1 1 220px;
  }
  .actions-contraintes,
  .ajout {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
    color: var(--texte-2);
    font-size: 14px;
  }
  button,
  .bouton-fichier {
    padding: 9px 14px;
    border-radius: 10px;
    border: 1px solid var(--trait-fort);
    background: var(--surface-2);
    font-size: 15px;
    font-weight: 700;
    color: var(--texte);
    cursor: pointer;
  }
  button:disabled,
  .bouton-fichier.inactif {
    opacity: 0.4;
    cursor: default;
  }
  button.discret {
    padding: 5px 10px;
    font-size: 13.5px;
    font-weight: 400;
    background: transparent;
    text-transform: none;
  }
  button.principal {
    background: var(--texte);
    color: var(--encre);
    border-color: transparent;
  }
  .bouton-fichier {
    display: inline-block;
  }
  .bouton-fichier input {
    display: none;
  }
  .barre-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
    position: sticky;
    bottom: 0;
    padding: 12px 0 4px;
    background: linear-gradient(transparent, var(--fond) 30%);
  }
  .espace {
    flex: 1;
  }
  @media (max-width: 820px) {
    .haut {
      grid-template-columns: 1fr;
    }
    .titres {
      grid-template-columns: 1fr;
    }
  }
</style>
