/** Une horloge réactive partagée : les chronos se recalculent 10 fois par seconde. */

export const horloge = $state({ t: Date.now() });

let demarree = false;

export function demarrerHorloge(): void {
  if (demarree) return;
  demarree = true;
  setInterval(() => {
    horloge.t = Date.now();
  }, 100);
}
