import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().url().or(z.string().startsWith('file:')),
  JWT_SECRET: z.string().min(8),
  PORT: z.coerce.number().int().positive().default(3001),
  UPLOAD_DIR: z.string().default('./uploads'),
  BASE_URL: z.string().url().default('http://localhost:4321'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TZ: z.string().default('Europe/Moscow').refine((tz) => {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, { message: 'Invalid IANA timezone identifier' }),
});

const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
  console.error('❌ Invalid environment variables:', JSON.stringify(parseResult.error.format(), null, 2));
  process.exit(1);
}

export const config = parseResult.data;
