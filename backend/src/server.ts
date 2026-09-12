import { app } from './app.js';
import { config } from './config/env.js';
import { startFollowupCron, stopFollowupCron } from './services/followup.jobs.js';
import { initDeactivatedUsersCache } from './middleware/auth.middleware.js';

const server = app.listen(config.port, async () => {
  console.info(`[Backend] Server is running on port ${config.port} in ${config.nodeEnv} mode`);

  // Initialize deactivated users cache for zero-delay JWT revocation
  await initDeactivatedUsersCache();

  // Start background jobs if not running in test environment
  if (config.nodeEnv !== 'test') {
    startFollowupCron();
  }
});

const gracefulShutdown = (signal: string): void => {
  console.info(`[Backend] Received ${signal}. Shutting down gracefully...`);
  stopFollowupCron();
  server.close(() => {
    console.info('[Backend] HTTP server closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default server;
