import 'dotenv/config';
import { app } from './app.js';
import sequelize from './config/database.js';

const PORT = process.env.PUERTO || 3000;

sequelize
  .sync()
  .then(() => {
    app.listen(PORT, () => {
      // eslint-disable-next-line no-console -- replaced by the pino logger in BE-02
      console.log(`Servidor ejecutándose en el puerto ${PORT}`);
    });
  })
  .catch((error) => {
    // eslint-disable-next-line no-console -- replaced by the pino logger in BE-02
    console.error(error);
    process.exit(1);
  });
