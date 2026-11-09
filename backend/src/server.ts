import { createApp } from './app.js';
import { connectDatabase } from './config/database.js';
import { env } from './config/env.js';

const app = createApp();
await connectDatabase();
app.listen(env.PORT, '127.0.0.1', () => console.log(`CapMoney API listening on http://127.0.0.1:${env.PORT}`));
