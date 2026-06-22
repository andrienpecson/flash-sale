import Redis from 'ioredis';
import { env } from '../config/env';

export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 });

redis.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[redis] connection error:', err.message);
});