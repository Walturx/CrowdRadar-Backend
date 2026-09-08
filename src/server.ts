import 'dotenv/config';
import { createApp } from './app.js';
import { ConfiguracionApp } from './config/ConfiguracionApp.js';
import { crearContenedor } from './container/index.js';
import { crearLogger } from './util/logger.js';

const cfg = ConfiguracionApp.getInstance();
const logger = crearLogger(cfg.servidor.logNivel);

async function iniciar(): Promise<void> {
  const contenedor = await crearContenedor(cfg, logger);
  createApp(contenedor).listen(cfg.servidor.puerto, () => {
    logger.info({ puerto: cfg.servidor.puerto }, 'Servidor ejecutandose');
  });
}

iniciar().catch((error: unknown) => {
  logger.error({ err: error }, 'No se pudo iniciar el servidor');
  process.exit(1);
});
