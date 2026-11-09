import { readFile, writeFile, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const envPath = new URL('.env', root);
try {
  await access(envPath);
  console.log('.env already exists. Existing settings were preserved.');
} catch {
  const template = await readFile(new URL('.env.example', root), 'utf8');
  await writeFile(envPath, template.replace('JWT_SECRET=\n', `JWT_SECRET=${randomBytes(48).toString('hex')}\n`), { mode: 0o600 });
  console.log(`Created ${fileURLToPath(envPath)} with a random JWT secret.`);
}
