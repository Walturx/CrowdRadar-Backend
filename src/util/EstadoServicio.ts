/**
 * Shared readiness flag: the shutdown flips it as soon as it starts, so `/api/salud` answers 503
 * and the load balancer stops routing new traffic while in-flight requests finish.
 */
export class EstadoServicio {
  private enApagado = false;

  get apagando(): boolean {
    return this.enApagado;
  }

  marcarApagando(): void {
    this.enApagado = true;
  }
}
