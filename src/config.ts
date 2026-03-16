import { z } from 'zod';
import 'dotenv/config';

export const SERVER_NAME = 'zulip-mcp';
export const SERVER_VERSION = '0.1.0';

const ConfigSchema = z.object({
  username: z.string().email('ZULIP_USERNAME must be a valid email'),
  apiKey: z.string().min(1, 'ZULIP_API_KEY is required'),
  realm: z.string().url('ZULIP_REALM must be a valid URL'),
  requestTimeoutMs: z.coerce.number().int().positive().default(20000),
  maxRetries: z.coerce.number().int().min(0).max(10).default(3),
});

export type ZulipMcpConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(): ZulipMcpConfig {
  const result = ConfigSchema.safeParse({
    username: process.env.ZULIP_USERNAME,
    apiKey: process.env.ZULIP_API_KEY,
    realm: process.env.ZULIP_REALM,
    requestTimeoutMs: process.env.ZULIP_REQUEST_TIMEOUT_MS,
    maxRetries: process.env.ZULIP_MAX_RETRIES,
  });

  if (!result.success) {
    const errors = result.error.errors.map(e => `  ${e.path.join('.')}: ${e.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${errors}\n\nSee .env.example for required environment variables.`);
  }

  return result.data;
}
