import { Schema, model, type InferSchemaType } from 'mongoose';

const ProPaymentSchema = new Schema({
  code: { type: String, required: true },
  amount: { type: Number, required: true },
  bankName: { type: String, required: true },
  gateway: { type: String, required: true },
  accountName: { type: String },
  accountNumber: { type: String, required: true },
  channel: { type: String, enum: ['mbbank', 'sepay'] },
  createdAt: { type: Date, required: true },
  paidAt: { type: Date },
  transactionId: { type: Number },
}, { _id: false });

const UserSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  phone: { type: String, trim: true, maxlength: 24 },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  proPayment: { type: ProPaymentSchema, select: false },
  status: { type: String, enum: ['active', 'locked'], default: 'active' },
  emailVerifiedAt: { type: Date },
  lastLoginAt: { type: Date },
}, { timestamps: true, collection: 'users' });

export type UserDocument = InferSchemaType<typeof UserSchema> & { _id: Schema.Types.ObjectId };
export const UserModel = model('User', UserSchema);
