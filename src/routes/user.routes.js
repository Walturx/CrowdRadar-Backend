import { Router } from "express";

import UserController from "../controllers/UserController.js";

import authMiddleware from "../middlewares/authMiddleware.js";
import validateSchema from "../middlewares/validateSchema.js";
import { updateUserSchema } from "../validations/userSchemas.js";

const router = Router();

router.get(
    "/profile",
    authMiddleware,
    UserController.getProfile
);

router.put(
    "/profile",
    authMiddleware,
    validateSchema(updateUserSchema),
    UserController.updateProfile
);

export default router;