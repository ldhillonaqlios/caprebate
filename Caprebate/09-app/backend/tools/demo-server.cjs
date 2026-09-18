#!/usr/bin/env node
/**
 * A THROWAWAY LAUNCHER FOR LOOKING AT THE SCREENS.
 *
 * `npm start` runs the real server against a file database. This one builds an
 * in-memory application, seeds it, and listens — so a person can open the
 * screens without leaving a caprebate.db behind or having to remember to seed.
 *
 * IT REFUSES TO RUN WITHOUT CAPREBATE_ALLOW_SEED, for the same reason src/cli.ts
 * does: invented data with a known password must not arrive in a deployment
 * because somebody forgot a flag.
 */
'use strict';
process.env.CAPREBATE_ALLOW_SEED = process.env.CAPREBATE_ALLOW_SEED ?? '1';
const { spawn } = require('node:child_process');
const path = require('node:path');
const child = spawn(process.execPath, [path.join(__dirname, 'demo-server.ts')], {
  stdio: 'inherit', env: process.env,
});
child.on('exit', (c) => process.exit(c ?? 0));
