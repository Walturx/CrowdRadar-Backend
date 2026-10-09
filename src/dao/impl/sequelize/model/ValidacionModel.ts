import { DataTypes, Model } from 'sequelize';
import type { CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';

/** Sequelize model of the `validacion_reporte` table (migration 04). Only dao/impl/sequelize sees it. */
export class ValidacionModel extends Model<InferAttributes<ValidacionModel>, InferCreationAttributes<ValidacionModel>> {
  declare id: CreationOptional<number>;
  declare reporteId: number;
  declare usuarioId: number;
  declare tipoAccion: string;
  declare karmaVotante: number;
  declare puntosOtorgados: number;
  declare fechaHora: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initValidacionModel(sequelize: Sequelize): void {
  ValidacionModel.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      reporteId: { type: DataTypes.INTEGER, allowNull: false },
      usuarioId: { type: DataTypes.INTEGER, allowNull: false },
      tipoAccion: { type: DataTypes.STRING(10), allowNull: false },
      karmaVotante: { type: DataTypes.INTEGER, allowNull: false },
      puntosOtorgados: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
      fechaHora: { type: DataTypes.DATE, allowNull: false },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, modelName: 'Validacion', tableName: 'validacion_reporte', underscored: true, timestamps: true },
  );
}
