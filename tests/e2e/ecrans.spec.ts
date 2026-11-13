/**
 * Les trois écrans dans de vrais navigateurs : le téléphone d'un spectateur,
 * le grand écran et la régie, pendant une partie.
 */
import { devices, expect, test, type Page } from '@playwright/test';
import { CIBLES, PIN, attendrePhase, connecterJoueurs, fermerTout, parEquipe, preparer, relaisGelable } from './outils';

test.describe.configure({ mode: 'serial' });

/** Relève les erreurs JavaScript d'une page : il ne doit y en avoir aucune. */
function surveiller(page: Page, erreurs: string[]): void {
  page.on('pageerror', (erreur) => erreurs.push(String(erreur)));
  page.on('console', (message) => {
    if (message.type() === 'error') erreurs.push(message.text());
  });
}

async function entrerEnRegie(page: Page): Promise<void> {
  await page.goto('/regie');
  await page.locator('input[name=pin]').fill(PIN);
  const confirmation = page.locator('input[name=confirmation]');
  if (await confirmation.isVisible()) await confirmation.fill(PIN);
  await page.locator('button[type=submit]').click();
  await expect(page.locator('.regie')).toBeVisible();
}

test('une partie vue du téléphone, du grand écran et de la régie', async ({ browser }) => {
  const api = await preparer({ durees: { premierVote: 7, vote: 6, affichage: 4, deplacement: 2 } });
  const erreurs: string[] = [];

  // Un spectateur scanne le QR code.
  const contexteTelephone = await browser.newContext({ ...devices['Pixel 7'] });
  const telephone = await contexteTelephone.newPage();
  surveiller(telephone, erreurs);
  await telephone.goto('/');
  const carte = telephone.locator('.carte-equipe');
  await expect(carte).toBeVisible();
  const equipe = (await carte.getAttribute('data-equipe'))!;
  expect(Object.keys(CIBLES)).toContain(equipe);
  await expect(telephone.getByText('Aucune donnée personnelle')).toBeVisible();

  // Six autres joueurs remplissent les six autres équipes.
  const autres = await connecterJoueurs(6);
  expect(Object.keys(parEquipe(autres)).sort()).toEqual(Object.keys(CIBLES).filter((c) => c !== equipe).sort());

  // Le grand écran affiche le QR code et le nombre de joueurs.
  const contexteEcran = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const ecran = await contexteEcran.newPage();
  surveiller(ecran, erreurs);
  await ecran.goto('/ecran');
  await expect(ecran.locator('.qr svg')).toBeVisible();
  await expect(ecran.locator('.total')).toHaveText('7 joueurs connectés');
  await expect(ecran.locator('.equipe-accueil')).toHaveCount(7);

  // La régie entre avec son code et lance la partie.
  const contexteRegie = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const regie = await contexteRegie.newPage();
  surveiller(regie, erreurs);
  await entrerEnRegie(regie);
  await expect(regie.locator('[data-joueurs]')).toHaveText('7');
  await regie.locator('[data-action=lancer]').click();

  // Manche 1 : le spectateur lit son énigme et vote pour une mauvaise case.
  await expect(telephone.locator('.minuteur h2')).toHaveText('Votez !');
  await expect(telephone.locator('.enigme .texte')).not.toBeEmpty();
  await expect(ecran.locator('.titre-phase')).toHaveText('Votez !');
  await expect(ecran.locator('.carte .enigme')).toHaveCount(7);
  await telephone.locator('button.case[data-case=A1]').click();
  await expect(telephone.locator('.mon-vote b')).toHaveText('A1');
  await expect(regie.locator(`tr[data-equipe=${equipe}]`)).toContainText('A1 ×1');

  await expect(telephone.locator('[data-verdict=mauvais]')).toContainText('A1 n’est pas la bonne case');
  await expect(ecran.locator('.titre-phase')).toHaveText('Résultat');
  await expect(ecran.locator(`.carte[data-equipe=${equipe}] .pastille`)).toHaveText('Raté');
  await expect(ecran.locator(`.carte[data-equipe=${equipe}] .trajet`)).toContainText('A1');
  await expect(ecran.locator('button.case[data-case=A1]')).toHaveClass(/faux/);
  await expect(ecran.locator('.titre-phase')).toHaveText('Déplacement');
  await expect(ecran.locator(`.pion[data-pion=${equipe}]`)).toHaveAttribute('data-case', 'A1');

  // Manche 2 : la case essayée est barrée ; cette fois il trouve.
  await expect(telephone.locator('.minuteur h2')).toHaveText('Votez !');
  await expect(telephone.locator('button.case[data-case=A1]')).toBeDisabled();
  await telephone.locator(`button.case[data-case=${CIBLES[equipe]}]`).click();
  await expect(telephone.locator('.mon-vote b')).toHaveText(CIBLES[equipe]!);
  await expect(telephone.locator('[data-verdict=bon]')).toContainText('Bravo');
  await expect(ecran.locator(`.carte[data-equipe=${equipe}] .pastille`)).toHaveText('En place');
  await expect(ecran.locator(`button.case[data-case=${CIBLES[equipe]}]`)).toHaveClass(/juste|grisee/);

  // Manche 3 : son équipe a fini, il part aider une autre équipe.
  await expect(telephone.getByText('Votre musicien est en place')).toBeVisible();
  await telephone.locator('.bouton-renfort').click();
  await expect(telephone.locator('.bandeau .nom')).not.toHaveAttribute('data-equipe', equipe);

  // La régie révèle les pions restants : c'est le final.
  await regie.locator('[data-action=terminer]').click();
  await regie.locator('[data-confirmer=terminer]').click();
  await expect(ecran.locator('.titre-final')).toHaveText('Tutti !', { timeout: 30_000 });
  await expect(telephone.locator('.logo.grand')).toHaveText('Tutti !');
  await expect(regie.locator('.fin')).toContainText('Partie terminée');
  await expect(ecran.locator('.carte .pastille.bon')).toHaveCount(7);

  expect(erreurs).toEqual([]);
  fermerTout(api, autres);
  await Promise.all([contexteTelephone.close(), contexteEcran.close(), contexteRegie.close()]);
});

