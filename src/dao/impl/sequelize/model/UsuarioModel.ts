import { DataTypes, Model } from 'sequelize';
import type { CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';

/** Sequelize model of the `usuario` table (migration 01). Only dao/impl/sequelize sees it. */
export class UsuarioModel extends Model<InferAttributes<UsuarioModel>, InferCreationAttributes<UsuarioModel>> {
  declare id: CreationOptional<number>;
  declare nombre: string;
  declare apellido: string;
  declare email: string;
  declare passwordHash: string | null;
  declare telefono: string | null;
  declare distrito: string | null;
  declare rol: CreationOptional<string>;
  declare status: CreationOptional<string>;
  declare puntosKarma: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initUsuarioModel(sequelize: Sequelize): void {
  UsuarioModel.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      nombre: { type: DataTypes.STRING(80), allowNull: false },
      apellido: { type: DataTypes.STRING(80), allowNull: false },
      email: { type: DataTypes.STRING(120), allowNull: false, unique: true },
      passwordHash: { type: DataTypes.STRING(100), allowNull: true },
      telefono: { type: DataTypes.STRING(20), allowNull: true },
      distrito: { type: DataTypes.STRING(60), allowNull: true },
      rol: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'USUARIO' },
      status: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'ACTIVO' },
      puntosKarma: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, modelName: 'Usuario', tableName: 'usuario', underscored: true, timestamps: true },
  );
}
