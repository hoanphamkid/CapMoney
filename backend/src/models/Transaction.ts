import { Schema, model } from 'mongoose';

const TransactionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  walletId: { type: Schema.Types.ObjectId, ref: 'Wallet' },
  toWalletId: { type: Schema.Types.ObjectId, ref: 'Wallet' },
  categoryId: { type: String, trim: true, maxlength: 60 },
  type: { type: String, enum: ['income', 'expense', 'transfer'], required: true },
  amountMinor: { type: Number, required: true, min: 1 },
  currency: { type: String, default: 'VND', uppercase: true, maxlength: 3 },
  note: { type: String, trim: true, maxlength: 500 },
  imageKey: { type: String, maxlength: 180 },
  imageMimeType: { type: String, maxlength: 80 },
  imageSize: { type: Number, max: 10 * 1024 * 1024 },
  transactionDate: { type: Date, required: true },
  dateKey: { type: String, required: true, index: true },
  transactionTime: { type: String, maxlength: 20 },
  source: { type: String, enum: ['manual', 'camera', 'webhook_mbbank'], default: 'manual' },
  status: { type: String, enum: ['posted', 'planned', 'cancelled'], default: 'posted' },
  idempotencyKey: { type: String, maxlength: 120 },
}, { timestamps: true, collection: 'transactions' });

TransactionSchema.index({ userId: 1, dateKey: 1 });
TransactionSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true, sparse: true });
export const TransactionModel = model('Transaction', TransactionSchema);
