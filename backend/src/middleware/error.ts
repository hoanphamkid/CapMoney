import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import pino from 'pino';

export const logger = pino({ level: process.env.LOG_LEVEL ?? 'info', redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'] });

export class AppError extends Error {
  constructor(public statusCode: number, message: string, public code = 'APP_ERROR', public details?: unknown) {
    super(message);
  }
}

export const notFound: RequestHandler = (request, _response, next) => {
  next(new AppError(404, `Không tìm thấy ${request.method} ${request.path}`, 'NOT_FOUND'));
};

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  if (error?.type === 'entity.too.large') {
    response.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Dữ liệu quá lớn. Hãy giảm kích thước ảnh giao dịch rồi thử lại.' } });
    return;
  }
  if (error?.code === 'LIMIT_FILE_SIZE') {
    response.status(400).json({ error: { code: 'IMAGE_TOO_LARGE', message: 'Ảnh không được vượt quá 10MB' } });
    return;
  }
  if (error instanceof ZodError) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Dữ liệu chưa hợp lệ', details: error.flatten() } });
    return;
  }
  const known = error instanceof AppError;
  const status = known ? error.statusCode : 500;
  if (status >= 500) logger.error({ err: error, method: request.method, path: request.path }, 'request failed');
  response.status(status).json({ error: { code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : 'Đã có lỗi xảy ra. Vui lòng thử lại sau.', ...(known && error.details ? { details: error.details } : {}) } });
};
