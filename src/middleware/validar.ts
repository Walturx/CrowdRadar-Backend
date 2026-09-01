import type { RequestHandler } from 'express';
import { z, type ZodType } from 'zod';
import type { DetalleError } from '../exception/AppException.js';
import { ValidacionException } from '../exception/base/ValidacionException.js';

// Default zod messages in Spanish; schemas can still override them per field.
z.config(z.locales.es());

export interface EsquemasValidacion {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/** One `{campo, mensaje}` per failing field (one per unknown key for strict objects). */
function detallesDe(error: z.ZodError): DetalleError[] {
  return error.issues.flatMap((issue): DetalleError[] => {
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((clave) => ({ campo: clave, mensaje: 'Campo no permitido.' }));
    }
    return [{ campo: issue.path.join('.') || 'cuerpo', mensaje: issue.message }];
  });
}

/**
 * Validates body, query and params with zod. Parsed values replace `req.body` and land in
 * `res.locals.query` / `res.locals.params` (Express 5 makes `req.query` read-only). Every
 * failure of the three parts is reported together in a single ValidacionException.
 */
export const validar =
  (esquemas: EsquemasValidacion): RequestHandler =>
  (req, res, next) => {
    const errores: DetalleError[] = [];

    const parseos = [
      { esquema: esquemas.body, entrada: req.body, guardar: (valor: unknown) => (req.body = valor) },
      { esquema: esquemas.query, entrada: req.query, guardar: (valor: unknown) => (res.locals.query = valor) },
      { esquema: esquemas.params, entrada: req.params, guardar: (valor: unknown) => (res.locals.params = valor) },
    ];
    for (const { esquema, entrada, guardar } of parseos) {
      if (!esquema) continue;
      const resultado = esquema.safeParse(entrada);
      if (resultado.success) guardar(resultado.data);
      else errores.push(...detallesDe(resultado.error));
    }

    if (errores.length > 0) throw new ValidacionException(errores);
    next();
  };
