import 'dotenv/config';
import { app } from './app.js';
import { ConfiguracionApp } from './config/ConfiguracionApp.js';
import { ConexionPostgresFactory } from './datasource/impl/ConexionPostgresFactory.js';
import { crearLogger } from './util/logger.js';

const cfg = ConfiguracionApp.getInstance();
const logger = crearLogger(cfg.servidor.logNivel);

async function iniciar(): Promise<void> {
  await new ConexionPostgresFactory(cfg.bd, logger).conectar();
  app.listen(cfg.servidor.puerto, () => {
    logger.info({ puerto: cfg.servidor.puerto }, 'Servidor ejecutandose');
  });
}

iniciar().catch((error: unknown) => {
  logger.error({ err: error }, 'No se pudo iniciar el servidor');
  process.exit(1);
});
