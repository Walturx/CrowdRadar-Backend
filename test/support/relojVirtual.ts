/**
 * Time budgets measured on a virtual clock instead of `Date.now()`: the budget tests (a slow subscriber must not hold
 * the answer, a hung push is cut) used to compare real elapsed time with thresholds of 100-1000 ms, which a loaded CPU
 * can break. Under fake `setTimeout` the answer is exact and independent of the machine.
 */
import { vi } from 'vitest';

export interface RelojVirtual {
  /**
   * Starts `trabajo` and advances the fake clock 1 ms at a time until it settles; returns its result and how many
   * virtual milliseconds that took. Fails when it is still pending after `tope` ms.
   */
  medir<T>(trabajo: () => Promise<T>, tope: number): Promise<{ resultado: T; ms: number }>;
  /** Advances the fake clock (timers that come due run, with their promise callbacks). */
  avanzar(ms: number): Promise<void>;
  /** Back to the real timers; timers still pending on the fake clock are dropped. */
  restaurar(): void;
}

/** Fakes only setTimeout/clearTimeout: `Date` and I/O stay real, so loggers and in-memory DAOs behave as usual. */
export function relojVirtual(): RelojVirtual {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  return {
    async medir(trabajo, tope) {
      let estado: { ok: true; valor: unknown } | { ok: false; error: unknown } | undefined;
      trabajo().then(
        (valor) => (estado = { ok: true, valor }),
        (error: unknown) => (estado = { ok: false, error }),
      );
      let ms = 0;
      await vi.advanceTimersByTimeAsync(0);
      while (!estado && ms < tope) {
        await vi.advanceTimersByTimeAsync(1);
        ms += 1;
      }
      const final = estado as typeof estado;
      if (!final) throw new Error(`Sigue pendiente tras ${tope} ms virtuales`);
      if (!final.ok) throw final.error;
      return { resultado: final.valor as Awaited<ReturnType<typeof trabajo>>, ms };
    },
    avanzar: (ms) => vi.advanceTimersByTimeAsync(ms).then(() => undefined),
    restaurar: () => void vi.useRealTimers(),
  };
}
