import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { authRouter } from './routes/auth.js';
import { financeRouter } from './routes/finance.js';
import { calendarRouter } from './routes/calendar.js';
import { webhookRouter } from './routes/webhook.js';
import { backupsRouter } from './routes/backups.js';
import { notificationsRouter } from './routes/notifications.js';
import { realtimeRouter } from './routes/realtime.js';
import { loansRouter } from './routes/loans.js';
import { isProCheckoutConfigured } from './controllers/proPayments.js';
import { errorHandler, logger, notFound } from './middleware/error.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
  app.use(cookieParser());
  app.use((pinoHttp as any)({ logger }));
  app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.get('/api/health', (_request, response) => response.json({
    status: 'ok',
    service: 'capmoney-api',
    timestamp: new Date().toISOString(),
    proCheckoutConfigured: isProCheckoutConfigured(),
  }));
  app.use('/api/backups', backupsRouter);
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/auth', authRouter);
  app.use('/api/webhooks', webhookRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/realtime', realtimeRouter);
  app.use('/api/loans', loansRouter);
  app.use('/api', financeRouter);
  app.use('/api/calendar', calendarRouter);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
