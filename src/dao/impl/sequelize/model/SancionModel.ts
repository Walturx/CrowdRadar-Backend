import { DataTypes, Model } from 'sequelize';
import type { CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';

/** Sequelize model of the `sancion_usuario` table (migration 06). Only dao/impl/sequelize sees it. */
export class SancionModel extends Model<InferAttributes<SancionModel>, InferCreationAttributes<SancionModel>> {
  declare id: CreationOptional<number>;
  declare usuarioId: number;
  declare administradorId: number;
  declare tipo: CreationOptional<string>;
  declare dias: number;
  declare motivo: string;
  declare fechaInicio: Date;
  declare fechaFin: Date;
  declare fechaLevantamiento: CreationOptional<Date | null>;
  declare levantadaPor: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initSancionModel(sequelize: Sequelize): void {
  SancionModel.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      usuarioId: { type: DataTypes.INTEGER, allowNull: false },
      administradorId: { type: DataTypes.INTEGER, allowNull: false },
      tipo: { type: DataTypes.STRING(25), allowNull: false, defaultValue: 'SUSPENSION_TEMPORAL' },
      dias: { type: DataTypes.SMALLINT, allowNull: false },
      motivo: { type: DataTypes.STRING(280), allowNull: false },
      fechaInicio: { type: DataTypes.DATE, allowNull: false },
      fechaFin: { type: DataTypes.DATE, allowNull: false },
      fechaLevantamiento: { type: DataTypes.DATE, allowNull: true },
      levantadaPor: { type: DataTypes.INTEGER, allowNull: true },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, modelName: 'Sancion', tableName: 'sancion_usuario', underscored: true, timestamps: true },
  );
}
