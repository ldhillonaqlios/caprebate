/**
 * WHERE THE APP RUNS DECIDES WHETHER IT MAY REACH A REAL PERSON. 1–2 October 2026.
 *
 * 1 Oct: a copy on Lakhbir's Mac, reading the real key file, made a real Zoom meeting (src/connectors/zoom.ts).
 * 2 Oct, Lakhbir: WhatsApp and IONOS email get the same guard "for now" (src/connectors/whatsapp.ts,
 * src/stubs/email-provider.ts). So a service that reaches a real person is called only when the app is the deployed
 * test website (Vercel says so: VERCEL=1, VERCEL_ENV production or preview, and VERCEL_URL set), OR the copy was started
 * with that service's own setting = 1, for when Lakhbir really wants to try it on his own computer.
 *
 * Only a live connection is ever refused: a test's recorded answers, or its own mail server, reach nobody.
 */

export type Env = Readonly<Record<string, string | undefined>>;

/** True on the deployed test website: Vercel sets these three on its own servers, for a live or a preview deploy. */
export function onTestWebsite(env: Env = process.env): boolean {
  return env['VERCEL'] === '1' && (env['VERCEL_ENV'] === 'production' || env['VERCEL_ENV'] === 'preview') && (env['VERCEL_URL'] ?? '').trim() !== '';
}

/**
 * Why THIS copy may not use a service, in words, or null when it may. `live` is whether the connection would really
 * reach the service; `harm` says what a call from here would do.
 */
export function placeRefusal(p: { live: boolean; env?: Env; optIn: string; service: string; harm: string }): string | null {
  const env = p.env ?? process.env;
  if (!p.live) return null;
  if (onTestWebsite(env)) return null;
  if ((env[p.optIn] ?? '').trim() === '1') return null;
  return `This copy is not the test website, so it does not use ${p.service}. ${p.harm} To try ${p.service} here on purpose, start it with ${p.optIn}=1.`;
}
