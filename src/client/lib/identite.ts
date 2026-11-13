/**
 * Identifiant anonyme de l'appareil : il permet de garder son équipe après un
 * rechargement ou une mise en veille. Aucune donnée personnelle.
 */

const CLE_ID = 'tutti.id';

function aleatoire(): string {
  // crypto.randomUUID n'existe pas hors HTTPS (serveur local de secours) : on s'en passe.
  const octets = new Uint8Array(12);
  crypto.getRandomValues(octets);
  return [...octets].map((o) => o.toString(16).padStart(2, '0')).join('');
}

export function lire(cle: string): string | null {
  try {
    return localStorage.getItem(cle);
  } catch {
    return null;
  }
}

export function ecrire(cle: string, valeur: string | null): void {
  try {
    if (valeur === null) localStorage.removeItem(cle);
    else localStorage.setItem(cle, valeur);
  } catch {
    // Navigation privée ou stockage bloqué : l'appli fonctionne quand même.
  }
}

let memoire: string | null = null;

export function identifiant(prefixe: string): string {
  const cle = `${CLE_ID}.${prefixe}`;
  const connu = lire(cle) ?? memoire;
  if (connu && /^[A-Za-z0-9_-]{8,64}$/.test(connu)) return connu;
  memoire = `${prefixe}-${aleatoire()}`;
  ecrire(cle, memoire);
  return memoire;
}
