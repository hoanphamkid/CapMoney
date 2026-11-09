import type { RequestHandler } from 'express';
import { UserModel } from '../models/User.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { AppError } from './error.js';

declare global { namespace Express { interface Request { user?: { id: string; role: 'user' | 'admin' } } } }

export const requireAuth: RequestHandler = async (request, _response, next) => {
  try {
    const token = request.cookies?.capmoney_access;
    if (!token) throw new AppError(401, 'Vui lòng đăng nhập để tiếp tục', 'UNAUTHENTICATED');
    const claims = verifyAccessToken(token);
    const user = await UserModel.findById(claims.sub).select('_id role status').lean();
    if (!user || user.status !== 'active') throw new AppError(401, 'Phiên đăng nhập không còn hợp lệ', 'SESSION_INVALID');
    request.user = { id: String(user._id), role: user.role as 'user' | 'admin' };
    next();
  } catch (error) { next(error instanceof AppError ? error : new AppError(401, 'Phiên đăng nhập không còn hợp lệ', 'SESSION_INVALID')); }
};

export const requireAdmin: RequestHandler = (request, _response, next) => {
  if (request.user?.role !== 'admin') { next(new AppError(403, 'Bạn không có quyền thực hiện thao tác này', 'FORBIDDEN')); return; }
  next();
};
