import { Router } from 'express';
import type { ConexionBD } from '../datasource/ConexionBD.js';
import { respuesta } from '../dto/RespuestaDTO.js';
import { ApagandoException } from '../exception/http/ApagandoException.js';
import { ServicioNoDisponibleException } from '../exception/http/ServicioNoDisponibleException.js';
import type { EstadoServicio } from '../util/EstadoServicio.js';

/** Longest the health probe waits for the database, including waiting for a pool connection. */
export const TIMEOUT_SALUD_MS = 2000;

/** Resolves when `sonda` does; rejects when it fails or `limiteMs` pass first (the late outcome is ignored). */
async function conLimite(sonda: Promise<void>, limiteMs: number): Promise<void> {
  sonda.catch(() => undefined); // a probe that loses the race must not surface as an unhandled rejection
  let temporizador: NodeJS.Timeout | undefined;
  const vencido = new Promise<never>((_resolver, rechazar) => {
    temporizador = setTimeout(() => rechazar(new Error('La sonda de salud excedio el tiempo limite')), limiteMs);
  });
  try {
    await Promise.race([sonda, vencido]);
  } finally {
    clearTimeout(temporizador);
  }
}

/**
 * Public liveness routes, mounted at "/": the API banner and the readiness check. `/api/salud` answers
 * 503 APAGANDO once the shutdown started and otherwise probes the database with its own short limit,
 * so a saturated pool cannot make the probe hang until the pool's acquire timeout. Only one probe runs at a
 * time (concurrent requests share its promise) and its query carries the same limit as a server-side
 * `statement_timeout`, so a probe that lost the race neither piles up in the pool queue nor keeps running.
 */
export function crearSistemaRouter(conexion: ConexionBD, estado: EstadoServicio, timeoutMs = TIMEOUT_SALUD_MS): Router {
  const router = Router();
  let sondaEnCurso: Promise<void> | undefined;
  const sondear = (): Promise<void> => {
    sondaEnCurso ??= conexion.verificar(timeoutMs).finally(() => {
      sondaEnCurso = undefined;
    });
    return sondaEnCurso;
  };

  router.get('/', (_req, res) => {
    res.json({ message: 'CrowdRadar API' });
  });

  router.get('/api/salud', async (_req, res) => {
    if (estado.apagando) throw new ApagandoException();
    try {
      await conLimite(sondear(), timeoutMs);
    } catch {
      throw new ServicioNoDisponibleException();
    }
    res.json(respuesta('Servicio disponible.', { estado: 'OK' }));
  });

  return router;
}
