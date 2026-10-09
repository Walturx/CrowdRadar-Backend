import { DataTypes, Model } from 'sequelize';
import type { CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';

/** Sequelize model of the `denuncia` table (migration 05). Only dao/impl/sequelize sees it. */
export class DenunciaModel extends Model<InferAttributes<DenunciaModel>, InferCreationAttributes<DenunciaModel>> {
  declare id: CreationOptional<number>;
  declare reporteId: number;
  declare usuarioId: number;
  declare motivo: string;
  declare detalle: string | null;
  declare estado: CreationOptional<string>;
  declare fechaHora: Date;
  declare resueltaPor: CreationOptional<number | null>;
  declare resueltaEn: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initDenunciaModel(sequelize: Sequelize): void {
  DenunciaModel.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      reporteId: { type: DataTypes.INTEGER, allowNull: false },
      usuarioId: { type: DataTypes.INTEGER, allowNull: false },
      motivo: { type: DataTypes.STRING(25), allowNull: false },
      detalle: { type: DataTypes.STRING(280), allowNull: true },
      estado: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'PENDIENTE' },
      fechaHora: { type: DataTypes.DATE, allowNull: false },
      resueltaPor: { type: DataTypes.INTEGER, allowNull: true },
      resueltaEn: { type: DataTypes.DATE, allowNull: true },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, modelName: 'Denuncia', tableName: 'denuncia', underscored: true, timestamps: true },
  );
}
