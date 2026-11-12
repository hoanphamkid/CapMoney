import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),
  MONGO_URI: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(48, 'JWT_SECRET must be at least 48 characters'),
  LOG_LEVEL: z.string().default('info'),
  MAIL_TRANSPORT: z.enum(['file', 'smtp']).default('file'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('CapMoney <no-reply@capmoney.local>'),
  MBBANK_WEBHOOK_SECRET: z.string().optional(),
  SEPAY_WEBHOOK_SECRET: z.string().optional(),
  MBBANK_USER_ID: z.string().optional(),
  MBBANK_USER_EMAIL: z.string().email().optional(),
  MBBANK_ACCOUNT_NUMBER: z.string().optional(),
});

export const env = envSchema.parse(process.env);
