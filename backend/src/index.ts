import { createApp } from './app';
import { env } from './config/env';
import { redis } from './db/redis';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`Flash sale API listening on http://localhost:${env.PORT}`);
});

// Graceful shutdown: stop accepting connections, let in-flight requests drain,
// close Redis, then exit. A hard timeout guards against a stuck drain.
function shutdown(signal: string): void {
  console.log(`${signal} received — draining in-flight requests...`);
  server.close(async () => {
    await redis.quit();
    console.log('Shutdown complete.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Drain timed out — forcing exit.');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
