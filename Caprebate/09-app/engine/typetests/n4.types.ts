/* =============================================================================
   TYPE TESTS — non-negotiable N4, asserted in the type system
                                                             Phase 102, Block A

   WHY THIS FILE EXISTS, AND IT IS NOT BELT AND BRACES
     `npm run typecheck` passing does NOT prove N4 survives. This was tested
     rather than assumed: AiaHeadroom was narrowed to `number` on purpose, and
     `tsc --noEmit` over the whole package stayed GREEN — nothing in the
     package's own TypeScript consumes the union in a way that would break. A
     future phase could collapse the union, delete "unsure", or give a
     relieving fact a default, and the build would not say a word.

     So the assertions live here, where a narrowing is a compile error. These
     tests were proved able to fail before they were kept.

   RUN
     npm run typecheck:types      (tsc over this folder; there is no runtime)

   NOTHING HERE EMITS. These are type-level assertions only.
   ============================================================================= */

import type { AiaHeadroom, Session, EngineResult, CashGates, MaybeRange } from "../src/types.js";
import type { RegistrySource, RegistryModule, EngagementRecord, FieldClassification } from "../src/generated/shared.js";

/* the standard invariant-position equality trick: T and U must be the SAME
   type, not merely assignable to one another in one direction */
type Equals<A, B> =
  (<G>() => G extends A ? 1 : 2) extends (<G>() => G extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
type Extends<A, B> = A extends B ? true : false;

/* ---- 1. aia_headroom has exactly four states, and they are not the same ----
   "none" | "unsure" | number | absent. Gate 2 of the cash gates tells all four
   apart. Narrowing this to `number | undefined` deletes the first and third and
   silently turns "we do not know" into a favourable answer. */

type _aia_union_is_exact = Assert<Equals<AiaHeadroom, "none" | "unsure" | number>>;

type _aia_keeps_none    = Assert<Extends<"none", AiaHeadroom>>;
type _aia_keeps_unsure  = Assert<Extends<"unsure", AiaHeadroom>>;
type _aia_keeps_number  = Assert<Extends<number, AiaHeadroom>>;

/* the fourth state is ABSENCE, so the property must stay optional */
type _aia_absent_allowed = Assert<Extends<undefined, Session["aia_headroom"]>>;

/* and the collapse the phase prompt names must NOT be the whole type */
type _aia_not_just_number = Assert<Equals<Equals<AiaHeadroom, number>, false>>;
type _aia_not_number_or_undefined =
  Assert<Equals<Equals<Session["aia_headroom"], number | undefined>, false>>;

/* ---- 2. no relieving fact may lose its "unsure" ---------------------------
   Each of these is read by a gate that would RELIEVE the client. "Not sure" and
   ABSENT must both be representable and must both stay distinct from "yes". */

type _profit_unsure = Assert<Extends<"unsure", Session["sufficient_profit"]>>;
type _profit_absent = Assert<Extends<undefined, Session["sufficient_profit"]>>;
type _aia_used_unsure = Assert<Extends<"unsure", Session["aia_used_elsewhere"]>>;
type _return_filed_unsure = Assert<Extends<"unsure", Session["return_filed"]>>;

/* is_scotland is NOT ESTABLISHED when absent — it is not "false" */
type _scotland_absent = Assert<Extends<undefined, Session["is_scotland"]>>;

/* ---- 3. an unestablished figure is null, never zero -----------------------
   The engine returns [null, null] for cash it cannot establish. A type that
   made these plain numbers would invite a `?? 0` at the call site, which is
   exactly the substitution N4 forbids. */

type _cash_may_be_null = Assert<Equals<EngineResult["cash"], MaybeRange>>;
type _cash_null_allowed = Assert<Extends<readonly [null, null], EngineResult["cash"]>>;

/* a cash gate has THREE states: open, shut, and not established */
type _gate_null_allowed = Assert<Extends<null, CashGates["profits"]>>;
type _gate_not_just_boolean = Assert<Equals<Equals<CashGates["profits"], boolean>, false>>;

/* ---- 4. the pool split can be undetermined -------------------------------- */
type _pool_main_may_be_null = Assert<Extends<readonly [null, null], EngineResult["pool"]["main"]>>;

/* ---- 5. the grant flag is always there, and it is only a boolean ---------
   Phase 113i declared `grant`. It is REQUIRED because every sector returns it
   on every path, so a caller never has to guess whether absent means "no
   grant". And it stays a plain boolean: it records whether a deduction was
   MADE, not whether a grant exists, which is why a third state would be wrong
   here where it is right for a cash gate. Making it optional, or widening it,
   is a compile error. */
type _grant_is_boolean  = Assert<Equals<EngineResult["grant"], boolean>>;
type _grant_is_required = Assert<Equals<Extends<undefined, EngineResult["grant"]>, false>>;

/* ---- 6. the post-signature gate is typed, and "not sure" = absent --------
   Phase 132f, 16 September 2026. Phase 132c added SOURCES[].postSignature and
   classifyField's third argument (CA2) in the site; the hand-written
   shared.d.ts did not declare either, so classifyField was `unknown` and these
   lines did not compile. Proved red against shared.d.ts.bak-phase132f.
   N4: the engagement may be omitted, undefined or null, and `signed` may be
   anything a caller holds ("not sure" included) — all read as unsigned, none
   throws, so none is a type error. */
type _src_has_post_signature = Assert<Equals<RegistrySource["postSignature"], readonly string[]>>;
type _classify_params = Parameters<RegistryModule["classifyField"]>;
type _classify_engagement_optional = Assert<Extends<[string, string], _classify_params>>;
type _classify_engagement_absent = Assert<Extends<[string, string, undefined], _classify_params>>;
type _classify_engagement_null = Assert<Extends<[string, string, null], _classify_params>>;
type _classify_engagement_not_sure = Assert<Extends<[string, string, { signed: "not sure" }], _classify_params>>;
type _classify_engagement_signed = Assert<Extends<[string, string, { signed: true }], _classify_params>>;
type _classify_engagement_record = Assert<Extends<EngagementRecord | null | undefined, _classify_params[2]>>;
type _classify_returns = Assert<Equals<ReturnType<RegistryModule["classifyField"]>, FieldClassification>>;
type _classify_waits_not_refuses = Assert<Extends<
  { readonly ok: false; readonly code: "NOT_PERMITTED_YET"; readonly postSignature: true; readonly why: string },
  FieldClassification>>;

/* keep the checker honest about unused locals without exporting anything real */
export type __N4_TYPE_TESTS__ = [
  _aia_union_is_exact, _aia_keeps_none, _aia_keeps_unsure, _aia_keeps_number,
  _aia_absent_allowed, _aia_not_just_number, _aia_not_number_or_undefined,
  _profit_unsure, _profit_absent, _aia_used_unsure, _return_filed_unsure,
  _scotland_absent, _cash_may_be_null, _cash_null_allowed,
  _gate_null_allowed, _gate_not_just_boolean, _pool_main_may_be_null,
  _grant_is_boolean, _grant_is_required,
  _src_has_post_signature, _classify_engagement_optional, _classify_engagement_absent,
  _classify_engagement_null, _classify_engagement_not_sure, _classify_engagement_signed,
  _classify_engagement_record, _classify_returns, _classify_waits_not_refuses
];
