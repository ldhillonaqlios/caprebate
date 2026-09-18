# Calibration registers — EMPTY BY DESIGN

Two files, both headers-only:

- `prefill-register.csv` — one row per pre-filled field per job. Populated by
  `OverrideStore.record()` (phase3/caprebate-surveyor-crm.ts).
- `blank-control-register.csv` — one row per blank-field control observation.
  Populated by `ControlStore.record()`. One job in ten per field, chosen by
  `isBlankControl(job_id, field_id)`.

**Do not hand-populate either file.** A row written by hand has no anchor
verdict behind it, and an anchored observation is not evidence. See
`../calibration-instrument-v1.md`.

**Do not delete them because they are empty.** Empty is the current state of the
evidence, and an absent file reads as "not built" rather than "nothing yet".
