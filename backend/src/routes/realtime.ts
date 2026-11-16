import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/auth.js';
import { TransactionModel } from '../models/Transaction.js';

export const realtimeRouter = Router();
realtimeRouter.use(requireAuth);

realtimeRouter.get('/events', async (request, response) => {
  // Database change streams also see commits made by standalone Vercel webhook
  // functions. An in-memory event emitter would miss those transactions.
  const changes = mongoose.connection.db!.collection(TransactionModel.collection.collectionName).watch([
    { $match: { operationType: 'insert', 'fullDocument.userId': new mongoose.Types.ObjectId(request.user!.id), 'fullDocument.source': 'webhook_mbbank' } },
  ], { maxAwaitTimeMS: 1000 });
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    clearTimeout(expiry);
    void changes.close().catch(() => {});
    response.end();
  };
  response.on('close', close);
  try {
    // Open the database cursor before telling the browser to refresh, so there
    // is no gap between its initial data load and the first watched insert.
    const first = await changes.tryNext();
    if (closed) return;
    response.status(200).set({
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-store, no-transform',
      'X-Accel-Buffering': 'no',
    });
    response.flushHeaders();
    const send = (event: string, data: unknown) => { if (!closed) response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
    send('ready', {});
    heartbeat = setInterval(() => { if (!closed) response.write(': keepalive\n\n'); }, 5000);
    // Rotate before serverless duration limits and before access-token expiry.
    expiry = setTimeout(() => { send('reconnect', {}); close(); }, 25000);
    let change = first;
    while (!closed) {
      if (change?.operationType === 'insert') {
        const tx = change.fullDocument;
        send('bank-transaction', { id: String(tx._id), type: tx.type, amount: tx.amountMinor / 100 });
      }
      change = await changes.tryNext();
    }
  } catch {
    // The client retains interval/focus refresh when streaming is unavailable.
    if (!closed && !response.headersSent) response.status(503).json({ error: { code: 'REALTIME_UNAVAILABLE', message: 'Kết nối trực tiếp tạm thời gián đoạn.' } });
  } finally { close(); }
});
