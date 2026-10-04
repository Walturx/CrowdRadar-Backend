// sequelize-cli connection settings. Reads the same DB_* variables as the API.
// Kept as CommonJS (.cjs) because sequelize-cli loads it with require().
require('dotenv').config({ quiet: true });

const base = {
  username: process.env.DB_USUARIO || 'crowdradar',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NOMBRE || 'crowdradar',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PUERTO || 5432),
  dialect: 'postgres',
  logging: false,
  define: { underscored: true, freezeTableName: true },
  dialectOptions:
    process.env.DB_SSL === 'true' ? { ssl: { require: true, rejectUnauthorized: false } } : {},
};

module.exports = { development: base, test: base, production: base };
