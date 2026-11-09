import { Router } from 'express';
import { login, logout, logoutOtherSessions, me, refresh, register, sessions } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();
authRouter.post('/register', register);
authRouter.post('/login', login);
authRouter.post('/refresh', refresh);
authRouter.post('/logout', logout);
authRouter.get('/me', requireAuth, me);
authRouter.get('/sessions', requireAuth, sessions);
authRouter.delete('/sessions/others', requireAuth, logoutOtherSessions);
