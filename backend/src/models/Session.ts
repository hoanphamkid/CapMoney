import { Schema, model } from 'mongoose';

const SessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, index: true },
  deviceName: { type: String, maxlength: 120 },
  userAgent: { type: String, maxlength: 500 },
  ipAddress: { type: String, maxlength: 80 },
  lastActiveAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true, collection: 'sessions' });

export const SessionModel = model('Session', SessionSchema);
