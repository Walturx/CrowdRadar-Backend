import 'dotenv/config';
import { createServer } from 'node:http';
import { createApp } from './app.js';
import { ConfiguracionApp } from './config/ConfiguracionApp.js';
import { crearContenedor } from './container/index.js';
import { EstadoServicio } from './util/EstadoServicio.js';
import { crearLogger } from './util/logger.js';
import { reintentar } from './util/reintentar.js';
import { configurarTimeouts, crearApagado, instalarHooksProceso } from './util/servidorHttp.js';

const cfg = ConfiguracionApp.getInstance();
const logger = crearLogger(cfg.servidor.logNivel);
const estado = new EstadoServicio();

async function iniciar(): Promise<void> {
  // The database may still be starting (docker compose, managed restarts): retry with backoff.
  const contenedor = await reintentar(() => crearContenedor(cfg, logger, estado), {
    intentos: cfg.bd.reintentos,
    esperaInicialMs: cfg.bd.reintentoEsperaMs,
    alFallar: (error, intento, proximaEsperaMs) =>
      logger.warn({ err: error, intento, intentos: cfg.bd.reintentos, proximaEsperaMs }, 'Conexion a la base de datos fallida'),
  });

  const servidor = createServer(createApp(contenedor));
  configurarTimeouts(servidor, cfg.servidor.timeouts);

  const apagar = crearApagado({
    servidor,
    conexion: contenedor.conexion,
    logger,
    timeoutMs: cfg.servidor.timeouts.apagadoMs,
    salir: (codigo) => process.exit(codigo),
    estado,
  });
  instalarHooksProceso({ proceso: process, logger, apagar, cerrarRecursos: () => contenedor.conexion.cerrar() });

  servidor.listen(cfg.servidor.puerto, () => {
    logger.info({ puerto: cfg.servidor.puerto }, 'Servidor ejecutandose');
  });
}

iniciar().catch((error: unknown) => {
  logger.error({ err: error }, 'No se pudo iniciar el servidor');
  process.exit(1);
});
