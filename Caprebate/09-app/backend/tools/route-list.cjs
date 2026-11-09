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
 * THE ROUTER'S SHELL IS FOLLOWED. src/app/router.ts asks each module's routes file (src/modules/<module>/routes.ts)
 * at the point where that module's addresses have always been matched. So the shell is read line by line as before,
 * and a line that calls a function of a routes file is replaced by that function's routes, in the place the call is
 * made: the list reads in the order the addresses are matched, wherever the code lives. A routes function that is
 * called by another routes function (the portal's pages, asked from the portal's entry) is a second level: its routes
 * follow the shell's, as they did when they sat after the shell's own function in router.ts. A routes function nobody
 * calls keeps its routes, as a group of its own, so nothing can drop out of the list unseen.
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

const SHELL = 'src/app/router.ts';
const ROUTES_FILE = /^src\/modules\/[^/]+\/routes\.ts$/;

/** The top-level functions of a routes file, each with its own lines (from its first line to its closing brace). */
function functionsOf(text) {
  const out = new Map();
  let name = null; let lines = [];
  for (const line of text.split('\n')) {
    const start = /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/.exec(line);
    if (name === null && start) { name = start[1]; lines = [line]; continue; }
    if (name !== null) {
      lines.push(line);
      if (line === '}') { out.set(name, lines.join('\n')); name = null; }
    }
  }
  return out;
}

/** The shell's routes, with each routes function's routes put in where it is called; second-level calls follow. */
function shellRoutes(shellText, fns, used) {
  const callsIn = (line) => [...fns.keys()].filter((n) => !used.has(n) && new RegExp(`\\b${n.replace(/\$/g, '\\$')}\\(`).test(line) && !new RegExp(`function\\s+${n}\\b`).test(line));
  const later = [];
  const expand = (text, inShell) => {
    const out = [];
    for (const line of text.split('\n')) {
      out.push(...routesOf(line));
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
      for (const n of callsIn(line)) {
        if (routesOf(fns.get(n)).length === 0) continue;
        used.add(n);
        if (inShell) out.push(...expand(fns.get(n), false)); else later.push(n);
      }
    }
    return out;
  };
  const out = expand(shellText, true);
  while (later.length) out.push(...expand(fns.get(later.shift()), false));
  return out;
}

function routeList(backend) {
  const files = execFileSync('git', ['ls-files', 'src'], { cwd: backend, encoding: 'utf8' }).split('\n').filter((f) => /\.(ts|cjs|mjs)$/.test(f));
  const read = (f) => fs.readFileSync(path.join(backend, f), 'utf8');
  const fns = new Map();
  const fileOf = new Map();
  for (const f of files.filter((x) => ROUTES_FILE.test(x))) {
    for (const [n, text] of functionsOf(read(f))) {
      if (fns.has(n)) throw new Error(`route-list: two routes files name a function ${n}; give one another name`);
      fns.set(n, text); fileOf.set(n, f);
    }
  }
  const used = new Set();
  const groups = [];
  for (const f of files.filter((x) => !ROUTES_FILE.test(x))) {
    const r = f === SHELL ? shellRoutes(read(f), fns, used) : routesOf(read(f));
    if (r.length) groups.push(r);
  }
  for (const f of [...new Set(fileOf.values())]) {
    const r = [...fns.keys()].filter((n) => fileOf.get(n) === f && !used.has(n)).flatMap((n) => routesOf(fns.get(n)));
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
