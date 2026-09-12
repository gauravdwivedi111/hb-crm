#!/usr/bin/env node

/**
 * HB CRM Production Startup Script
 *
 * Designed for deployment platforms (Railway, Render, AWS ECS, Docker).
 * Safely applies pending database migrations before starting the Express server.
 * If migrations fail, the process exits with code 1, preventing the server
 * from starting in an inconsistent database state.
 */

import { spawnSync, spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');

console.info('\n===========================================================');
console.info('      HB CRM — PRODUCTION STARTUP SEQUENCE');
console.info('===========================================================');

// Step 1: Execute prisma migrate deploy
console.info('[Deploy 1/2] Checking and applying database migrations (prisma migrate deploy)...');

const isWindows = process.platform === 'win32';
const npxCmd = isWindows ? 'npx.cmd' : 'npx';

const migrationResult = spawnSync(npxCmd, ['prisma', 'migrate', 'deploy'], {
  cwd: backendRoot,
  stdio: 'inherit',
  env: process.env,
});

if (migrationResult.status !== 0) {
  console.error('\n[FATAL ERROR] Prisma database migration failed with status code:', migrationResult.status);
  console.error('[FATAL ERROR] Aborting server launch to prevent running with a partially-migrated database.');
  process.exit(migrationResult.status || 1);
}

console.info('\n[Deploy 1/2] Database migrations applied successfully.');

// Step 2: Launch compiled server
console.info('[Deploy 2/2] Starting production server (node dist/server.js)...\n');

const serverProcess = spawn('node', ['dist/server.js'], {
  cwd: backendRoot,
  stdio: 'inherit',
  env: process.env,
});

// Forward termination signals to the server child process
const handleSignal = (signal) => {
  console.info(`[Production Boot] Received ${signal}, forwarding to server process...`);
  if (!serverProcess.killed) {
    serverProcess.kill(signal);
  }
};

process.on('SIGTERM', () => handleSignal('SIGTERM'));
process.on('SIGINT', () => handleSignal('SIGINT'));

serverProcess.on('exit', (code, signal) => {
  if (code !== 0 && code !== null) {
    console.error(`[Production Boot] Server process exited with code ${code}`);
    process.exit(code);
  } else if (signal) {
    console.info(`[Production Boot] Server terminated via signal ${signal}`);
    process.exit(0);
  } else {
    process.exit(0);
  }
});
