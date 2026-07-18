import jwt from "../utils/jwt.js";

const authMiddleware = (req, res, next) => {

    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            message: "Token no proporcionado."
        });
    }

    const token = authHeader.split(" ")[1];

    try {

        const payload = jwt.verifyToken(token);

        req.user = payload;

        next();

    } catch (error) {

        return res.status(401).json({
            message: "Token inválido."
        });

    }

};

export default authMiddleware;