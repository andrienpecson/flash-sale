import cors from 'cors';
import express, { Express } from 'express';
import { router } from './routes';
import { apiLimiter } from './middleware/rateLimit';
import { errorHandler } from './middleware/errorHandler';

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use((req, _res, next) => {
    console.log(`${req.method} ${req.originalUrl}`);
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api', apiLimiter, router);
  app.use(errorHandler);

  return app;
}
