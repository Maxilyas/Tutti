/** Générateurs de hasard reproductibles (pour les tests et les joueurs simulés). */

export type Alea = () => number;

/** Générateur pseudo-aléatoire à graine (mulberry32). Renvoie des nombres dans [0, 1). */
export function aleaGraine(graine: number): Alea {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Transforme un texte en nombre stable dans [0, 1). */
export function hachage01(texte: string): number {
  let h = 2166136261;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Brassage final pour bien répartir les textes proches (« bot-1 », « bot-2 »…).
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Choisit un élément au hasard. */
export function piocher<T>(elements: readonly T[], alea: Alea): T | undefined {
  if (elements.length === 0) return undefined;
  return elements[Math.min(elements.length - 1, Math.floor(alea() * elements.length))];
}

/** Mélange une copie du tableau (Fisher-Yates). */
export function melanger<T>(elements: readonly T[], alea: Alea): T[] {
  const copie = [...elements];
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(alea() * (i + 1));
    [copie[i], copie[j]] = [copie[j]!, copie[i]!];
  }
  return copie;
}