test('le téléphone garde son équipe après un rechargement', async ({ browser }) => {
  const api = await preparer();
  const contexte = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await contexte.newPage();
  await page.goto('/');
  const equipe = await page.locator('.carte-equipe').getAttribute('data-equipe');
  await page.reload();
  await expect(page.locator('.carte-equipe')).toHaveAttribute('data-equipe', equipe!);
  await api.attendre((c) => c.etat.joueurs === 1, 5000, 'un seul joueur compté');
  fermerTout(api);
  await contexte.close();
});

test('une connexion morte sans s’être fermée est détectée, et le téléphone rattrape la partie', async ({ browser }) => {
  const relais = await relaisGelable(5198);
  const api = await preparer({ durees: { premierVote: 5, vote: 30, affichage: 2, deplacement: 2 } });
  const contexte = await browser.newContext({ ...devices['Pixel 7'], baseURL: 'http://localhost:5198' });
  const page = await contexte.newPage();
  try {
    await page.goto('/');
    await expect(page.locator('.carte-equipe')).toBeVisible();
    api.action({ a: 'lancer' });
    await expect(page.locator('.minuteur h2')).toHaveText('Votez !');
    await expect(page.locator('.bandeau .manche')).toHaveText('Manche 1');

    // Le réseau décroche. Pendant ce temps, la partie avance jusqu'à la manche 2.
    relais.geler();
    await attendrePhase(api, 'vote', 2);
    relais.degeler();

    // Le téléphone s'en aperçoit seul, se reconnecte, et retrouve la manche en cours.
    await expect(page.locator('.bandeau .manche')).toHaveText('Manche 2', { timeout: 25_000 });
    await expect(page.locator('.minuteur h2')).toHaveText('Votez !');
    await expect(page.locator('.hors-ligne')).toHaveCount(0);
    await page.locator('button.case[data-case=A1]').click();
    await expect(page.locator('.mon-vote b')).toHaveText('A1');
    await api.attendre((c) => Object.values(c.regie.votes).some((urne) => urne?.A1 === 1), 5000, 'vote reçu après la reconnexion');
  } finally {
    fermerTout(api);
    await contexte.close();
    await relais.fermer();
  }
});

test('une coupure de réseau ne fait pas perdre un scénario en cours de saisie', async ({ browser }) => {
  const relais = await relaisGelable(5198);
  const api = await preparer();
  const contexte = await browser.newContext({ viewport: { width: 1280, height: 900 }, baseURL: 'http://localhost:5198' });
  const regie = await contexte.newPage();
  try {
    await entrerEnRegie(regie);
    await regie.locator('[data-onglet=scenario]').click();
    const enigme = regie.locator('article[data-pion=rouge] input[name=enigme]');
    await enigme.fill('Une énigme pas encore enregistrée');

    relais.geler();
    await expect(regie.locator('.liaison')).toHaveText('Reconnexion…', { timeout: 25_000 });
    relais.degeler();
    await expect(regie.locator('.liaison')).toHaveText('Connecté', { timeout: 15_000 });

    // La régie est restée affichée, sur le même onglet, avec la saisie intacte.
    await expect(regie.locator('input[name=pin]')).toHaveCount(0);
    await expect(enigme).toHaveValue('Une énigme pas encore enregistrée');
    // Et elle pilote toujours : l'enregistrement arrive bien au serveur.
    await regie.locator('[data-action=enregistrer-scenario]').click();
    await api.attendre((c) => c.regie.scenario.pions[0]!.enigme === 'Une énigme pas encore enregistrée', 5000, 'scénario enregistré');
  } finally {
    fermerTout(api);
    await contexte.close();
    await relais.fermer();
  }
});

