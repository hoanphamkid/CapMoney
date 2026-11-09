import type { RequestHandler } from 'express';
import { z } from 'zod';
import { UserModel } from '../models/User.js';
import { ProfileModel } from '../models/Profile.js';
import { SessionModel } from '../models/Session.js';
import { AppError } from '../middleware/error.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { hashToken, randomToken } from '../utils/crypto.js';
import { signAccessToken } from '../utils/jwt.js';
import { sendMail } from '../services/mailService.js';

const registerSchema = z.object({ name: z.string().trim().min(2, 'Họ tên cần ít nhất 2 ký tự').max(80), email: z.string().trim().email('Email không hợp lệ'), password: z.string().min(8, 'Mật khẩu cần ít nhất 8 ký tự').max(128), phone: z.string().trim().max(24).optional().or(z.literal('')) });
const loginSchema = z.object({ email: z.string().trim().email('Email không hợp lệ'), password: z.string().min(1, 'Vui lòng nhập mật khẩu'), remember: z.boolean().default(true) });
const profileSchema = z.object({ name: z.string().trim().min(2).max(80), phone: z.string().trim().max(24).optional().or(z.literal('')), locale: z.string().trim().max(16).default('vi-VN'), currency: z.string().trim().length(3).default('VND'), timezone: z.string().trim().max(64).default('Asia/Ho_Chi_Minh') });
const passwordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(128) });

const ACCESS_COOKIE = 'capmoney_access';
const REFRESH_COOKIE = 'capmoney_refresh';
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' };

function publicUser(user: { _id: unknown; email: string; name: string; phone?: string | null; role?: string; emailVerifiedAt?: Date | null }) {
  return { id: String(user._id), email: user.email, name: user.name, phone: user.phone ?? '', role: user.role ?? 'user', emailVerified: Boolean(user.emailVerifiedAt) };
}

async function createSession(request: Parameters<RequestHandler>[0], user: { _id: unknown; role?: string }, remember = true) {
  const refreshToken = randomToken();
  const maxAge = remember ? 1000 * 60 * 60 * 24 * 30 : 1000 * 60 * 60 * 24;
  await SessionModel.create({ userId: user._id, tokenHash: hashToken(refreshToken), deviceName: request.get('sec-ch-ua-platform') ?? 'Trình duyệt', userAgent: request.get('user-agent')?.slice(0, 500), ipAddress: request.ip, expiresAt: new Date(Date.now() + maxAge) });
  request.res?.cookie(REFRESH_COOKIE, refreshToken, { ...cookieOptions, maxAge });
  request.res?.cookie(ACCESS_COOKIE, signAccessToken({ sub: String(user._id), role: (user.role ?? 'user') as 'user' | 'admin' }), { ...cookieOptions, maxAge: 1000 * 60 * 15 });
}

export const register: RequestHandler = async (request, response) => {
  const input = registerSchema.parse(request.body);
  const email = input.email.toLowerCase();
  if (await UserModel.exists({ email })) throw new AppError(409, 'Email này đã được đăng ký', 'EMAIL_EXISTS');
  const user = await UserModel.create({ email, name: input.name, phone: input.phone || undefined, passwordHash: await hashPassword(input.password) });
  await ProfileModel.create({ userId: user._id });
  const verifyToken = randomToken(32);
  await sendMail({ to: email, subject: 'Xác minh email CapMoney', text: `Xin chào ${user.name},\n\nMã xác minh của bạn: ${verifyToken}\n\nBạn có thể xác minh email từ trang Cài đặt.` });
  await createSession(request, user, true);
  response.status(201).json({ user: publicUser(user), message: 'Tài khoản đã được tạo. Hãy xác minh email để bảo vệ tài khoản.' });
};

