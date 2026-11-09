// A private demo of Phase 156c on this Mac only: invented company, invented chat, in memory. Not committed.
import { mkdtempSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { startImport, saveImport } from '../src/web/whatsapp-import.ts';
const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-demo156-')), sealKey: randomBytes(32) });
const s = await seed(made.app.db, made.app.hasher, made.app.now);
const b = s.businesses[0]!;
const db = made.app.db; const T = made.app.now();
db.run('INSERT INTO contacts (id, business_id, full_name, phone, email, contact_consent, marketing_optin, whatsapp_optin, created_at) VALUES (?, ?, ?, ?, ?, 1, 0, 1, ?)', ['c-demo', b.id, 'Priya Shah', '07700 900123', null, T]);
const sales = db.get<{ id: string }>("SELECT id FROM users WHERE email = 'sales@example.invalid'")!;
const L = '‎';
const chat = [
  `[02/10/2026, 09:12:40] Priya Shah: Hi, it's Priya from ${b.name}. Is WhatsApp ok for quick questions about the claim?`,
  `[02/10/2026, 09:20:05] Sam Sales: Of course. Could you send a photo of the boiler's data plate in the plant room?`,
  `${L}[02/10/2026, 14:31:12] Priya Shah: ${L}<attached: 00000001-PHOTO-2026-10-02-14-31-12.jpg>`,
  `[02/10/2026, 14:31:40] Priya Shah: That's the main one. There are two smaller units upstairs\nand a hot water cylinder in the loft`,
  `[02/10/2026, 14:45:03] Sam Sales: Perfect, thank you. Do you have the fixed asset register?`,
  `${L}[03/10/2026, 10:02:55] Priya Shah: Fixed asset register 2025.pdf • ${L}3 pages ${L}<attached: 00000002-Fixed asset register 2025.pdf>`,
  `[03/10/2026, 10:03:20] Priya Shah: ${L}This message was deleted.`,
  `[03/10/2026, 10:04:01] Sam Sales: Got it. The surveyor can visit on Thursday at 10am ${L}<This message was edited>`,
  `[03/10/2026, 10:06:30] Priya Shah: Thursday works 👍`,
].join('\r\n') + '\r\n';
// A tiny invented JPEG (grey square) and PDF, so "Open the photo" works.
const jpg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAAQABABAREA/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAA/AJ//2Q==', 'base64');
const pdf = Buffer.from('%PDF-1.4\n% invented demo\n');
import { deflateRawSync, crc32 } from 'node:zlib';
function zipOf(files: Record<string, Buffer>): Buffer { const locals: Buffer[] = []; const centrals: Buffer[] = []; let off = 0;
  for (const [name, data] of Object.entries(files)) { const deflate = name.endsWith('.txt'); const body = deflate ? deflateRawSync(data) : data; const n = Buffer.from(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(deflate ? 8 : 0, 8); lh.writeUInt32LE(crc32(data), 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(deflate ? 8 : 0, 10); ch.writeUInt32LE(crc32(data), 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, n, body); centrals.push(ch, n); off += 30 + n.length + body.length; }
  const cd = Buffer.concat(centrals); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(centrals.length / 2, 8); end.writeUInt16LE(centrals.length / 2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]); }
const zip = zipOf({ '_chat.txt': Buffer.from(chat), '00000001-PHOTO-2026-10-02-14-31-12.jpg': jpg, '00000002-Fixed asset register 2025.pdf': pdf });
const actor = { id: sales.id, role: 'SALES', business_id: null } as never;
const r = await startImport(made.app, made.store, actor, b.id, { contact_id: 'c-demo', filename: 'WhatsApp Chat - Priya Shah.zip', whole: zip, chat: null, names: null });
if (!r.ok) throw new Error(r.why);
await saveImport(made.app, made.store, actor, b.id, r.id, { us: 'Sam Sales', from: '2026-10-02' });
await new Promise<void>((ok) => made.server.listen(8156, '127.0.0.1', () => ok()));
console.log(`DEMO http://127.0.0.1:8156  business ${b.id}`);