test('la régie : réglages, musicien absent, éditeur de scénario et vérificateur', async ({ browser }) => {
  const api = await preparer();
  const erreurs: string[] = [];
  const contexte = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const regie = await contexte.newPage();
  surveiller(regie, erreurs);
  await entrerEnRegie(regie);

  // Réglages : la durée du vote passe à 20 secondes.
  await regie.locator('[data-onglet=reglages]').click();
  const champ = regie.locator('input[data-duree=vote]');
  await champ.fill('20');
  await champ.blur();
  await api.attendre((c) => c.regie.scenario.durees.vote === 20, 5000, 'durée modifiée');

  // Un musicien est absent : il disparaît des équipes du grand écran.
  const ecran = await contexte.newPage();
  surveiller(ecran, erreurs);
  await ecran.goto('/ecran');
  await expect(ecran.locator('.equipe-accueil')).toHaveCount(7);
  await regie.locator('[data-onglet=equipes]').click();
  await regie.locator('[data-absent=rouge]').check();
  await expect(ecran.locator('.equipe-accueil')).toHaveCount(6);
  await expect(regie.locator('tr[data-equipe=rouge]')).toContainText('absent');
  await regie.locator('[data-absent=rouge]').uncheck();
  await expect(ecran.locator('.equipe-accueil')).toHaveCount(7);

  // Vérificateur : le scénario du concert a une solution unique…
  await regie.locator('[data-onglet=scenario]').click();
  await expect(regie.locator('[data-verif=unique]')).toBeVisible();
  // … mais sans « tout à gauche », violet et orange deviennent interchangeables.
  const violet = regie.locator('article[data-pion=violet]');
  await violet.locator('.contrainte').nth(1).getByRole('button', { name: 'Supprimer cette contrainte' }).click();
  await expect(regie.locator('[data-verif=multiple]')).toContainText('2 solutions');
  await expect(regie.locator('[data-verif=multiple]')).toContainText('orange');
  await regie.getByRole('button', { name: 'Annuler les modifications' }).click();
  await expect(regie.locator('[data-verif=unique]')).toBeVisible();

  // Deux pions sur la même case : l'enregistrement est bloqué.
  await violet.locator('select[name=cible]').selectOption('B1');
  await expect(regie.locator('.problemes')).toContainText('même case à trouver');
  await expect(regie.locator('[data-action=enregistrer-scenario]')).toBeDisabled();
  await regie.getByRole('button', { name: 'Annuler les modifications' }).click();

  // On réécrit une énigme et on l'enregistre.
  const rouge = regie.locator('article[data-pion=rouge]');
  await rouge.locator('input[name=enigme]').fill('Le rouge domine le vert.');
  await regie.locator('[data-action=enregistrer-scenario]').click();
  await api.attendre((c) => c.regie.scenario.pions[0]!.enigme === 'Le rouge domine le vert.', 5000, 'énigme enregistrée');
  await expect(regie.getByText('Scénario enregistré.')).toBeVisible();
  // Les réglages faits ailleurs n'ont pas été écrasés.
  expect(api.regie.scenario.durees.vote).toBe(20);

  // Après un rechargement, le jeton enregistré rouvre la régie sans redemander le code.
  await regie.reload();
  await expect(regie.locator('.regie')).toBeVisible();
  await expect(regie.locator('input[name=pin]')).toHaveCount(0);

  // Répétition : des joueurs simulés rejoignent la partie.
  await regie.locator('[data-onglet=repetition]').click();
  await regie.locator('[data-simules="14"]').click();
  await expect(ecran.locator('.total')).toHaveText('14 joueurs connectés');
  await regie.locator('[data-simules="0"]').click();
  await expect(ecran.locator('.total')).toHaveText('En attente des premiers joueurs…');

  expect(erreurs).toEqual([]);
  fermerTout(api);
  await contexte.close();
});

test('un mauvais code de régie est refusé', async ({ page }) => {
  const api = await preparer();
  await page.goto('/regie');
  await page.locator('input[name=pin]').fill('pas-le-bon');
  await page.locator('button[type=submit]').click();
  await expect(page.getByRole('alert')).toHaveText('Code incorrect.');
  await expect(page.locator('.regie')).toHaveCount(0);
  fermerTout(api);
});

