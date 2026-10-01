/**
 * 1 OCTOBER 2026 — PORT 587 SPEAKS PLAIN FIRST (src/stubs/email-provider.ts, openSession).
 *
 * Lakhbir: "check why i cant sent and receive emails". Every email from the test website said "Not sent: The mail server
 * refused it: 0 the connection closed". The key file names IONOS's port 587, where the conversation starts in plain text
 * and turns secure with STARTTLS; the adapter opened every port as 465 (secure from the first byte), so IONOS hung up
 * before its greeting. A fake mail server on this machine only: nothing reaches IONOS here.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import { smtpProvider } from '../src/stubs/email-provider.ts';

/** A plain-text mail server that says what we tell it to, and records every line it is sent. */
async function fakeServer(answers: Record<string, string>): Promise<{ server: Server; port: number; heard: string[] }> {
  const heard: string[] = [];
  const server = createServer((sock) => {
    let buf = '';
    sock.write('220 fake.invented ESMTP ready\r\n');
    sock.on('data', (c: Buffer) => {
      buf += c.toString('latin1');
      let k: number;
      while ((k = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, k); buf = buf.slice(k + 2); heard.push(line);
        const verb = line.split(' ')[0]?.toUpperCase() ?? '';
        sock.write(`${answers[verb] ?? '500 not in this fake'}\r\n`);
        if (verb === 'QUIT') sock.end();
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const a = server.address();
  return { server, port: typeof a === 'object' && a !== null ? a.port : 0, heard };
}

describe('port 587: plain first, then secure, and never a password in plain text', () => {
  test('on a port other than 465 it says EHLO and asks for STARTTLS before anything private; a server that will not go secure is refused, and the login is never sent', async () => {
    const f = await fakeServer({ EHLO: '250-fake.invented\r\n250 STARTTLS', STARTTLS: '454 TLS not available just now', QUIT: '221 bye' });
    try {
      const login = { host: '127.0.0.1', port: f.port, user: 'contact@caprebate.co.uk', password: 'never-in-plain-text' };
      const checked = await smtpProvider(login).check();
      assert.deepEqual({ ...checked }, { ok: false, why: 'The mail server refused it at STARTTLS: 454 it would not make the connection secure: TLS not available just now' });
      const sent = await smtpProvider(login).deliver({ from_header: 'Cap Rebate <contact@caprebate.co.uk>', reply_to: 'contact@caprebate.co.uk', to: 'someone@invented.co.uk',
        subject: 's', body: 'x', attachments: [], date: new Date('2026-10-01T09:00:00Z') });
      assert.equal(sent.ok, false);
      assert.deepEqual(f.heard.filter((l) => !/^(EHLO|STARTTLS|QUIT)/.test(l)), [], 'something beyond EHLO and STARTTLS was said in plain text');
      assert.ok(!f.heard.join('\n').includes(Buffer.from('\0contact@caprebate.co.uk\0never-in-plain-text').toString('base64')), 'the password went in plain text');
      assert.deepEqual(f.heard.slice(0, 2), ['EHLO caprebate.co.uk', 'STARTTLS']);
    } finally { f.server.close(); }
  });

  test('a connection that drops says why, not only that it closed', async () => {
    // Port 465 is secure from the first byte: pointed at a plain server, the secure handshake fails — and the reason shows.
    const f = await fakeServer({});
    try {
      const r = await smtpProvider({ host: '127.0.0.1', port: f.port, user: 'contact@caprebate.co.uk', password: 'x' },
        (l) => tlsConnect({ host: l.host, port: l.port, rejectUnauthorized: false })).check();
      assert.equal(r.ok, false);
      assert.match(r.ok ? '' : r.why, /^The mail server refused it at greeting: 0 the connection closed \(.+\)$/);
    } finally { f.server.close(); }
  });
});
