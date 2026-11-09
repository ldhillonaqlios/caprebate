/**
 * PLAIN FORM CHECKS: a word from a list, a text field with a length limit, a needed text, a date. No business rule and
 * nothing read from the database, so every module may use them (they were in the compliance module, which other
 * modules sit below; 09-app/docs/ARCHITECTURE.md rule 2).
 */
export type Fields = Readonly<Record<string, string | null>>;
export type Vocab = Readonly<Record<string, string>>;
export type Check<T> = { ok: true; value: T } | { ok: false; why: string };

export function has(vocab: Vocab, v: string | null | undefined): v is string {
  return typeof v === 'string' && Object.hasOwn(vocab, v);
}

export function words(vocab: Vocab, v: string | null | undefined, none: string): string {
  return has(vocab, v) ? (vocab[v] ?? v) : none;
}

export function textField(v: string | null | undefined, max: number, what: string): Check<string | null> {
  if (v === null || v === undefined) return { ok: true, value: null };
  const t = v.trim();
  if (t === '') return { ok: true, value: null };
  if (t.length > max) return { ok: false, why: `${what} is longer than we store — ${max.toLocaleString('en-GB')} characters is the limit.` };
  return { ok: true, value: t };
}

export function requiredText(v: string | null | undefined, max: number, what: string): Check<string> {
  const t = textField(v, max, what);
  if (!t.ok) return t;
  if (t.value === null) return { ok: false, why: `${what} is needed.` };
  return { ok: true, value: t.value };
}

export function dateField(v: string | null | undefined, what: string): Check<string | null> {
  if (v === null || v === undefined || v.trim() === '') return { ok: true, value: null };
  const t = v.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || !Number.isFinite(Date.parse(`${t}T12:00:00.000Z`))
    || new Date(`${t}T12:00:00.000Z`).toISOString().slice(0, 10) !== t) {
    return { ok: false, why: `${what} must be a date, like 2026-03-31.` };
  }
  return { ok: true, value: t };
}
