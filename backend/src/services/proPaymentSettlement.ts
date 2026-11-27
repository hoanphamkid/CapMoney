import { z } from 'zod';

export type ProPaymentChannel = 'mbbank' | 'sepay';

type PaymentAccounts = {
  createIndex(keys: Record<string, 1>, options: { unique: true; sparse: true }): Promise<unknown>;
  updateOne(filter: Record<string, unknown>, update: Record<string, unknown>): Promise<unknown>;
};

export const proTransferSchema = z.object({
  id: z.number().int().positive(),
  gateway: z.string().trim().min(1).max(64),
  accountNumber: z.string().trim().min(1).max(64),
  transferType: z.enum(['in', 'out']),
  transferAmount: z.number().int().positive(),
  content: z.string().max(2_000),
});

const paymentIndexes = new WeakMap<PaymentAccounts, Promise<void>>();

export function ensurePaymentIndexes(accounts: PaymentAccounts) {
  let ready = paymentIndexes.get(accounts);
  if (!ready) {
    // Production connections disable automatic index creation.
    ready = Promise.all([
      accounts.createIndex({ 'proPayment.code': 1 }, { unique: true, sparse: true }),
      accounts.createIndex({ 'proPayment.transactionId': 1 }, { unique: true, sparse: true }),
    ]).then(() => {}).catch(error => {
      paymentIndexes.delete(accounts);
      throw error;
    });
    paymentIndexes.set(accounts, ready);
  }
  return ready;
}

export function normalizeGateway(value: string) {
  const normalized = value.toLowerCase().replace(/[\s_-]/g, '');
  return normalized === 'mb' ? 'mbbank' : normalized;
}

export async function settleProTransfer(accounts: PaymentAccounts, transfer: z.infer<typeof proTransferSchema>, channel: ProPaymentChannel) {
  if (transfer.transferType !== 'in') return;
  const codes = new Set(transfer.content.toUpperCase().match(/\bCPPRO[A-F0-9]{16}\b/g));
  if (codes.size !== 1) return;
  const [code] = codes;
  await ensurePaymentIndexes(accounts);
  try {
    await accounts.updateOne({
      'proPayment.code': code,
      'proPayment.channel': channel === 'sepay' ? { $in: ['sepay', null] } : channel,
      'proPayment.gateway': normalizeGateway(transfer.gateway),
      'proPayment.accountNumber': transfer.accountNumber,
      'proPayment.amount': transfer.transferAmount,
      'proPayment.paidAt': null,
    }, { $set: { 'proPayment.paidAt': new Date(), 'proPayment.transactionId': transfer.id } });
  } catch (error) {
    // The unique transaction ID prevents a retry from paying a second order.
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000)) throw error;
  }
}

// Both bank webhook entry points authenticate and validate the MB account
// before passing an accepted delivery here.
export async function settleProFromBankDelivery(accounts: PaymentAccounts, payload: unknown) {
  const body = typeof payload === 'string' ? JSON.parse(payload) : payload;
  const result = proTransferSchema.safeParse(body);
  if (result.success) await settleProTransfer(accounts, result.data, 'mbbank');
}
