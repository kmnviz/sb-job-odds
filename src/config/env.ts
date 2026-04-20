import {z} from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.string().min(1, 'NODE_ENV is required'),
  LOG_LEVEL: z.string().min(1, 'LOG_LEVEL is required'),
  APP_PORT: z
    .string()
    .optional()
    .transform((value) => {
      if (value !== undefined && value !== '') return Number(value);
      return process.env.PORT ? Number(process.env.PORT) : 8080;
    })
    .pipe(z.number().int().min(1).max(65535)),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  SM_API_BASE_URL: z.string().url('SM_API_BASE_URL must be a valid URL'),
  FIXTURES_BATCH_SIZE: z
    .string()
    .min(1, 'FIXTURES_BATCH_SIZE is required')
    .transform((value) => Number(value))
    .pipe(z.number().int().min(1).max(100)),
  FIXTURES_WINDOW_HOURS: z
    .string()
    .min(1, 'FIXTURES_WINDOW_HOURS is required')
    .transform((value) => Number(value))
    .pipe(z.number().int().min(1).max(72)),
  TARGET_BOOKMAKER_NAME: z
    .string()
    .min(1, 'TARGET_BOOKMAKER_NAME is required')
    .transform((value) => value.trim()),
});

export const env = envSchema.parse(process.env);
