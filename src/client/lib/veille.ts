/**
 * Empêche l'écran de s'éteindre pendant la partie (Screen Wake Lock API).
 * Sans effet si le navigateur ne le permet pas (ou hors HTTPS).
 */

type Verrou = { release: () => Promise<void> };

export function garderEcranAllume(): () => void {
  let verrou: Verrou | null = null;
  let actif = true;
  let enCours = false;

  const demander = async () => {
    if (!actif || verrou || enCours || document.visibilityState !== 'visible') return;
    const api = (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<Verrou & EventTarget> } }).wakeLock;
    if (!api) return;
    enCours = true;
    try {
      const obtenu = await api.request('screen');
      if (!actif) {
        // On n'en veut plus (la partie s'est terminée pendant la demande) : on le rend tout de suite.
        void obtenu.release();
        return;
      }
      obtenu.addEventListener('release', () => {
        if (verrou === obtenu) verrou = null;
      });
      verrou = obtenu;
    } catch {
      // Refusé (batterie faible, onglet en arrière-plan…) : tant pis.
    } finally {
      enCours = false;
    }
  };

  const surVisibilite = () => void demander();
  document.addEventListener('visibilitychange', surVisibilite);
  // Certains navigateurs exigent un geste de l'utilisateur.
  document.addEventListener('pointerdown', surVisibilite, { passive: true });
  void demander();

  return () => {
    actif = false;
    document.removeEventListener('visibilitychange', surVisibilite);
    document.removeEventListener('pointerdown', surVisibilite);
    void verrou?.release();
  };
}

export function vibrer(motif: number | number[]): void {
  try {
    navigator.vibrate?.(motif);
  } catch {
    // Non disponible (iOS) : sans importance.
  }
}
