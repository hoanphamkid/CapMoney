import multer from 'multer';
import { AppError } from './error.js';

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => { if (!allowedTypes.has(file.mimetype)) { callback(new AppError(400, 'Ảnh phải là JPG, PNG hoặc WEBP', 'INVALID_IMAGE_TYPE')); return; } callback(null, true); },
});
