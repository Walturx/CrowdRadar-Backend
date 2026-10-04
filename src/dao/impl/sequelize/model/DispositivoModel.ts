import { DataTypes, Model } from 'sequelize';
import type { CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';

/** Sequelize model of the `dispositivo_push` table (migration 10). Only dao/impl/sequelize sees it. */
export class DispositivoModel extends Model<InferAttributes<DispositivoModel>, InferCreationAttributes<DispositivoModel>> {
  declare id: CreationOptional<number>;
  declare usuarioId: number;
  declare tokenFcm: string;
  declare plataforma: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initDispositivoModel(sequelize: Sequelize): void {
  DispositivoModel.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      usuarioId: { type: DataTypes.INTEGER, allowNull: false },
      tokenFcm: { type: DataTypes.STRING(255), allowNull: false, unique: true },
      plataforma: { type: DataTypes.STRING(10), allowNull: false },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, modelName: 'Dispositivo', tableName: 'dispositivo_push', underscored: true, timestamps: true },
  );
}
