/**
 * Guard against unhandled server errors in the suite.
 *
 * `test/support/setupGuardiaErrorInterno.ts` (a Vitest setup file) wraps the real error middleware so every request
 * that ends in the generic 500 ERROR_INTERNO (an error no rule of `traducirError` recognises) is recorded here. After
 * each test the setup fails the test if anything was recorded, unless the test declared that it expects one with
 * `permitirErrorInterno()`. Known failures (4xx, 501, 503) are never recorded: only the "unhandled" branch is.
 */

export interface ErrorInternoRegistrado {
  peticion: string;
  error: unknown;
}

const registrados: ErrorInternoRegistrado[] = [];
let permitido = false;

/** Called by the wrapped error middleware for each request answered with the generic 500. */
export function registrarErrorInterno(peticion: string, error: unknown): void {
  registrados.push({ peticion, error });
}

/** Declares that the current test provokes a generic 500 on purpose (e.g. it checks that internals stay hidden). */
export function permitirErrorInterno(): void {
  permitido = true;
}

/** Recorded unexpected 500s of the current test, then resets the state for the next one. */
export function extraerErroresNoPermitidos(): ErrorInternoRegistrado[] {
  const resultado = permitido ? [] : [...registrados];
  registrados.length = 0;
  permitido = false;
  return resultado;
}

export function describirError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}\n${error.stack ?? ''}`;
  return String(error);
}
