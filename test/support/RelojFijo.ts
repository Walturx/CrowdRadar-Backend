import type { Reloj } from '../../src/util/Reloj.js';

/** Pinned clock: always the same instant until advanced. */
export class RelojFijo implements Reloj {
  constructor(private actual: Date) {}

  ahora(): Date {
    return new Date(this.actual);
  }

  avanzarMinutos(minutos: number): void {
    this.actual = new Date(this.actual.getTime() + minutos * 60_000);
  }
}
