export interface OpcionesReintento {
  /** Total attempts, including the first one. */
  intentos: number;
  /** Wait after the first failure; doubles (times `factor`) after each following one. */
  esperaInicialMs: number;
  factor?: number;
  /** Upper bound of a single wait. */
  esperaMaxMs?: number;
  /** Called after every failed attempt; `esperaMs` is null when no attempts remain. */
  alFallar?: (error: unknown, intento: number, esperaMs: number | null) => void;
  /** Sleep function; tests inject a fake one. */
  dormir?: (ms: number) => Promise<void>;
}

const dormirReal = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

/** Runs `operacion` up to `intentos` times with exponential backoff; rethrows the last error. */
export async function reintentar<T>(operacion: () => Promise<T>, opciones: OpcionesReintento): Promise<T> {
  const { intentos, esperaInicialMs, factor = 2, esperaMaxMs = Number.POSITIVE_INFINITY, alFallar, dormir = dormirReal } = opciones;
  for (let intento = 1; ; intento++) {
    try {
      return await operacion();
    } catch (error) {
      const quedan = intento < intentos;
      const esperaMs = quedan ? Math.min(esperaInicialMs * factor ** (intento - 1), esperaMaxMs) : null;
      alFallar?.(error, intento, esperaMs);
      if (esperaMs === null) throw error;
      await dormir(esperaMs);
    }
  }
}
