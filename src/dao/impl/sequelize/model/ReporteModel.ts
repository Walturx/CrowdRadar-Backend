import { DataTypes, Model } from 'sequelize';
import type { CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';

/** Sequelize model of the `reporte_saturacion` table (migration 03). Only dao/impl/sequelize sees it. */
export class ReporteModel extends Model<InferAttributes<ReporteModel>, InferCreationAttributes<ReporteModel>> {
  declare id: CreationOptional<number>;
  declare usuarioId: number;
  declare lugarId: number;
  declare nivelSaturacion: string;
  declare fechaHora: Date;
  /** NUMERIC(5,2): the driver returns it as a string. */
  declare nivelConfiabilidad: CreationOptional<string | number | null>;
  declare estado: CreationOptional<string>;
  declare puntosOtorgados: CreationOptional<number>;
  declare motivoSinPuntos: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initReporteModel(sequelize: Sequelize): void {
  ReporteModel.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      usuarioId: { type: DataTypes.INTEGER, allowNull: false },
      lugarId: { type: DataTypes.INTEGER, allowNull: false },
      nivelSaturacion: { type: DataTypes.STRING(10), allowNull: false },
      fechaHora: { type: DataTypes.DATE, allowNull: false },
      nivelConfiabilidad: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      estado: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'ACTIVO' },
      puntosOtorgados: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
      motivoSinPuntos: { type: DataTypes.STRING(20), allowNull: true },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, modelName: 'Reporte', tableName: 'reporte_saturacion', underscored: true, timestamps: true },
  );
}
