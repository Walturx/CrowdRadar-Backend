import bcrypt from "bcrypt";
import UserRepository from "../repositories/UserRepository.js";
import jwt from "../utils/jwt.js";

class AuthService {

    async register(userData) {

        const existingUser = await UserRepository.findByEmail(userData.email);

        if (existingUser) {
            throw new Error("El correo ya está registrado.");
        }

        const passwordHash = await bcrypt.hash(userData.password, 10);

        const newUser = await UserRepository.create({
            ...userData,
            passwordHash,
            rol: "USUARIO",
            status: "ACTIVO"
        });

        return {
            id: newUser.id,
            nombre: newUser.nombre,
            apellido: newUser.apellido,
            email: newUser.email
        };

    }

    async login(email, password) {

        const user = await UserRepository.findByEmail(email);

        if (!user) {
            throw new Error("Correo o contraseña incorrectos.");
        }

        const validPassword = await bcrypt.compare(
            password,
            user.passwordHash
        );

        if (!validPassword) {
            throw new Error("Correo o contraseña incorrectos.");
        }

        const token = jwt.generateToken(user);

        return {
            token,
            user: {
                id: user.id,
                nombre: user.nombre,
                apellido: user.apellido,
                email: user.email,
                rol: user.rol
            }
        };

    }

}

export default new AuthService();