import { Router } from 'express';
import AuthController from '../controllers/AuthController.js';
import validateSchema from '../middlewares/validateSchema.js';
import { loginSchema, registerSchema } from '../validations/authSchemas.js';

const router = Router();

router.post('/register', validateSchema(registerSchema), (req, res) => AuthController.register(req, res));

router.post('/login', validateSchema(loginSchema), (req, res) => AuthController.login(req, res));

export default router;