export const login: RequestHandler = async (request, response) => {
  const input = loginSchema.parse(request.body);
  const user = await UserModel.findOne({ email: input.email.toLowerCase() }).select('+passwordHash');
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) throw new AppError(401, 'Email hoặc mật khẩu không đúng', 'INVALID_CREDENTIALS');
  if (user.status !== 'active') throw new AppError(423, 'Tài khoản đang bị khóa. Vui lòng liên hệ hỗ trợ.', 'ACCOUNT_LOCKED');
  user.lastLoginAt = new Date();
  await user.save();
  await createSession(request, user, input.remember);
  response.json({ user: publicUser(user) });
};

export const refresh: RequestHandler = async (request, response) => {
  const token = request.cookies?.[REFRESH_COOKIE];
  if (!token) throw new AppError(401, 'Phiên đăng nhập đã hết hạn', 'REFRESH_REQUIRED');
  const session = await SessionModel.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
  if (!session) throw new AppError(401, 'Phiên đăng nhập đã hết hạn', 'REFRESH_REQUIRED');
  const user = await UserModel.findById(session.userId);
  if (!user || user.status !== 'active') throw new AppError(401, 'Phiên đăng nhập không còn hợp lệ', 'SESSION_INVALID');
  session.lastActiveAt = new Date(); await session.save();
  response.cookie(ACCESS_COOKIE, signAccessToken({ sub: String(user._id), role: user.role as 'user' | 'admin' }), { ...cookieOptions, maxAge: 1000 * 60 * 15 });
  response.json({ user: publicUser(user) });
};

export const logout: RequestHandler = async (request, response) => {
  const token = request.cookies?.[REFRESH_COOKIE];
  if (token) await SessionModel.deleteOne({ tokenHash: hashToken(token) });
  response.clearCookie(ACCESS_COOKIE, cookieOptions); response.clearCookie(REFRESH_COOKIE, cookieOptions);
  response.status(204).send();
};

export const me: RequestHandler = async (request, response) => {
  const user = await UserModel.findById(request.user!.id).lean();
  if (!user) throw new AppError(404, 'Không tìm thấy tài khoản', 'USER_NOT_FOUND');
  const profile = await ProfileModel.findOne({ userId: user._id }).lean();
  response.json({ user: publicUser(user), profile });
};

export const updateMe: RequestHandler = async (request, response) => { const input = profileSchema.parse(request.body); const user = await UserModel.findByIdAndUpdate(request.user!.id, { $set: { name: input.name, phone: input.phone || undefined } }, { new: true, runValidators: true }); if (!user) throw new AppError(404, 'Không tìm thấy tài khoản', 'USER_NOT_FOUND'); const profile = await ProfileModel.findOneAndUpdate({ userId: user._id }, { $set: { locale: input.locale, currency: input.currency.toUpperCase(), timezone: input.timezone } }, { new: true, upsert: true, runValidators: true }).lean(); response.json({ user: publicUser(user), profile }); };

export const changePassword: RequestHandler = async (request, response) => { const input = passwordSchema.parse(request.body); const user = await UserModel.findById(request.user!.id).select('+passwordHash'); if (!user || !(await verifyPassword(input.currentPassword, user.passwordHash))) throw new AppError(400, 'Mật khẩu hiện tại không đúng', 'PASSWORD_INVALID'); user.passwordHash = await hashPassword(input.newPassword); await user.save(); response.status(204).send(); };

export const sessions: RequestHandler = async (request, response) => {
  const rows = await SessionModel.find({ userId: request.user!.id }).sort({ lastActiveAt: -1 }).select('-tokenHash').lean();
  response.json({ sessions: rows.map(row => ({ ...row, id: String(row._id), current: row.tokenHash === hashToken(request.cookies?.[REFRESH_COOKIE] ?? '') })) });
};

export const logoutOtherSessions: RequestHandler = async (request, response) => {
  const token = request.cookies?.[REFRESH_COOKIE];
  await SessionModel.deleteMany({ userId: request.user!.id, tokenHash: { $ne: hashToken(token ?? '') } });
  response.status(204).send();
};
