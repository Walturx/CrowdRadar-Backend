/** Runs `tarea` over `items` with at most `limite` of them in flight; resolves when all are done (a rejection stops it). */
export async function mapearConLimite<T>(items: readonly T[], limite: number, tarea: (item: T) => Promise<void>): Promise<void> {
  let siguiente = 0;
  const trabajador = async (): Promise<void> => {
    while (siguiente < items.length) {
      const item = items[siguiente++] as T;
      await tarea(item);
    }
  };
  const trabajadores = Math.max(1, Math.min(Math.trunc(limite), items.length));
  await Promise.all(Array.from({ length: trabajadores }, trabajador));
}

/** Rejects with a timeout error when `trabajo` does not settle within `ms`; the work itself is not cancelled. */
export async function conTiempoLimite<T>(trabajo: Promise<T>, ms: number): Promise<T> {
  let temporizador: NodeJS.Timeout | undefined;
  const limite = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(new Error(`Tiempo limite de ${ms} ms agotado`)), ms);
  });
  try {
    return await Promise.race([trabajo, limite]);
  } finally {
    clearTimeout(temporizador);
  }
}
