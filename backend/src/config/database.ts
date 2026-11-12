import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDatabase(uri = env.MONGO_URI) {
  if (!uri) throw new Error('MONGO_URI is not configured');
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    autoIndex: env.NODE_ENV !== 'production',
    serverSelectionTimeoutMS: 4500,
    connectTimeoutMS: 4500,
    socketTimeoutMS: 4500,
  });
  return mongoose.connection;
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
