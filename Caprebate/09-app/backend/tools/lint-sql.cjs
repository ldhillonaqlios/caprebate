#!/usr/bin/env node
/**
 * NO STRING-BUILT SQL ANYWHERE — checked, not promised.
 *
 * A rule nothing enforces is a comment. This greps every source file for SQL
 * text assembled from a template literal or a variable, which is the only way
 * an injection reaches a parameterised driver.
 *
 * It permits ONE pattern: adjacent string LITERALS joined with `+`, which is
 * how a long statement is wrapped across lines and carries no caller data. A
 * `${...}` inside a SQL string, or a `+ variable`, fails.
 */
'use strict';
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const DIRS = ['src', 'test'];
const findings = [];

function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.ts')) check(p);
  }
}

const SQL_WORD = /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|DROP\s+TABLE|ALTER\s+TABLE)\b/i;

function check(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
    if (!SQL_WORD.test(code)) return;

    // A template literal containing SQL is refused outright.
    if (/`[^`]*\b(SELECT|INSERT|UPDATE|DELETE)\b[^`]*\$\{/i.test(code)) {
      findings.push({ file, line: i + 1, why: 'SQL built from a template literal with an interpolation', text: code.trim() });
      return;
    }
    // `+ something` where something is not a quoted literal.
    if (/\+\s*(?!['"`])[A-Za-z_$][\w$.]*/.test(code) && /['"]/.test(code)) {
      findings.push({ file, line: i + 1, why: 'SQL concatenated with a variable', text: code.trim() });
    }
  });
}

for (const d of DIRS) {
  const p = path.join(ROOT, d);
  if (fs.existsSync(p)) walk(p);
}

if (findings.length) {
  console.error('STRING-BUILT SQL FOUND — every statement must be parameterised:\n');
  for (const f of findings) {
    console.error(`  ${path.relative(ROOT, f.file)}:${f.line}  ${f.why}\n    ${f.text.slice(0, 120)}`);
  }
  process.exit(1);
}
console.log('lint:sql — no string-built SQL found.');
