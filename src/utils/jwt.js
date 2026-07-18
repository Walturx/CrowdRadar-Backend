import jwt from "jsonwebtoken";

class Jwt {

    generateToken(user) {

        return jwt.sign(
            {
                id: user.id,
                email: user.email,
                rol: user.rol
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "2h"
            }
        );

    }

    verifyToken(token) {

        return jwt.verify(
            token,
            process.env.JWT_SECRET
        );

    }

}

export default new Jwt();