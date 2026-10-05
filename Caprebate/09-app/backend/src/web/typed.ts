/**
 * PHASE 154a1 (line 9), 4 October 2026 — INVISIBLE CHARACTERS ARE TAKEN OUT OF WHAT PEOPLE TYPE, ON THE WAY IN.
 *
 * The 3 October sweep typed a null and a right-to-left override into a claim note and a portal message, and both were
 * stored and shown back as typed. A direction override can make "gnp.exe" read as "exe.png" and a null can cut a value
 * short in another program, so neither belongs in anything a person typed. Taken out:
 *   - control characters, except the tab and the two line endings, which keep a note's lines as typed;
 *   - the direction marks, embeddings, overrides and isolates (U+061C, U+200E, U+200F, U+202A-U+202E, U+2066-U+2069).
 * Everything else - accents, dashes, any language's letters, emoji - is kept. Read by every form the web half reads
 * (src/web/router.ts form(), src/web/multipart.ts, src/web/messages-pages.ts); a password is never changed (KEEP_AS_SENT).
 */
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F؜‎‏‪-‮⁦-⁩]/g;

/** A field whose value must reach its check exactly as sent: a password, compared or hashed byte for byte. */
export const KEEP_AS_SENT = /password/i;

export function cleanTyped(v: string): string {
  return v.replace(INVISIBLE, '');
}

/** The fields of a URL-encoded form, each cleaned unless it is kept as sent. */
export function cleanForm(f: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  for (const [k, v] of f) out.append(k, KEEP_AS_SENT.test(k) ? v : cleanTyped(v));
  return out;
}

/** A multipart form's text field, cleaned unless it is kept as sent. */
export function cleanField(name: string, v: string): string {
  return KEEP_AS_SENT.test(name) ? v : cleanTyped(v);
}
