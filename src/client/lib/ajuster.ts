/**
 * Action Svelte : réduit la taille du texte d'un bloc jusqu'à ce que tout son
 * contenu tienne dedans. Le bloc doit lire la variable CSS `--echelle`.
 * Sert aux cartes du grand écran : une énigme longue ou un indice de plus ne
 * doivent jamais être coupés.
 */
export function ajuster(noeud: HTMLElement): { destroy: () => void } {
  const ECHELLE_MIN = 0.55;

  const mesurer = () => {
    let echelle = 1;
    noeud.style.setProperty('--echelle', '1');
    while (echelle > ECHELLE_MIN && noeud.scrollHeight > noeud.clientHeight + 1) {
      echelle = Math.max(ECHELLE_MIN, echelle * 0.94);
      noeud.style.setProperty('--echelle', echelle.toFixed(3));
    }
  };

  const tailles = new ResizeObserver(mesurer);
  tailles.observe(noeud);
  const contenu = new MutationObserver(mesurer);
  contenu.observe(noeud, { childList: true, subtree: true, characterData: true });
  // Les polices arrivent après le premier affichage : on remesure.
  void document.fonts?.ready.then(mesurer);
  mesurer();

  return {
    destroy() {
      tailles.disconnect();
      contenu.disconnect();
    },
  };
}
