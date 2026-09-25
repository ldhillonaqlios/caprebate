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
const fs = require('node:fs');
const os = require('node:os');

/* PHASE 151c: ORDNANCE SURVEY'S OSTN15 GRID, WHERE THE RESEARCH RUN STARTS. The site area's point may be a latitude and
   longitude, which is converted only by OS's exact method, and that needs the grid file (src/connectors/ostn15.ts).
   On the Mac it is ~/caprebate-data/ostn15/, outside the repository, checked against OS's forty test points on
   24 September 2026. Named here when it is there and nothing else is named; absent, nothing changes and a latitude and
   longitude is refused. The live server names its own copy in CAPREBATE_OSTN15_FILE (the Developer Spec says where). */
if (process.env.CAPREBATE_OSTN15_FILE === undefined) {
  const grid = path.join(os.homedir(), 'caprebate-data', 'ostn15', 'OSTN15_OSGM15_DataFile.txt');
  if (fs.existsSync(grid)) process.env.CAPREBATE_OSTN15_FILE = grid;
}
const child = spawn(process.execPath, [path.join(__dirname, 'demo-server.ts')], {
  stdio: 'inherit', env: process.env,
});
child.on('exit', (c) => process.exit(c ?? 0));
