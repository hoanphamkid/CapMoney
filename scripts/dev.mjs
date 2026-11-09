import { spawn } from 'node:child_process';
import path from 'node:path';
import { config } from 'dotenv';
import { projectRoot, startLocalDatabase } from './database.mjs';

config({ path: path.join(projectRoot, '.env'), quiet: true });
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 48) {
  console.error('Run npm run setup first. JWT_SECRET must contain at least 48 characters.');
  process.exit(1);
}

let localDatabase;
if (!process.env.MONGO_URI) {
  console.log('Starting persistent local MongoDB (.local/mongodb)…');
  const { database, uri } = await startLocalDatabase();
  localDatabase = database;
  process.env.MONGO_URI = uri;
}

const children = [
  spawn(process.execPath, [path.join(projectRoot, 'node_modules/tsx/dist/cli.mjs'), 'watch', 'src/server.ts'], { cwd: path.join(projectRoot, 'backend'), env: process.env, stdio: 'inherit' }),
  spawn(process.execPath, [path.join(projectRoot, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1'], { cwd: path.join(projectRoot, 'frontend'), env: process.env, stdio: 'inherit' }),
];

let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  await localDatabase?.stop({ doCleanup: false });
  process.exit(code);
}
for (const child of children) child.on('exit', code => { if (!stopping) void stop(code ?? 1); });
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
