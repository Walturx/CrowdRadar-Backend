import AuthService from "../services/AuthService.js";

class AuthController {

    async register(req, res) {

        try {

            const user = await AuthService.register(req.body);

            return res.status(201).json({
                message: "Usuario registrado correctamente.",
                data: user
            });

        } catch (error) {

            return res.status(400).json({
                message: error.message
            });

        }

    }

    async login(req, res) {

        try {

            const { email, password } = req.body;

            const response = await AuthService.login(email, password);

            return res.status(200).json({
                message: "Inicio de sesión exitoso.",
                data: response
            });

        } catch (error) {

            return res.status(401).json({
                message: error.message
            });

        }

    }

}

export default new AuthController();