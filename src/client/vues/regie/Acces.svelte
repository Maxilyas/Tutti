<script lang="ts">
  /** Porte d'entrée de la régie : saisie (ou création) du code. */
  import { PIN_MAX, PIN_MIN } from '../../../shared/protocole';
  import type { Connexion } from '../../lib/connexion.svelte';

  interface Props {
    c: Connexion;
  }
  let { c }: Props = $props();

  let pin = $state('');
  let confirmation = $state('');
  const aDefinir = $derived(c.auth?.aDefinir === true);
  const erreurLocale = $derived(aDefinir && confirmation.length > 0 && pin !== confirmation ? 'Les deux codes ne sont pas identiques.' : '');
  const pret = $derived(pin.length >= PIN_MIN && (!aDefinir || pin === confirmation));

  function valider(evenement: SubmitEvent): void {
    evenement.preventDefault();
    if (!pret) return;
    if (aDefinir) c.definirPin(pin);
    else c.authentifier(pin);
  }
</script>

<main class="acces">
  <form onsubmit={valider}>
    <h1>Tutti · Régie</h1>
    {#if !c.enLigne || c.verification || !c.auth}
      <p class="aide">Connexion au serveur…</p>
    {:else if aDefinir}
      <p class="aide">
        Première connexion : choisissez le <b>code de la régie</b> ({PIN_MIN} caractères au moins). Il sera demandé à chaque nouvelle
        connexion. Notez-le !
      </p>
      <label>Code de la régie<input type="password" bind:value={pin} minlength={PIN_MIN} maxlength={PIN_MAX} autocomplete="new-password" name="pin" /></label>
      <label>Confirmez le code<input type="password" bind:value={confirmation} maxlength={PIN_MAX} autocomplete="new-password" name="confirmation" /></label>
    {:else}
      <label>Code de la régie<input type="password" bind:value={pin} maxlength={PIN_MAX} autocomplete="current-password" name="pin" /></label>
    {/if}
    {#if erreurLocale || c.auth?.raison}
      <p class="erreur" role="alert">{erreurLocale || c.auth?.raison}</p>
    {/if}
    {#if c.enLigne && !c.verification && c.auth}
      <button type="submit" disabled={!pret}>{aDefinir ? 'Créer le code et entrer' : 'Entrer'}</button>
    {/if}
  </form>
</main>

<style>
  .acces {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 20px;
  }
  form {
    width: min(100%, 400px);
    display: grid;
    gap: 14px;
    padding: 28px;
    border-radius: 20px;
    background: var(--surface);
    border: 1px solid var(--trait);
  }
  h1 {
    font-family: var(--titre);
    font-size: 30px;
  }
  .aide {
    color: var(--texte-2);
  }
  label {
    display: grid;
    gap: 6px;
    font-weight: 700;
  }
  input {
    padding: 12px 14px;
    border-radius: 10px;
    border: 1px solid var(--trait-fort);
    background: var(--fond-2);
    font-size: 18px;
  }
  button {
    padding: 13px;
    border: 0;
    border-radius: 12px;
    background: var(--texte);
    color: var(--encre);
    font-weight: 700;
    font-size: 17px;
  }
  button:disabled {
    opacity: 0.4;
  }
  .erreur {
    color: var(--danger);
    font-weight: 700;
  }
</style>
