/* PHASE 161e, 5 November 2026: files the tests read that git does not hold.
 *
 * A few tests read documents that live only in the OneDrive copy of the project (the standard
 * operating procedures, the privacy notice draft, the Disposal Note, the rulebooks, the brand
 * logo). They are kept out of git on purpose: the repository is public while the developer
 * reviews the code (Lakhbir, 5 Nov 2026), and these are business documents, not code.
 *
 * So on a fresh copy (a clone, or GitHub's own check) those tests SKIP and say why, by name,
 * in the test output: never a silent skip. On the Mac's OneDrive copy every file is there and
 * every test runs. test/core/fresh-copy-checks.test.ts proves both halves: in the OneDrive copy every file
 * below is on disk (so nothing skips there), and none of them is in git.
 *
 * To add one: put its path here, then pass `{ skip: oneDriveOnly('<key>') }` to the test that
 * reads it. Read the file inside the test, never at the top of the file or in a describe(),
 * or a fresh copy fails before the skip can be seen.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The project folder, Caprebate/. */
export const PROJECT = fileURLToPath(new URL('../../../', import.meta.url));

/** Every file a test reads that only the OneDrive copy holds, by a short key. Paths are from Caprebate/. */
export const ONEDRIVE_ONLY = Object.freeze({
  sop: { path: '08-monday-doc-exports/12552682457__Item-2-Standard-Operating-Procedures-enquiry-to-defence-pack.md', what: 'the standard operating procedures' },
  privacyNotice: { path: '08-monday-doc-exports/12818279787__Section-1-Who-we-are-and-how-to-contact-us.md', what: 'the privacy notice draft' },
  disposalNote: { path: '08-monday-doc-exports/12830181411__Disposal-note-the-election-the-client-signs-on-a-future-sale.md', what: 'the Disposal Note' },
  rulebooks: { path: '01-rulebooks/README.md', what: 'the rulebooks and their list' },
  logo: { path: '04-phase-work/phase133c/brand-assets/caprebate_logo_monoink_924.png', what: 'the logo file the brand book supplied' },
} as const);

export type OneDriveKey = keyof typeof ONEDRIVE_ONLY;

/** The file's full path. */
export function oneDrivePath(key: OneDriveKey, project: string = PROJECT): string {
  return join(project, ONEDRIVE_ONLY[key].path);
}

/** false when the file is here (the test runs); otherwise the reason the test skips, for node:test's `skip`. */
export function oneDriveOnly(key: OneDriveKey, project: string = PROJECT): false | string {
  const f = ONEDRIVE_ONLY[key];
  if (existsSync(oneDrivePath(key, project))) return false;
  return `skipped on a fresh copy: it reads ${f.what} (Caprebate/${f.path}), which is kept in OneDrive only, not in git; it runs on the Mac's OneDrive copy`;
}

/** True in the Mac's OneDrive copy: it holds _archive/, which git never has. */
export function inOneDriveCopy(project: string = PROJECT): boolean {
  return existsSync(join(project, '_archive'));
}

/** The privacy notice the notices page's acceptance check should read: the real one where it is on disk, otherwise the
 *  stand-in in test/fixtures/phase161e/ (it names only what the check reads, all of it already on the public page). */
export function privacyNoticeForCheck(): { path: string; note: string } {
  if (oneDriveOnly('privacyNotice') === false) return { path: oneDrivePath('privacyNotice'), note: 'the acceptance check read the real privacy notice' };
  return {
    path: fileURLToPath(new URL('./fixtures/phase161e/privacy-notice-stand-in.md', import.meta.url)),
    note: `the acceptance check read the stand-in privacy notice (test/fixtures/phase161e/): ${ONEDRIVE_ONLY.privacyNotice.what} (Caprebate/${ONEDRIVE_ONLY.privacyNotice.path}) is kept in OneDrive only, not in git`,
  };
}
