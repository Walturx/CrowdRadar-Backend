import UserRepository from "../repositories/UserRepository.js";

class UserService {

    async getProfile(id) {

        const user = await UserRepository.findById(id);

        if (!user) {
            throw new Error("Usuario no encontrado.");
        }

        return user;

    }

    async updateProfile(id, data) {

        const user = await UserRepository.update(id, data);

        if (!user) {
            throw new Error("Usuario no encontrado.");
        }

        return user;

    }

}

export default new UserService();