import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const sequelize = new Sequelize(
  process.env.DB_NOMBRE ?? 'crowdradar',
  process.env.DB_USUARIO ?? 'crowdradar',
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PUERTO ? Number(process.env.DB_PUERTO) : undefined,
    dialect: 'postgres',
    logging: false,
  },
);

export default sequelize;
