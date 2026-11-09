import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

const root = path.resolve(process.cwd(), '..');

export async function sendMail(input: { to: string; subject: string; text: string; html?: string }) {
  if (env.MAIL_TRANSPORT === 'smtp') {
    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
    await transport.sendMail({ from: env.SMTP_FROM, ...input });
    return { mode: 'smtp' as const };
  }

  const mailDir = path.join(root, '.local', 'mail');
  await mkdir(mailDir, { recursive: true });
  const safeName = `${Date.now()}-${input.to.replace(/[^a-z0-9]/gi, '_')}.eml`;
  await writeFile(path.join(mailDir, safeName), `To: ${input.to}\nSubject: ${input.subject}\nContent-Type: text/plain; charset=utf-8\n\n${input.text}\n`);
  return { mode: 'file' as const, path: path.join('.local', 'mail', safeName) };
}
