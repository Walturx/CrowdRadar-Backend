import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database.js";

class User extends Model {}

User.init(
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        nombre: {
            type: DataTypes.STRING,
            allowNull: false
        },
        apellido: {
            type: DataTypes.STRING,
            allowNull: false
        },
        email: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        passwordHash: {
            type: DataTypes.STRING,
            allowNull: false
        },
        telefono: {
            type: DataTypes.STRING
        },
        rol: {
            type: DataTypes.STRING
        },
        distrito: {
            type: DataTypes.STRING
        },
        status: {
            type: DataTypes.STRING
        },
    },
    {
        sequelize,
        modelName: "User",
        tableName: "users",
        timestamps: true
    }
);

export default User;