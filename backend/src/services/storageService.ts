import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomToken } from '../utils/crypto.js';

const uploadDir = path.resolve(process.cwd(), '..', '.local', 'uploads');

export async function savePrivateImage(file: { buffer: Buffer; mimetype: string; originalname: string }) {
  await mkdir(uploadDir, { recursive: true });
  const extension = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '') || '.jpg';
  const key = `${randomToken(18)}${extension}`;
  await writeFile(path.join(uploadDir, key), file.buffer, { flag: 'wx' });
  return key;
}

export async function saveBufferImage(buffer: Buffer, mimetype: string, ext = '.svg') {
  await mkdir(uploadDir, { recursive: true });
  const extension = ext.startsWith('.') ? ext : `.${ext}`;
  const key = `${randomToken(18)}${extension}`;
  await writeFile(path.join(uploadDir, key), buffer, { flag: 'wx' });
  return { key, mimetype, size: buffer.length };
}

export async function readPrivateImage(key: string) {
  return readFile(path.join(uploadDir, path.basename(key)));
}

export async function deletePrivateImage(key?: string | null) {
  if (!key) return;
  try { await unlink(path.join(uploadDir, path.basename(key))); } catch { /* The database record remains authoritative. */ }
}
