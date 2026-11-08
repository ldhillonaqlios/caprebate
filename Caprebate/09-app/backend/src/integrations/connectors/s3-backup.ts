/**
 * THE BACKUP'S SECOND PLACE — a storage bucket at another provider, reached the way S3 is (AWS's Signature Version 4).
 * (the developer question pack, D8: "a nightly encrypted copy ... to a second provider in
 * the UK").
 *
 * OUR RECOMMENDATION is an Amazon S3 bucket in London (eu-west-2): in the UK, a different company from Vercel and Turso,
 * with its own lifecycle rule to delete each copy after a set time (LIVE-RUNBOOK.md). Any service that speaks S3 works the
 * same way, so the developer may choose another; the four BACKUP_S3_* settings say which. Switched off until they are
 * set: the backup then says it has nowhere to go, and keeps nothing.
 *
 * WHAT GOES. Only files the backup has already locked with our own key (src/core/backup.ts): the provider stores bytes it
 * cannot read. The user whose key this is may only add, read and delete files in that one bucket (the runbook's policy).
 *
 * THROUGH src/integrations/connectors/http.ts's transport, the one way this application reaches outside. The signing is ours (about
 * forty lines, checked against AWS's own published example in test/phase161h.test.ts) because AWS's SDK would add some
 * hundred packages for four calls.
 */
import { createHash, createHmac } from 'node:crypto';
import type { Transport } from './http.ts';
import type { OwnerSecrets } from '../../core/index.ts';

export type S3Login = { readonly bucket: string; readonly region: string; readonly accessKeyId: string; readonly secretAccessKey: string };

/** The four settings, or why there are none. Names only in the words. */
export function s3LoginFrom(secrets: OwnerSecrets): { login: S3Login | null; missing: string[] } {
  const names = ['BACKUP_S3_BUCKET', 'BACKUP_S3_REGION', 'BACKUP_S3_ACCESS_KEY_ID', 'BACKUP_S3_SECRET_ACCESS_KEY'] as const;
  const missing = names.filter((n) => (secrets.get(n) ?? '').trim() === '');
  if (missing.length > 0) return { login: null, missing };
  const v = (n: (typeof names)[number]): string => (secrets.get(n) ?? '').trim();
  const bucket = v('BACKUP_S3_BUCKET'); const region = v('BACKUP_S3_REGION');
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) return { login: null, missing: ['BACKUP_S3_BUCKET (not a bucket name)'] };
  if (!/^[a-z]{2}(-[a-z]+)+-\d$/.test(region)) return { login: null, missing: ['BACKUP_S3_REGION (not a region such as eu-west-2)'] };
  return { login: { bucket, region, accessKeyId: v('BACKUP_S3_ACCESS_KEY_ID'), secretAccessKey: v('BACKUP_S3_SECRET_ACCESS_KEY') }, missing: [] };
}

const sha256hex = (b: string | Uint8Array): string => createHash('sha256').update(b).digest('hex');
const hmac = (key: Buffer | string, data: string): Buffer => createHmac('sha256', key).update(data, 'utf8').digest();

/** S3's path encoding: every byte but A-Z a-z 0-9 - _ . ~ and the slashes between segments. */
export function s3EncodePath(path: string): string {
  return path.split('/').map((seg) => encodeURIComponent(seg).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');
}

/**
 * Signs one request (AWS Signature Version 4, service s3, no query string). Returns the Authorization header's value.
 * `headers` must already hold host, x-amz-date and x-amz-content-sha256; every header given is signed.
 */
export function signS3(o: {
  method: string; path: string; headers: Readonly<Record<string, string>>; payloadHash: string;
  region: string; accessKeyId: string; secretAccessKey: string; amzDate: string;
}): string {
  const names = Object.keys(o.headers).map((h) => h.toLowerCase()).sort();
  const value = (n: string): string => {
    const k = Object.keys(o.headers).find((h) => h.toLowerCase() === n) as string;
    return String(o.headers[k]).trim().replace(/\s+/g, ' ');
  };
  const canonical = [o.method, s3EncodePath(o.path), '', ...names.map((n) => `${n}:${value(n)}`), '', names.join(';'), o.payloadHash].join('\n');
  const day = o.amzDate.slice(0, 8);
  const scope = `${day}/${o.region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', o.amzDate, scope, sha256hex(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${o.secretAccessKey}`, day), o.region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign, 'utf8').digest('hex');
  return `AWS4-HMAC-SHA256 Credential=${o.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`;
}

/** The backup's destination, in our words: four calls. `now` gives the signing time. */
export type BackupTarget = {
  readonly where: string;
  put(name: string, bytes: Uint8Array): Promise<void>;
  get(name: string): Promise<Uint8Array | null>;
  exists(name: string): Promise<boolean>;
  remove(name: string): Promise<void>;
};

export function s3Target(login: S3Login, transport: Transport, now: () => string = () => new Date().toISOString()): BackupTarget {
  const host = `${login.bucket}.s3.${login.region}.amazonaws.com`;
  const call = async (method: string, name: string, body?: Uint8Array): Promise<Response> => {
    const path = `/${name}`;
    const amzDate = now().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const payloadHash = sha256hex(body ?? '');
    const headers: Record<string, string> = { host, 'x-amz-date': amzDate, 'x-amz-content-sha256': payloadHash };
    if (body !== undefined) headers['content-type'] = 'application/octet-stream';
    const authorization = signS3({ method, path, headers, payloadHash, region: login.region, accessKeyId: login.accessKeyId, secretAccessKey: login.secretAccessKey, amzDate });
    const send = { ...headers, authorization };
    delete (send as Record<string, string>).host; // the platform sets Host from the address, as signed
    return transport(`https://${host}${s3EncodePath(path)}`, { method, headers: send, ...(body === undefined ? {} : { body }), signal: AbortSignal.timeout(120_000) });
  };
  const fail = async (r: Response, what: string): Promise<never> => {
    await r.arrayBuffer().catch(() => undefined);
    throw new Error(`the backup bucket refused to ${what} (HTTP ${r.status})`);
  };
  return {
    where: `the bucket ${login.bucket} (${login.region})`,
    async put(name, bytes) { const r = await call('PUT', name, bytes); if (!r.ok) await fail(r, 'store a file'); await r.arrayBuffer(); },
    async get(name) {
      const r = await call('GET', name);
      if (r.status === 404) { await r.arrayBuffer(); return null; }
      if (!r.ok) await fail(r, 'give a file back');
      return new Uint8Array(await r.arrayBuffer());
    },
    async exists(name) {
      const r = await call('HEAD', name);
      await r.arrayBuffer().catch(() => undefined);
      if (r.status === 404) return false;
      if (!r.ok) await fail(r, 'say whether a file is there');
      return true;
    },
    async remove(name) { const r = await call('DELETE', name); if (!r.ok && r.status !== 404) await fail(r, 'delete a file'); await r.arrayBuffer().catch(() => undefined); },
  };
}
