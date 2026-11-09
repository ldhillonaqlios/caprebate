/**
 * WHETHER THIS COPY IS THE DEPLOYED TEST WEBSITE. Vercel says so on its own servers: VERCEL=1, VERCEL_ENV production or
 * preview, and VERCEL_URL set. A reading of the environment and nothing else, so the bottom layer holds it: the outside
 * services' guard (src/integrations/connectors/place.ts) and the money readings (src/shared/money-readings.ts) both ask
 * it. Moved here from place.ts, text unchanged, so the shared parts import nothing above them.
 */

export type Env = Readonly<Record<string, string | undefined>>;

/** True on the deployed test website: Vercel sets these three on its own servers, for a live or a preview deploy. */
export function onTestWebsite(env: Env = process.env): boolean {
  return env['VERCEL'] === '1' && (env['VERCEL_ENV'] === 'production' || env['VERCEL_ENV'] === 'preview') && (env['VERCEL_URL'] ?? '').trim() !== '';
}