for (const appareil of [
  { nom: 'petit téléphone (320 × 568)', largeur: 320, hauteur: 568 },
  { nom: 'téléphone courant (390 × 844)', largeur: 390, hauteur: 844 },
  { nom: 'téléphone en paysage (740 × 360)', largeur: 740, hauteur: 360 },
]) {
  test(`l’écran de vote tient sans défilement : ${appareil.nom}`, async ({ browser }) => {
    const api = await preparer({ durees: { premierVote: 20, vote: 20, affichage: 2, deplacement: 2 } });
    const contexte = await browser.newContext({
      viewport: { width: appareil.largeur, height: appareil.hauteur },
      hasTouch: true,
      isMobile: true,
    });
    const page = await contexte.newPage();
    await page.goto('/');
    await expect(page.locator('.carte-equipe')).toBeVisible();
    api.action({ a: 'lancer' });
    await attendrePhase(api, 'vote', 1);
    await expect(page.locator('.minuteur h2')).toHaveText('Votez !');

    const mesures = await page.evaluate(() => {
      const cases = [...document.querySelectorAll<HTMLElement>('button.case')].map((c) => c.getBoundingClientRect());
      return {
        debordeEnLargeur: document.documentElement.scrollWidth > window.innerWidth,
        debordeEnHauteur: document.documentElement.scrollHeight > window.innerHeight,
        plusPetiteCase: Math.min(...cases.map((r) => Math.min(r.width, r.height))),
        toutesVisibles: cases.every((r) => r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth),
        nombre: cases.length,
      };
    });
    expect(mesures.nombre).toBe(25);
    expect(mesures.debordeEnLargeur).toBe(false);
    expect(mesures.debordeEnHauteur).toBe(false);
    expect(mesures.toutesVisibles).toBe(true);
    // Une case doit rester facile à toucher du doigt.
    expect(mesures.plusPetiteCase).toBeGreaterThanOrEqual(appareil.hauteur < 400 ? 30 : 40);

    await page.locator('button.case[data-case=A1]').click();
    await expect(page.locator('.mon-vote b')).toHaveText('A1');
    fermerTout(api);
    await contexte.close();
  });
}

for (const format of [
  { nom: '16:9 (1920 × 1080)', largeur: 1920, hauteur: 1080 },
  { nom: '16:9 (1280 × 720)', largeur: 1280, hauteur: 720 },
  { nom: '4:3 (1024 × 768)', largeur: 1024, hauteur: 768 },
  { nom: 'fenêtre réduite (1456 × 819)', largeur: 1456, hauteur: 819 },
]) {
  test(`le grand écran ne déborde pas : ${format.nom}`, async ({ browser }) => {
    const api = await preparer({ durees: { premierVote: 20, vote: 20, affichage: 2, deplacement: 2 } });
    api.action({ a: 'simules', nombre: 49 });
    const contexte = await browser.newContext({ viewport: { width: format.largeur, height: format.hauteur } });
    const page = await contexte.newPage();
    await page.goto('/ecran');
    await expect(page.locator('.total')).toHaveText('49 joueurs connectés');

    const dansLEcran = (selecteur: string) =>
      page.evaluate((s) => {
        const elements = [...document.querySelectorAll<HTMLElement>(s)];
        return (
          elements.length > 0 &&
          elements.every((e) => {
            const r = e.getBoundingClientRect();
            return r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight + 1 && r.right <= window.innerWidth + 1;
          })
        );
      }, selecteur);

    expect(await dansLEcran('.qr, .adresse, .equipe-accueil, .total')).toBe(true);

    api.action({ a: 'lancer' });
    await expect(page.locator('.titre-phase')).toHaveText('Votez !');
    await expect(page.locator('.depart')).toHaveCount(0, { timeout: 5000 });
    expect(await dansLEcran('button.case, .carte, .chrono, .titre-phase')).toBe(true);
    // Aucune carte ne coupe son contenu, ni pendant le vote ni à l'affichage du résultat.
    const cartesCoupees = () =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.carte')]
          .filter((carte) => carte.scrollHeight > carte.clientHeight + 2 || carte.scrollWidth > carte.clientWidth + 2)
          .map((carte) => carte.dataset.equipe),
      );
    expect(await cartesCoupees()).toEqual([]);
    api.action({ a: 'suivant' });
    await expect(page.locator('.titre-phase')).toHaveText('Résultat');
    await expect(page.locator('.carte .trajet')).toHaveCount(7);
    expect(await cartesCoupees()).toEqual([]);
    expect(await dansLEcran('.carte, .pastille, .trajet')).toBe(true);
    api.action({ a: 'simules', nombre: 0 });
    fermerTout(api);
    await contexte.close();
  });
}
