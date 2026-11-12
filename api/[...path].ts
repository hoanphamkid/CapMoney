import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createApp } from '../backend/src/app.js';
import { connectDatabase } from '../backend/src/config/database.js';

let appPromise: Promise<ReturnType<typeof createApp>> | null = null;

async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      await connectDatabase();
      return createApp();
    })();
  }
  return appPromise;
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
    const app = await getApp();
    return app(request, response);
  } catch (error) {
    console.error('[api] failed to initialize backend');
    return response.status(503).json({ error: { code: 'API_UNAVAILABLE', message: 'Máy chủ dữ liệu chưa sẵn sàng.' } });
  }
}
