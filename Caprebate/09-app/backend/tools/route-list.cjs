#!/usr/bin/env node
/**
 * THE ROUTE LIST — every address the code answers, read from the source. Phase 161i, 7 November 2026 (the regroup
 * phases' rule: "a test lists every route (method and path, in matching order) before the first move; after each move
 * the list must be identical").
 *
 * It reads each line of every file under src/ that git tracks and records each route condition it finds: an address
 * compared with `===` or `startsWith(...)`, or a regular expression tested against the path, with the method named on
 * the same line (`*` when none is). A file that moves does not change its routes, and the list does not name files, so a
 * pure move leaves it identical; a route added, removed or changed shows as a difference. Within each file the routes
 * are kept in the order they are matched; the files are taken in a fixed order of their routes' own text, so a rename
 * does not reorder them.
 *
 *   node tools/route-list.cjs            print the list
 *   node tools/route-list.cjs --write    write test/fixtures/route-list.txt (the snapshot the test compares with)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ADDRESS = /(?:\bpath|\bp|\bpathname|url\.pathname)\s*===\s*(['"`])(\/[^'"`]*)\1|(?:\bpath|\bp|\bpathname|url\.pathname)\.startsWith\(\s*(['"`])(\/[^'"`]*)\3\s*\)|(\/\^\\\/[^\n]*?\$\/)\.(?:test|exec)\(\s*(?:path|p|pathname)\s*\)/g;
const METHOD = /\b(?:method|req\.method)\s*===\s*['"](GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)['"]/g;

function routesOf(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
    const methods = [...line.matchAll(METHOD)].map((m) => m[1]);
    for (const m of line.matchAll(ADDRESS)) {
      const addr = m[2] !== undefined ? `= ${m[2]}` : m[4] !== undefined ? `^ ${m[4]}` : `~ ${m[5]}`;
      out.push(`${methods.length ? [...new Set(methods)].sort().join('|') : '*'} ${addr}`);
    }
  }
  return out;
}

function routeList(backend) {
  const files = execFileSync('git', ['ls-files', 'src'], { cwd: backend, encoding: 'utf8' }).split('\n').filter((f) => /\.(ts|cjs|mjs)$/.test(f));
  const groups = [];
  for (const f of files) {
    const r = routesOf(fs.readFileSync(path.join(backend, f), 'utf8'));
    if (r.length) groups.push(r);
  }
  groups.sort((a, b) => (a.join('\n') < b.join('\n') ? -1 : a.join('\n') > b.join('\n') ? 1 : 0));
  return groups.map((g) => g.join('\n')).join('\n--\n') + '\n';
}

module.exports = { routeList, routesOf };

if (require.main === module) {
  const backend = path.join(__dirname, '..');
  const list = routeList(backend);
  if (process.argv.includes('--write')) {
    fs.mkdirSync(path.join(backend, 'test', 'fixtures'), { recursive: true });
    fs.writeFileSync(path.join(backend, 'test', 'fixtures', 'route-list.txt'), list);
    console.log(`route-list — ${list.split('\n').filter((l) => l && l !== '--').length} route conditions written to test/fixtures/route-list.txt`);
  } else process.stdout.write(list);
}
