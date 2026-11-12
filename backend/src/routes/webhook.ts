import { Router } from 'express';
import { handleMbBankWebhook } from '../controllers/webhookController.js';

export const webhookRouter = Router();

// Public webhook endpoints secured by MBBANK_WEBHOOK_SECRET
webhookRouter.post('/mbbank', handleMbBankWebhook);
webhookRouter.post('/sepay', handleMbBankWebhook);
webhookRouter.post('/casso', handleMbBankWebhook);
