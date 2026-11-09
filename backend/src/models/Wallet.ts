import { Schema, model } from 'mongoose';

const WalletSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  type: { type: String, enum: ['cash', 'bank', 'savings', 'e_wallet', 'credit', 'custom'], default: 'cash' },
  balanceMinor: { type: Number, required: true, default: 0 },
  currency: { type: String, default: 'VND', uppercase: true, maxlength: 3 },
  color: { type: String, default: '#163e36' },
  active: { type: Boolean, default: true },
}, { timestamps: true, collection: 'wallets' });

WalletSchema.index({ userId: 1, active: 1 });
export const WalletModel = model('Wallet', WalletSchema);
