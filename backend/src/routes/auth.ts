import { Router } from 'express';
import { changePassword, login, logout, logoutOtherSessions, me, refresh, register, sessions, updateMe } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();
authRouter.post('/register', register);
authRouter.post('/login', login);
authRouter.post('/refresh', refresh);
authRouter.post('/logout', logout);
authRouter.get('/me', requireAuth, me);
authRouter.patch('/me', requireAuth, updateMe);
authRouter.post('/password', requireAuth, changePassword);
authRouter.get('/sessions', requireAuth, sessions);
authRouter.delete('/sessions/others', requireAuth, logoutOtherSessions);
