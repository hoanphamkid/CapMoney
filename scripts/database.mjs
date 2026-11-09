import { mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export async function binaryOptions() {
  const candidates = [process.env.MONGOMS_SYSTEM_BINARY];
  if (process.platform === 'win32') {
    candidates.push('C:/Program Files/MongoDB/Server/8.2/bin/mongod.exe');
    candidates.push('C:/Program Files/MongoDB/Server/8.0/bin/mongod.exe');
  }
  for (const candidate of candidates.filter(Boolean)) {
    try {
      await access(candidate);
      return { systemBinary: candidate, checkMD5: false };
    } catch { /* Try the next supported binary. */ }
  }
  return { version: '8.0.17', downloadDir: path.join(projectRoot, '.local/binaries') };
}

export async function startLocalDatabase() {
  const dbPath = path.join(projectRoot, '.local/mongodb');
  await mkdir(dbPath, { recursive: true });
  const database = await MongoMemoryReplSet.create({
    binary: await binaryOptions(),
    instanceOpts: [{ port: 27019, dbPath }],
    replSet: { count: 1, name: 'capmoney-local', storageEngine: 'wiredTiger' },
  });
  return { database, uri: database.getUri('capmoney') };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { config } = await import('dotenv');
  config({ path: path.join(projectRoot, '.env'), quiet: true });
  const { database, uri } = await startLocalDatabase();
  console.log(`Persistent local MongoDB: ${uri}`);
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await database.stop({ doCleanup: false });
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
