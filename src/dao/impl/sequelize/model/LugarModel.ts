import { DataTypes, Model } from 'sequelize';
import type { CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';

/** Sequelize model of the `lugar` table (migrations 02 and 13). Only dao/impl/sequelize sees it. */
export class LugarModel extends Model<InferAttributes<LugarModel>, InferCreationAttributes<LugarModel>> {
  declare id: CreationOptional<number>;
  declare osmTipo: CreationOptional<string>;
  /** BIGINT: pg returns it as a string. */
  declare osmId: string | number | null;
  declare nombre: string;
  declare direccion: string | null;
  /** NUMERIC(9,6): pg returns it as a string. */
  declare latitud: string | number;
  declare longitud: string | number;
  declare categoria: string;
  declare saturacionActual: string | null;
  declare saturacionActualizadaEn: Date | null;
  declare horarioAtencion: string | null;
  declare horaApertura: number | null;
  declare horaCierre: number | null;
  declare urlFoto: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initLugarModel(sequelize: Sequelize): void {
  LugarModel.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      osmTipo: { type: DataTypes.STRING(8), allowNull: false, defaultValue: 'node' },
      osmId: { type: DataTypes.BIGINT, allowNull: true },
      nombre: { type: DataTypes.STRING(120), allowNull: false },
      direccion: { type: DataTypes.STRING(200), allowNull: true },
      latitud: { type: DataTypes.DECIMAL(9, 6), allowNull: false },
      longitud: { type: DataTypes.DECIMAL(9, 6), allowNull: false },
      categoria: { type: DataTypes.STRING(20), allowNull: false },
      saturacionActual: { type: DataTypes.STRING(10), allowNull: true },
      saturacionActualizadaEn: { type: DataTypes.DATE, allowNull: true },
      horarioAtencion: { type: DataTypes.STRING(60), allowNull: true },
      horaApertura: { type: DataTypes.SMALLINT, allowNull: true },
      horaCierre: { type: DataTypes.SMALLINT, allowNull: true },
      urlFoto: { type: DataTypes.STRING(300), allowNull: true },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, modelName: 'Lugar', tableName: 'lugar', underscored: true, timestamps: true },
  );
}
