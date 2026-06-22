import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

/**
 * Per-IP rate limiter for the public /api routes, to limit how many requests a
 * single client can send to the purchase/status endpoints. Over the limit it
 * replies 429 in the project's `{ error: { code, message } }` envelope.
 */
export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: 'draft-7', // emit RateLimit-* headers
  legacyHeaders: false,
  // Respond in the project's { error: { code, message } } envelope.
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        code: 'rate_limited',
        message: 'Too many requests, please try again shortly.',
      },
    });
  },
});
