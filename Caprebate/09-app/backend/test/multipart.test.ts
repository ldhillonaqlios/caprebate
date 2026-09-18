/**
 * THE MULTIPART READER — new attack surface, so it is tested as one.
 *
 * It exists because a browser form carrying a file has exactly one encoding and
 * the pages here work without JavaScript. Multipart parsers have a long history
 * of holes and every one of them comes from being generous, so the tests below
 * are mostly about REFUSING: a body with no closing boundary, a part with no
 * name, a header that never ends, two files where one was asked for.
 *
 * IT IS NOT THE CONTROL AND THESE TESTS DO NOT PRETEND IT IS. Whatever comes
 * out of it is sniffed, capped and re-encoded before anything is stored — see
 * images.test.ts. What this file establishes is that the reader cannot be made
 * to hand back something other than the bytes between two boundaries.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { boundaryOf, parseMultipart, singleFile, MultipartError } from '../src/web/multipart.ts';

const B = '----cbBoundary';

function build(parts: readonly { headers: string; body: Buffer | string }[], closing = true): Uint8Array {
  const chunks: Buffer[] = [];
  for (const p of parts) {
    chunks.push(Buffer.from(`--${B}\r\n${p.headers}\r\n\r\n`, 'latin1'));
    chunks.push(typeof p.body === 'string' ? Buffer.from(p.body, 'latin1') : p.body);
    chunks.push(Buffer.from('\r\n', 'latin1'));
  }
  chunks.push(Buffer.from(closing ? `--${B}--\r\n` : '', 'latin1'));
  return new Uint8Array(Buffer.concat(chunks));
}

describe('the boundary', () => {
  test('is read from the content type, quoted or not', () => {
    assert.equal(boundaryOf(`multipart/form-data; boundary=${B}`), B);
    assert.equal(boundaryOf(`multipart/form-data; boundary="${B}"`), B);
    assert.equal(boundaryOf('multipart/form-data;boundary=abc;charset=utf-8'), 'abc');
  });

  test('anything that is not a multipart form returns null', () => {
    assert.equal(boundaryOf(undefined), null);
    assert.equal(boundaryOf('application/json'), null);
    assert.equal(boundaryOf('multipart/form-data'), null, 'no boundary at all');
    assert.equal(boundaryOf('application/x-www-form-urlencoded; boundary=abc'), null);
    assert.equal(boundaryOf(`multipart/form-data; boundary=${'x'.repeat(300)}`), null);
  });
});

describe('parsing', () => {
  test('binary survives byte for byte — it is not round-tripped through a string', () => {
    // Every byte value, including the ones UTF-8 would replace.
    const bytes = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
    const parts = parseMultipart(
      build([{ headers: 'Content-Disposition: form-data; name="f"; filename="all.bin"', body: bytes }]), B);
    assert.equal(parts.length, 1);
    assert.deepEqual(Buffer.from(parts[0]?.bytes ?? new Uint8Array()), bytes);
  });

  test('fields and files are told apart by the filename', () => {
    const parts = parseMultipart(build([
      { headers: 'Content-Disposition: form-data; name="note"', body: 'hello' },
      { headers: 'Content-Disposition: form-data; name="photo"; filename="me.png"\r\nContent-Type: image/png', body: 'PNGDATA' },
    ]), B);
    assert.equal(parts.length, 2);
    assert.equal(parts[0]?.filename, undefined);
    assert.equal(parts[1]?.filename, 'me.png');
    assert.equal(parts[1]?.content_type, 'image/png');
  });

  test('a bare LF instead of CRLF is accepted — some clients send it', () => {
    const body = new Uint8Array(Buffer.from(
      `--${B}\nContent-Disposition: form-data; name="f"; filename="a"\n\nDATA\n--${B}--\n`, 'latin1'));
    const parts = parseMultipart(body, B);
    assert.equal(Buffer.from(parts[0]?.bytes ?? new Uint8Array()).toString(), 'DATA');
  });
});

describe('it refuses rather than guesses', () => {
  const bad: readonly [string, Uint8Array][] = [
    ['no closing boundary', build([{ headers: 'Content-Disposition: form-data; name="f"; filename="a"', body: 'X' }], false)],
    ['does not start with its own boundary', new Uint8Array(Buffer.from(`junk\r\n--${B}--\r\n`, 'latin1'))],
    ['a part with no name', build([{ headers: 'Content-Disposition: form-data; filename="a"', body: 'X' }])],
    ['headers that never end', new Uint8Array(Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="f"`, 'latin1'))],
    ['empty body', new Uint8Array(0)],
  ];
  for (const [why, body] of bad) {
    test(`${why} is refused`, () => {
      assert.throws(() => parseMultipart(body, B), (e: unknown) => e instanceof MultipartError, why);
    });
  }

  test('an unreasonable number of parts is refused', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      headers: `Content-Disposition: form-data; name="f${i}"`, body: 'x',
    }));
    assert.throws(() => parseMultipart(build(many), B), (e: unknown) => e instanceof MultipartError);
  });

  test('an unreasonable header is refused before it is parsed', () => {
    const huge = `Content-Disposition: form-data; name="f"; x="${'a'.repeat(9000)}"`;
    assert.throws(() => parseMultipart(build([{ headers: huge, body: 'x' }]), B),
      (e: unknown) => e instanceof MultipartError);
  });
});

describe('singleFile — one file, and it says so', () => {
  test('returns the file and the other fields', () => {
    const r = singleFile(build([
      { headers: 'Content-Disposition: form-data; name="caption"', body: 'my face' },
      { headers: 'Content-Disposition: form-data; name="photo"; filename="me.png"', body: 'PNGDATA' },
    ]), `multipart/form-data; boundary=${B}`);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(Buffer.from(r.part.bytes).toString(), 'PNGDATA');
      assert.equal(r.fields.caption, 'my face');
    }
  });

  test('TWO FILES IS A REFUSAL, not a silent choice between them', () => {
    const r = singleFile(build([
      { headers: 'Content-Disposition: form-data; name="a"; filename="1.png"', body: 'ONE' },
      { headers: 'Content-Disposition: form-data; name="b"; filename="2.png"', body: 'TWO' },
    ]), `multipart/form-data; boundary=${B}`);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.why, /one file, not several/);
  });

  test('no file at all is a refusal with a sentence', () => {
    const r = singleFile(build([{ headers: 'Content-Disposition: form-data; name="only"', body: 'text' }]),
      `multipart/form-data; boundary=${B}`);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.why, /no file was attached/);
  });

  test('a malformed body becomes a sentence rather than an exception at the route', () => {
    const r = singleFile(new Uint8Array(Buffer.from('nonsense')), `multipart/form-data; boundary=${B}`);
    assert.equal(r.ok, false);
  });

  test('a filename is a LABEL and is never used as a path', () => {
    const r = singleFile(build([
      { headers: 'Content-Disposition: form-data; name="photo"; filename="../../../etc/passwd"', body: 'X' },
    ]), `multipart/form-data; boundary=${B}`);
    assert.equal(r.ok, true);
    // The reader hands it back verbatim, and the avatar path never touches it:
    // `photoKeyFor` derives the object key from a HASH OF THE USER ID and reads
    // nothing the client sent. The traversal has nowhere to go.
    if (r.ok) assert.equal(r.part.filename, '../../../etc/passwd');
  });
});
