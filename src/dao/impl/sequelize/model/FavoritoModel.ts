import { DataTypes, Model } from 'sequelize';
import type { CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';

/** Sequelize model of the `lugar_favorito` table (migration 07). Only dao/impl/sequelize sees it. */
export class FavoritoModel extends Model<InferAttributes<FavoritoModel>, InferCreationAttributes<FavoritoModel>> {
  declare id: CreationOptional<number>;
  declare usuarioId: number;
  declare lugarId: number;
  declare alertasActivadas: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initFavoritoModel(sequelize: Sequelize): void {
  FavoritoModel.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      usuarioId: { type: DataTypes.INTEGER, allowNull: false },
      lugarId: { type: DataTypes.INTEGER, allowNull: false },
      alertasActivadas: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, modelName: 'Favorito', tableName: 'lugar_favorito', underscored: true, timestamps: true },
  );
}
