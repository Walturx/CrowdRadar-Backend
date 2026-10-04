import cors from 'cors';
import express from 'express';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';

export const app = express();

app.use(cors());

app.use(express.json());

app.use('/api/auth', authRoutes);

app.use('/api/users', userRoutes);

app.get('/', (_req, res) => {
  res.json({ message: 'CrowdRadar API' });
});
