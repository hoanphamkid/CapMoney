import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';
import { isPushEndpoint, pushConfiguration, sendTestNotification, subscriptionId } from '../services/bankNotificationService.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);
notificationsRouter.use((_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); });

const endpointSchema = z.string().max(2048).refine(isPushEndpoint, 'Địa chỉ nhận thông báo không hợp lệ.');
const subscriptionSchema = z.object({
  endpoint: endpointSchema,
  keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/), auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/) }),
});

notificationsRouter.get('/config', (_request, response) => {
  const config = pushConfiguration();
  response.json({ enabled: !!config, publicKey: config?.publicKey ?? null });
});

notificationsRouter.post('/subscription/status', async (request, response) => {
  const { endpoint } = z.object({ endpoint: endpointSchema }).parse(request.body);
  const subscription = await mongoose.connection.db!.collection('pushsubscriptions').findOne({ _id: subscriptionId(endpoint) as any, userId: request.user!.id });
  response.json({ enabled: !!subscription });
});

notificationsRouter.post('/subscription', async (request, response) => {
  if (!pushConfiguration()) throw new AppError(503, 'Máy chủ chưa cấu hình thông báo đẩy (VAPID).', 'PUSH_NOT_CONFIGURED');
  const subscription = subscriptionSchema.parse(request.body);
  await mongoose.connection.db!.collection('pushsubscriptions').updateOne(
    { _id: subscriptionId(subscription.endpoint) as any },
    { $set: { ...subscription, userId: request.user!.id, updatedAt: new Date() } }, { upsert: true },
  );
  response.status(201).json({ enabled: true });
});

notificationsRouter.delete('/subscription', async (request, response) => {
  const { endpoint } = z.object({ endpoint: endpointSchema }).parse(request.body);
  await mongoose.connection.db!.collection('pushsubscriptions').deleteOne({ _id: subscriptionId(endpoint) as any, userId: request.user!.id });
  response.status(204).end();
});

notificationsRouter.post('/test', async (request, response) => {
  if (!pushConfiguration()) throw new AppError(503, 'Máy chủ chưa cấu hình thông báo đẩy (VAPID).', 'PUSH_NOT_CONFIGURED');
  const result = await sendTestNotification(mongoose.connection.db!, request.user!.id);
  response.json(result);
});
