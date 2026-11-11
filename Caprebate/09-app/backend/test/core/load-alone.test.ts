/**
 * EVERY FILE LOADS ON ITS OWN. A front door (each area's index.ts) loads every file it names, so an import through one
 * can close a loop that leaves a value unset while files load ("Cannot access X before initialization"). Which file
 * loads first decides whether the loop bites, so this loads each file under src/ first, in a process of its own, and
 * expects it to load. The core's, the shared parts' and the outside services' doors load no business module at all;
 * a lower layer that needs a module's statements names its data file.
 *
 * NO FILE IS EXCUSED (Phase 162). Phase 161j listed four connectors as known exceptions: homedata.ts, hmlr-title.ts,
 * homedata-planning.ts and title-boundary.ts, loaded first, went registers.ts -> http.ts -> the core's door ->
 * src/core/backup.ts -> the outside services' door -> paid-registers.ts, whose PAID_CONNECTORS then named a connector
 * still loading. Phase 161l1 moved the backup into the outside services (src/integrations/backup.ts), so the core's
 * door no longer loads the outside services and that loop is gone; boundaries rule 2 (the core may not import an
 * area above it) keeps it gone. All four load alone, so no file is excused and this test proves it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';

const BACKEND = join(import.meta.dirname, '..', '..');

function loadAlone(file: string): Promise<string | null> {
  return new Promise((done) => {
    const p = spawn(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify('./' + file)})`], { cwd: BACKEND, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (b: Buffer) => { err += b.toString(); });
    // A file that runs as a command (src/app/cli.ts) may stop with its own usage message; only an error while loading counts.
    p.on('close', () => done(err.match(/(ReferenceError|TypeError|SyntaxError|ERR_MODULE_NOT_FOUND)[^\n]*/)?.[0] ?? null));
  });
}

test('161j: every file under src/ loads when it is the first one loaded (no loop through a front door leaves a value unset)', async () => {
  const files = execFileSync('git', ['ls-files', 'src'], { cwd: BACKEND, encoding: 'utf8' }).split('\n').filter((f) => /\.ts$/.test(f) && !/\.d\.ts$/.test(f));
  assert.ok(files.length > 300, 'the list of files is read');
  const failed: string[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < files.length) {
      const f = files[next++]!;
      const why = await loadAlone(f);
      if (why !== null) failed.push(`${f}: ${why}`);
    }
  };
  await Promise.all(Array.from({ length: Math.max(2, availableParallelism() - 1) }, worker));
  assert.deepEqual(failed.sort(), []);
});
