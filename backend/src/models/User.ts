import { Schema, model, type InferSchemaType } from 'mongoose';

const UserSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  phone: { type: String, trim: true, maxlength: 24 },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  status: { type: String, enum: ['active', 'locked'], default: 'active' },
  emailVerifiedAt: { type: Date },
  lastLoginAt: { type: Date },
}, { timestamps: true, collection: 'users' });

export type UserDocument = InferSchemaType<typeof UserSchema> & { _id: Schema.Types.ObjectId };
export const UserModel = model('User', UserSchema);
