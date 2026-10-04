import { DataTypes, Model } from 'sequelize';
import type { CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';

/** Sequelize model of the `alerta` table (migration 08). Only dao/impl/sequelize sees it. */
export class AlertaModel extends Model<InferAttributes<AlertaModel>, InferCreationAttributes<AlertaModel>> {
  declare id: CreationOptional<number>;
  declare favoritoId: number;
  declare usuarioId: number;
  declare lugarId: number;
  declare nivelAnterior: string | null;
  declare nivelNuevo: string;
  declare mensaje: string;
  declare leida: CreationOptional<boolean>;
  declare fechaHora: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initAlertaModel(sequelize: Sequelize): void {
  AlertaModel.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      favoritoId: { type: DataTypes.INTEGER, allowNull: false },
      usuarioId: { type: DataTypes.INTEGER, allowNull: false },
      lugarId: { type: DataTypes.INTEGER, allowNull: false },
      nivelAnterior: { type: DataTypes.STRING(10), allowNull: true },
      nivelNuevo: { type: DataTypes.STRING(10), allowNull: false },
      mensaje: { type: DataTypes.STRING(200), allowNull: false },
      leida: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      fechaHora: { type: DataTypes.DATE, allowNull: false },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, modelName: 'Alerta', tableName: 'alerta', underscored: true, timestamps: true },
  );
}
