/** See demo-server.cjs. In-memory, seeded, for looking at the screens. */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';

if (process.env.CAPREBATE_ALLOW_SEED !== '1') {
  console.error('refusing to run: this launcher seeds invented data with a known password');
  process.exit(1);
}
const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-demo-')) });
const r = await seed(made.app.db, made.app.hasher, made.app.now);
const port = Number(process.env.PORT ?? 8105);
made.server.listen(port, () => {
  console.log(`caprebate demo on http://localhost:${port}`);
  for (const u of r.users) console.log(`  ${u.role.padEnd(11)} ${u.email}`);
  console.log(`  password: ${r.password}`);
});
