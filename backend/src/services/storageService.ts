import { readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import mongoose from 'mongoose';
import { randomToken } from '../utils/crypto.js';

// Existing local installations may still have receipts stored on disk.
const uploadDir = path.resolve(process.cwd(), '..', '.local', 'uploads');
const imagePrefix = 'gridfs:';

function imageBucket() {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database must be connected before accessing receipt images');
  return new mongoose.mongo.GridFSBucket(db, { bucketName: 'transaction_images' });
}

async function storeImage(buffer: Buffer, mimetype: string, extension: string) {
  const bucket = imageBucket();
  const upload = bucket.openUploadStream(`${randomToken(18)}${extension}`, { metadata: { mimetype } });
  try {
    await pipeline(Readable.from([buffer]), upload);
  } catch (error) {
    // Remove any chunks written before an interrupted upload.
    await bucket.delete(upload.id).catch(() => {});
    throw error;
  }
  return `${imagePrefix}${upload.id.toHexString()}`;
}

export async function savePrivateImage(file: { buffer: Buffer; mimetype: string; originalname: string }) {
  const extension = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '') || '.jpg';
  return storeImage(file.buffer, file.mimetype, extension);
}

export async function saveBufferImage(buffer: Buffer, mimetype: string, ext = '.svg') {
  const extension = ext.startsWith('.') ? ext : `.${ext}`;
  const key = await storeImage(buffer, mimetype, extension);
  return { key, mimetype, size: buffer.length };
}

export async function readPrivateImage(key: string) {
  if (key.startsWith(imagePrefix)) {
    const download = imageBucket().openDownloadStream(new mongoose.mongo.ObjectId(key.slice(imagePrefix.length)));
    const chunks: Buffer[] = [];
    for await (const chunk of download) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
  return readFile(path.join(uploadDir, path.basename(key)));
}

export async function deletePrivateImage(key?: string | null) {
  if (!key) return;
  if (key.startsWith(imagePrefix)) {
    const id = new mongoose.mongo.ObjectId(key.slice(imagePrefix.length));
    try {
      await imageBucket().delete(id);
    } catch (error) {
      // Cleanup may be repeated after a retry or a deleted transaction.
      if (!(error instanceof mongoose.mongo.MongoRuntimeError && error.message === `File not found for id ${id}`)) throw error;
    }
    return;
  }
  try { await unlink(path.join(uploadDir, path.basename(key))); } catch { /* The database record remains authoritative. */ }
}
