#!/usr/bin/env node
/**
 * Split a source file into fenced-markdown chunks small enough for a Monday
 * doc append (~9KB hard fail; we target 7000 bytes of payload).
 *
 * Usage: node chunk.cjs <file.ts> <label> <outdir>
 * Splits at the `/* ---` section banners where possible, falling back to a
 * blank line, never mid-line. Emits outdir/<label>-NN.md.
 */
const fs = require('fs');
const path = require('path');

const [, , file, label, outdir] = process.argv;
const LIMIT = 6800;
const src = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const lines = src.split('\n');

// Candidate break points: section banners first, then blank lines.
const isBanner = (l) => l.startsWith('/* ---') || l.startsWith('/**');
const pieces = [];
let cur = [];
let curBytes = 0;
let lastBlank = -1;
let lastBanner = -1;

const flushAt = (idx) => {
  const head = cur.slice(0, idx);
  const tail = cur.slice(idx);
  pieces.push(head.join('\n'));
  cur = tail;
  curBytes = Buffer.byteLength(cur.join('\n'), 'utf8');
  lastBlank = -1;
  lastBanner = -1;
};

for (const line of lines) {
  const b = Buffer.byteLength(line, 'utf8') + 1;
  if (curBytes + b > LIMIT && cur.length) {
    const at = lastBanner > 0 ? lastBanner : lastBlank > 0 ? lastBlank : cur.length;
    flushAt(at);
  }
  cur.push(line);
  curBytes += b;
  if (line.trim() === '') lastBlank = cur.length;
  if (isBanner(line)) lastBanner = cur.length - 1;
}
if (cur.length) pieces.push(cur.join('\n'));

fs.mkdirSync(outdir, { recursive: true });
const base = path.basename(file);
pieces.forEach((p, i) => {
  const n = String(i + 1).padStart(2, '0');
  const header = `**\`${base}\` — part ${i + 1} of ${pieces.length}**\n\n`;
  const body = header + '```ts\n' + p.replace(/\n+$/, '') + '\n```\n';
  fs.writeFileSync(path.join(outdir, `${label}-${n}.md`), body, 'utf8');
  console.log(`${label}-${n}.md  ${Buffer.byteLength(body, 'utf8')} bytes`);
});
