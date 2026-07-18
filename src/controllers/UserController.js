import UserService from "../services/UserService.js";

class UserController {

    async getProfile(req, res) {

        try {

            const user = await UserService.getProfile(req.user.id);

            return res.status(200).json({
                data: user
            });

        } catch (error) {

            return res.status(404).json({
                message: error.message
            });

        }

    }

    async updateProfile(req, res) {

        try {

            const user = await UserService.updateProfile(
                req.user.id,
                req.body
            );

            return res.status(200).json({
                message: "Perfil actualizado correctamente.",
                data: user
            });

        } catch (error) {

            return res.status(400).json({
                message: error.message
            });

        }

    }

}

export default new UserController();