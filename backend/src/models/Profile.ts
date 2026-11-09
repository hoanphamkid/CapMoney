import { Schema, model } from 'mongoose';

const ProfileSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  avatarUrl: { type: String },
  locale: { type: String, default: 'vi-VN' },
  currency: { type: String, default: 'VND' },
  timezone: { type: String, default: 'Asia/Ho_Chi_Minh' },
}, { timestamps: true, collection: 'profiles' });

export const ProfileModel = model('Profile', ProfileSchema);
