import { randomBytes } from 'node:crypto';
import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../middleware/error.js';
import { UserModel, type UserDocument } from '../models/User.js';
import { BankWebhookError, verifyBankWebhook } from '../utils/bankWebhook.js';
import { ensurePaymentIndexes, normalizeGateway, proTransferSchema, settleProTransfer, type ProPaymentChannel } from '../services/proPaymentSettlement.js';

type ProPayment = NonNullable<UserDocument['proPayment']>;

function configuredPrice() {
  const amount = Number(env.PRO_PRICE_VND?.trim() || '5000');
  return Number.isSafeInteger(amount) && amount > 0 ? amount : undefined;
}

function paymentConfig() {
  const amount = configuredPrice();
  if (amount === undefined) return null;
  const accountName = env.PRO_PAYMENT_ACCOUNT_NAME?.trim() || undefined;
  const linkedBank = env.PRO_PAYMENT_USE_MBBANK_SYNC === 'true';
  const channel: ProPaymentChannel = linkedBank ? 'mbbank' : 'sepay';
  const bankName = linkedBank ? 'MB Bank' : env.PRO_PAYMENT_BANK_NAME?.trim();
  const accountNumber = (linkedBank ? env.MBBANK_ACCOUNT_NUMBER : env.PRO_PAYMENT_ACCOUNT_NUMBER)?.trim();
  if (linkedBank && ((!env.MBBANK_USER_ID && !env.MBBANK_USER_EMAIL)
    || !(env.SEPAY_WEBHOOK_SECRET || env.MBBANK_WEBHOOK_SECRET)?.trim())) return null;
  if (!linkedBank && !env.PRO_SEPAY_WEBHOOK_SECRET?.trim()) return null;
  if (!bankName || !accountNumber) return null;
  return { amount, bankName, gateway: normalizeGateway(bankName), accountName, accountNumber, channel };
}

function checkout(payment: ProPayment | null | undefined, config: ReturnType<typeof paymentConfig>) {
  if (payment?.paidAt) return { status: 'paid' };
  if (!config || (payment && (payment.gateway !== config.gateway || payment.accountNumber !== config.accountNumber
    || (payment.channel ?? 'sepay') !== config.channel))) {
    return { status: 'unavailable', price: payment?.amount ?? configuredPrice() };
  }
  if (!payment) return { status: 'available', price: config.amount };
  const { code, amount, bankName, accountNumber, accountName } = payment;
  return { status: 'pending', order: { code, amount, bankName, accountNumber, accountName } };
}

async function currentPayment(userId: string) {
  const user = await UserModel.findById(userId).select('proPayment').lean();
  if (!user) throw new AppError(404, 'Không tìm thấy tài khoản', 'USER_NOT_FOUND');
  return user.proPayment;
}

export const getProCheckout: RequestHandler = async (request, response) => {
  const payment = await currentPayment(request.user!.id);
  response.set('Cache-Control', 'no-store').json(checkout(payment, paymentConfig()));
};

export const createProOrder: RequestHandler = async (request, response) => {
  const userId = request.user!.id;
  const config = paymentConfig();
  const existing = await currentPayment(userId);
  if (existing || !config) {
    response.set('Cache-Control', 'no-store').json(checkout(existing, config));
    return;
  }

  await ensurePaymentIndexes(UserModel.collection);
  const payment = { ...config, code: `CPPRO${randomBytes(8).toString('hex').toUpperCase()}`, createdAt: new Date() };
  const updated = await UserModel.findOneAndUpdate(
    { _id: userId, proPayment: null },
    { $set: { proPayment: payment } },
    { new: true, runValidators: true },
  ).select('proPayment').lean();
  response.set('Cache-Control', 'no-store').json(checkout(updated?.proPayment ?? await currentPayment(userId), config));
};

export const confirmProPayment: RequestHandler = async (request, response) => {
  try {
    verifyBankWebhook(request.headers, env.PRO_SEPAY_WEBHOOK_SECRET?.trim());
  } catch (error) {
    if (error instanceof BankWebhookError) throw new AppError(error.status, error.message, error.code);
    throw error;
  }
  await settleProTransfer(UserModel.collection, proTransferSchema.parse(request.body), 'sepay');
  response.json({ success: true });
};
