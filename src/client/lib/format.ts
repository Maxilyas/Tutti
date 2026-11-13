/** « 3:07 » */
export function minutesSecondes(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** « 3 min 07 » */
export function dureeLisible(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const secondes = total % 60;
  if (minutes === 0) return `${secondes} s`;
  return `${minutes} min ${String(secondes).padStart(2, '0')}`;
}

export function pluriel(n: number, singulier: string, plurielForme = `${singulier}s`): string {
  return `${n} ${n > 1 ? plurielForme : singulier}`;
}
