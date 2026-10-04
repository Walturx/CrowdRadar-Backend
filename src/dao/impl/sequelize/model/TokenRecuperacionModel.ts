import { DataTypes, Model } from 'sequelize';
import type { CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';

/** Sequelize model of the `token_recuperacion` table (migration 09). Only dao/impl/sequelize sees it. */
export class TokenRecuperacionModel extends Model<
  InferAttributes<TokenRecuperacionModel>,
  InferCreationAttributes<TokenRecuperacionModel>
> {
  declare id: CreationOptional<number>;
  declare usuarioId: number;
  declare tokenHash: string;
  declare expiraEn: Date;
  declare usadoEn: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initTokenRecuperacionModel(sequelize: Sequelize): void {
  TokenRecuperacionModel.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      usuarioId: { type: DataTypes.INTEGER, allowNull: false },
      tokenHash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
      expiraEn: { type: DataTypes.DATE, allowNull: false },
      usadoEn: { type: DataTypes.DATE, allowNull: true },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, modelName: 'TokenRecuperacion', tableName: 'token_recuperacion', underscored: true, timestamps: true },
  );
}
