import User from "../models/User.js";

class UserRepository {

    async create(data) {
        return await User.create(data);
    }

    async findById(id) {
        return await User.findByPk(id, {
            attributes: {
                exclude: ["passwordHash"]
            }
        });
    }

    async findByEmail(email) {
        return await User.findOne({
            where: {
                email
            }
        });
    }

    async update(id, data) {

        const user = await User.findByPk(id);

        if (!user) {
            return null;
        }

        await user.update(data);

        return await User.findByPk(id, {
            attributes: {
                exclude: ["passwordHash"]
            }
        });

    }

}

export default new UserRepository();