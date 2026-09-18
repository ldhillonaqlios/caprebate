/* Caprebate business plan model — Phase 6 (Opus), 27 Aug 2026.
   Inputs traceable to:
     - Build-Prep-05-Estimate-Engine-Specification.md §6 (yield bands)
     - Options paper 12804368154 (fee basis)  — cost estimates, claimant types
     - Options paper 12830205390 (minimum fee) — loaded cost, overhead, failed-enquiry drag
   All costs are ESTIMATES, not quotes. No surveyor or CTA quote exists as at 27 Aug 2026.

   REBASED 9 SEPTEMBER 2026 BY PHASE 112. Q55 (3 Sep 2026) settled the fee as 5% of the
   CAPITAL ALLOWANCES IDENTIFIED, which is neither of the two options this model was
   written to compare. Every revenue figure it printed was 5% of LIFETIME RELIEF and was
   therefore understated by 1/(the claimant's marginal rate) — 2.5x at 40%, 4x at 25%.
   feeDecided() below is what we actually charge and it is what sections 3 to 7 and 9 to
   11 now use. feeOptionA and feeOptionB are KEPT, unchanged, because sections 4 and 8
   are a record of a fork that was resolved and deleting the losing branch would make the
   resolution unreadable. THE COST SIDE IS UNTOUCHED — DIRECT is parsed and asserted
   cell-for-cell by Suite B of 04-phase-work/phase9/caprebate-job-economics.test.cjs.

   REBUILT 16 SEPTEMBER 2026 BY PHASE 132e ON THE FLAT 3% FEE. Lakhbir's answer, read
   15 September 2026: "yes, flat fee of 3% of the allowances for 1 or more properties",
   with no bands and no minimum, and "A further multi-site discount can be applied
   depending on site/opportunities". So:
     - the rate is no longer typed here. It is READ from CB_FEE.RATE in the shipped
       engine, the same way 04-phase-work/phase9/caprebate-break-fee-derivation.cjs
       reads it, so this model cannot drift from what we charge;
     - the recommended £5,000 / £7,500 minimum fee is REMOVED, with the two sections
       that priced it (the crossover, and whether the minimum covered cost);
     - no fee bands are modelled, because there are none;
     - the multi-site discount is NOT modelled. It is discretionary, its largest size
       and its approver are not decided, and a forecast that assumed one would be
       inventing the number;
     - 120 jobs a year, the volume Lakhbir gave for the engagement gate, is shown
       beside the papers' 25, 50 and 100. The 24-month ramp is NOT changed to it: the
       ramp is the business plan's own assumption and is its authors' to change.
   feeOptionA and feeOptionB stay, at the 5%-of-RELIEF rate the fee-basis options paper
   was written on, as the record of a resolved fork. They are not our fee. */

const f = n => '£' + Math.round(n).toLocaleString('en-GB');
const f0 = n => Math.round(n).toLocaleString('en-GB');

// ---- Yield bands: purchase route, from the engine spec §6. Midpoints used. ----
const BAND = {
  dental:           { lo: 0.15, hi: 0.30 },
  gp:               { lo: 0.15, hi: 0.30 },
  care_home:        { lo: 0.20, hi: 0.40 },
  private_hospital: { lo: 0.25, hi: 0.45 },
  // supported_living has NO purchase band in the engine spec — refurb only, 0.10-0.25
  // of the COMMUNAL base after common_parts_fraction. Deliberately excluded.
};
const mid = s => (BAND[s].lo + BAND[s].hi) / 2;

// ---- Direct cost per job (estimates, options paper 12830205390 §3) ----
const DIRECT = {
  dental:           { surveyor:1500, cta:600,  hours:8,  rate:60, data:50 },
  gp:               { surveyor:2200, cta:900,  hours:12, rate:60, data:50 },
  care_home:        { surveyor:3200, cta:1200, hours:14, rate:60, data:50 },
  private_hospital: { surveyor:3500, cta:1300, hours:15, rate:60, data:50 },
};
const direct = s => { const d = DIRECT[s]; return d.surveyor + d.cta + d.hours*d.rate + d.data; };

// ---- Overhead + failed-enquiry loading ----
const OVERHEAD_PA = 60000;          // placeholder, per the paper. Lakhbir to supply real figure.
const CONV_RATE   = 0.25;           // 1 in 4 enquiries converts
const FAIL_HOURS  = 2, FAIL_RATE = 60;
const failDrag = () => ((1/CONV_RATE) - 1) * FAIL_HOURS * FAIL_RATE;   // = £360 at 1-in-4
const loading = jobsPa => OVERHEAD_PA/jobsPa + failDrag();
const loaded  = (s, jobsPa) => direct(s) + loading(jobsPa);

// ---- Rates: Rulebook I v1 (24 Aug 2026), awaiting CTA review. rUK only. ----
const RATE = { unincorporated: 0.40, company: 0.25 };

// ---- Fee models ----
// THE RESOLVED FORK, kept as a record. The fee-basis options paper priced two options
// at 5% of RELIEF. That 5% is the paper's, not our fee, and it is named so.
const OPTIONS_PAPER_PCT_OF_RELIEF = 0.05;
const lifetimeRelief = (price, sector, claimant) => price * mid(sector) * RATE[claimant];
const feeOptionB = (price, sector, claimant) => OPTIONS_PAPER_PCT_OF_RELIEF * lifetimeRelief(price, sector, claimant);

// Option A: 5% of YEAR-ONE relief. Year one on the purchase route is a WDA on the pool only
// (no AIA/FYA — Module A §4, open question A-Q1). Main pool 14%, special rate 6%.
const WDA = { main: 0.14, special: 0.06 };
const feeOptionA = (price, sector, claimant, pool) =>
  OPTIONS_PAPER_PCT_OF_RELIEF * (price * mid(sector) * WDA[pool] * RATE[claimant]);

// ---- WHAT WE ACTUALLY CHARGE. Basis: Q55, 3 September 2026, "on the allowance".
// Rate: a flat 3%, Lakhbir's answer read 15 September 2026 (Phase 132e). A percentage
// of the qualifying expenditure identified, BEFORE any tax rate is applied; the
// claimant's marginal rate is deliberately not a parameter. NO MINIMUM FEE, NO BANDS.
// The rate is READ from CB_FEE.RATE in the shipped engine, never typed here. Suite G of
// the phase9 job-economics tests asserts this file reads it rather than restating it.
const path = require('path');
const fs = require('fs');
const SITE = path.join(__dirname, '..', '..', 'Caprebate site.html');
const engineSrc = fs.readFileSync(SITE, 'utf8');
const PCT = new Function(
  engineSrc.slice(engineSrc.indexOf('var CB_PLANT'), engineSrc.indexOf('var CB_BOOKING')) +
  '; return CB_FEE.RATE;')();
const allowances  = (price, sector) => price * mid(sector);
const feeDecided  = (price, sector) => PCT * allowances(price, sector);
const pctLabel = (PCT*100).toFixed(PCT*100 % 1 ? 1 : 0) + '%';

const SECTORS = ['dental','gp','care_home','private_hospital'];
const LABEL = { dental:'Dental', gp:'GP surgery', care_home:'Care home', private_hospital:'Private hospital' };

const line = t => { console.log('\n' + t); console.log('='.repeat(t.length)); };

// ============================================================
line('1. YIELD BAND MIDPOINTS (purchase route, assessed not independently calibrated)');
SECTORS.forEach(s => console.log(
  `  ${LABEL[s].padEnd(18)} ${(BAND[s].lo*100).toFixed(0)}-${(BAND[s].hi*100).toFixed(0)}%  midpoint ${(mid(s)*100).toFixed(1)}%`));
console.log('  Supported living   NO purchase band in the engine spec — refurb/fit-out only,');
console.log('                     10-25% of the COMMUNAL base. Excluded from purchase-route economics.');

// ============================================================
line('2. COST PER JOB (estimates — no surveyor or CTA quote exists)');
[25, 50, 100, 120].forEach(v => {
  console.log(`\n  At ${v} jobs/yr — overhead ${f(OVERHEAD_PA/v)}/job + failed-enquiry ${f(failDrag())} = loading ${f(loading(v))}`);
  SECTORS.forEach(s => console.log(
    `    ${LABEL[s].padEnd(18)} direct ${f(direct(s)).padStart(8)}   loaded ${f(loaded(s,v)).padStart(8)}`));
});

// ============================================================
line(`3. BREAK-EVEN PURCHASE PRICE — ${pctLabel} of ALLOWANCES IDENTIFIED, loaded, at 120, 100 and 25 jobs/yr`);
console.log('  price at which fee = loaded cost. ONE figure per sector: the claimant\'s tax rate');
console.log('  does not enter the fee, so there is no longer an unincorporated/company pair.');
[120, 100, 25].forEach(v => {
  console.log(`\n  --- at ${v} jobs/yr ---`);
  SECTORS.forEach(s => {
    const c = loaded(s,v);
    const be = c / (PCT * mid(s));
    console.log(`    ${LABEL[s].padEnd(18)} loaded ${f(c).padStart(8)}   break-even ${f(be).padStart(11)}` +
      `   (on the superseded lifetime-relief base: ${f(be/RATE.unincorporated)} at 40%, ${f(be/RATE.company)} at 25%)`);
  });
});

// ============================================================
line('4. WORKED JOBS — the decided base, with the resolved A/B fork kept for the record');
const JOBS = [
  { s:'dental',           price:500000,  claimant:'unincorporated' },
  { s:'dental',           price:500000,  claimant:'company' },
  { s:'gp',               price:1200000, claimant:'unincorporated' },
  { s:'care_home',        price:2700000, claimant:'company' },
  { s:'private_hospital', price:2000000, claimant:'company' },
];
JOBS.forEach(j => {
  const lr = lifetimeRelief(j.price, j.s, j.claimant);
  const fb = feeOptionB(j.price, j.s, j.claimant);
  const faLo = feeOptionA(j.price, j.s, j.claimant, 'special');
  const faHi = feeOptionA(j.price, j.s, j.claimant, 'main');
  const c = loaded(j.s, 100);
  console.log(`\n  ${LABEL[j.s]} ${f(j.price)} (${j.claimant})`);
  console.log(`    lifetime relief      ${f(lr)}`);
  console.log(`    Option A fee         ${f(faLo)} - ${f(faHi)}   margin ${f(faLo-c)} to ${f(faHi-c)}`);
  console.log(`    Option B fee         ${f(fb)}              margin ${f(fb-c)}`);
  const fd = feeDecided(j.price, j.s);
  console.log(`  * DECIDED fee (${pctLabel})  ${f(fd)}              margin ${f(fd-c)}   allowances ${f(allowances(j.price,j.s))}`);
  console.log(`    loaded cost          ${f(c)}`);
});

// ============================================================
line('5. NO MINIMUM FEE AND NO BANDS — decided, so nothing is priced here');
console.log('  The recommended £5,000 / £7,500 minimum fee and the rate card\'s bands are gone');
console.log(`  (Lakhbir, answer read 15 Sep 2026). Every job is ${pctLabel} of the allowances identified.`);
console.log('  A multi-site discount may be agreed case by case; its largest size and who approves');
console.log('  it are not decided, so no discount is modelled anywhere in this file.');

// ============================================================
line('6. WITH NO FLOOR, WHICH JOBS LOSE MONEY — the loss band at each volume');
console.log('  With no minimum fee there is nothing under a small job. Every job whose fee is below');
console.log('  its loaded cost loses money: the band runs from a £0 purchase price up to break-even.\n');
[120, 100, 25].forEach(v => {
  console.log(`  --- at ${v} jobs/yr ---`);
  SECTORS.forEach(s => {
    const c = loaded(s,v);
    const be = c / (PCT * mid(s));
    console.log(`    ${LABEL[s].padEnd(18)} loaded ${f(c).padStart(7)}  loses money below ${f(be).padStart(11)} purchase price` +
      `  (below ${f(c / PCT).padStart(9)} of allowances)`);
  });
  console.log('');
});

// ============================================================
line(`7. 24-MONTH FORECAST — the decided base (${pctLabel} of allowances), no minimum, no discount modelled`);
// Mix assumption: stated explicitly so it can be attacked.
const MIX = [
  { s:'dental',           share:0.40, price:750000,  claimant:'unincorporated' },
  { s:'gp',               share:0.20, price:1100000, claimant:'unincorporated' },
  { s:'care_home',        share:0.30, price:1800000, claimant:'company' },
  { s:'private_hospital', share:0.10, price:2500000, claimant:'company' },
];
const blendedFee = () => MIX.reduce((a,m) => a + m.share * feeDecided(m.price, m.s), 0);
const blendedDirect = () => MIX.reduce((a,m) => a + m.share * direct(m.s), 0);

console.log('\n  Assumed mix (stated so it can be attacked):');
MIX.forEach(m => {
  const fee = feeDecided(m.price, m.s);
  console.log(`    ${(m.share*100).toFixed(0)}% ${LABEL[m.s].padEnd(18)} typical ${f(m.price).padStart(11)} allowances ${f(allowances(m.price,m.s)).padStart(10)} fee ${f(fee).padStart(9)}`);
});
console.log(`\n  Blended fee per job   ${f(blendedFee())}`);
console.log(`  Blended direct cost   ${f(blendedDirect())}`);
console.log(`  Blended gross margin  ${f(blendedFee()-blendedDirect())} per job before overhead\n`);

// Ramp: months 1-6 build (no revenue), then a slow referral-led ramp.
const ramp = [0,0,0,0,0,1, 1,2,2,3,3,4, 4,5,5,6,6,7, 7,8,8,9,9,10];
const monthlyOverhead = OVERHEAD_PA/12;
let cum = 0, totJobs = 0, totRev = 0, totDir = 0, worst = 0, worstMo = 0;
console.log('  Mo  Jobs   Revenue    Direct   Overhead      Net       Cumulative');
ramp.forEach((jobs, i) => {
  const rev = jobs * blendedFee();
  const dir = jobs * blendedDirect();
  const net = rev - dir - monthlyOverhead;
  cum += net; totJobs += jobs; totRev += rev; totDir += dir;
  if (cum < worst) { worst = cum; worstMo = i+1; }
  console.log(`  ${String(i+1).padStart(2)}  ${String(jobs).padStart(4)}  ${f(rev).padStart(9)}  ${f(dir).padStart(8)}  ${f(monthlyOverhead).padStart(8)}  ${f(net).padStart(9)}  ${f(cum).padStart(11)}`);
});
console.log(`\n  24-month totals: ${totJobs} jobs, revenue ${f(totRev)}, direct cost ${f(totDir)},`);
console.log(`                   overhead ${f(monthlyOverhead*24)}, net ${f(totRev-totDir-monthlyOverhead*24)}`);
console.log(`  Deepest cumulative cash trough: ${f(worst)} at month ${worstMo}  <-- the funding requirement`);
const y1 = ramp.slice(0,12).reduce((a,b)=>a+b,0), y2 = ramp.slice(12).reduce((a,b)=>a+b,0);
console.log(`  Year 1: ${y1} jobs, revenue ${f(y1*blendedFee())}. Year 2: ${y2} jobs, revenue ${f(y2*blendedFee())}.`);
console.log(`  NOTE: overhead per job at ${y1} jobs in year 1 is ${f(OVERHEAD_PA/Math.max(y1,1))}, not the ${f(OVERHEAD_PA/100)} the`);
console.log(`        options papers assume at 100 jobs/yr. Year-one thresholds are materially higher.`);

// ============================================================
line('8. THE RESOLVED FORK, KEPT FOR THE RECORD — what Option A would have produced');
const blendedFeeA = pool => MIX.reduce((a,m) => a + m.share * feeOptionA(m.price,m.s,m.claimant,pool), 0);
console.log(`  Blended fee per job, special-rate pool: ${f(blendedFeeA('special'))}`);
console.log(`  Blended fee per job, main pool:         ${f(blendedFeeA('main'))}`);
console.log(`  Blended direct cost:                   ${f(blendedDirect())}`);
console.log(`  Gross margin per job:                  ${f(blendedFeeA('special')-blendedDirect())} to ${f(blendedFeeA('main')-blendedDirect())}`);
console.log(`  24-month revenue at ${totJobs} jobs:            ${f(totJobs*blendedFeeA('special'))} to ${f(totJobs*blendedFeeA('main'))}`);
console.log(`  24-month net:                          ${f(totJobs*blendedFeeA('special')-totDir-monthlyOverhead*24)} to ${f(totJobs*blendedFeeA('main')-totDir-monthlyOverhead*24)}`);
console.log('  Option A does not reach break-even at any volume in this model.');

// ============================================================
line('9. SENSITIVITY — what moves the 24-month net');
const base = totRev - totDir - monthlyOverhead*24;
const scen = [
  ['Base case', 1, 1, 1],
  ['Surveyor cost -30% (desktop survey works)', 1, 0.7, 1],
  ['Surveyor cost +30% (site visit always required)', 1, 1.3, 1],
  ['Overhead £100k not £60k', 1, 1, 100000/60000],
  ['Volume -40%', 0.6, 1, 1],
  ['Volume +50%', 1.5, 1, 1],
  ['Mix shifts to company-held (all company)', 1, 1, 1],
];
scen.slice(0,7).forEach(([name, volM, survM, ohM]) => {
  const jobs = totJobs*volM;
  const rev = jobs*blendedFee();
  const dir = MIX.reduce((a,m)=>a + m.share*(DIRECT[m.s].surveyor*survM + DIRECT[m.s].cta + DIRECT[m.s].hours*DIRECT[m.s].rate + DIRECT[m.s].data),0)*jobs;
  const net = rev - dir - monthlyOverhead*24*ohM;
  console.log(`  ${name.padEnd(52)} net ${f(net).padStart(11)}  (base ${f(base)})`);
});
// company-held mix
const MIXC = MIX.map(m=>({...m, claimant:'company'}));
const blendedFeeC = MIXC.reduce((a,m)=>a + m.share*feeDecided(m.price,m.s),0);
console.log(`  ${'Mix shifts to all company-held'.padEnd(52)} net ${f(totJobs*blendedFeeC - totDir - monthlyOverhead*24).padStart(11)}  (fee/job ${f(blendedFeeC)})`);
console.log(`  ${'  ^ identical, and now for a different reason:'.padEnd(52)}      the fee never depended on the`);
console.log(`  ${'    claimant\'s rate in the first place.'.padEnd(52)}`);
console.log(`  ${'Multi-site discount'.padEnd(52)} not modelled: its largest size is not decided`);

// ============================================================
line('10. SINGLE-SURVEYOR AND ENQUIRY-COLLAPSE RISK');
console.log(`  Every job in the model carries a surveyor cost. Blended surveyor spend over 24 months`);
const survSpend = MIX.reduce((a,m)=>a+m.share*DIRECT[m.s].surveyor,0)*totJobs;
console.log(`  at ${totJobs} jobs is ${f(survSpend)} — ${(survSpend/totRev*100).toFixed(1)}% of revenue, paid to ONE person.`);
console.log(`  If that person is unavailable, ${totJobs} jobs of pipeline stop. There is no second signature.`);
console.log(`\n  Clawback exposure: a claim that collapses on enquiry after we are paid.`);
[['dental',750000,'unincorporated'],['care_home',1800000,'company'],['private_hospital',2500000,'company']].forEach(([s,p,c])=>{
  const lr = lifetimeRelief(p,s,c), fee = feeDecided(p,s);
  console.log(`    ${LABEL[s].padEnd(18)} ${f(p)}: our fee ${f(fee).padStart(8)}, client's exposure ${f(lr).padStart(10)} = ${(lr/fee).toFixed(0)}x the fee`);
});

// ============================================================
line('11. THE TWO THINGS THE MODEL ABOVE IS NOT HONEST ABOUT');

console.log('\n  (a) There is no founder salary in the £60,000 overhead.');
const SALARY = 60000;
const monthlyAll = (OVERHEAD_PA + SALARY)/12;
let cum2 = 0, worst2 = 0, worstMo2 = 0, breakevenMo = null;
ramp.forEach((jobs,i) => {
  const net = jobs*blendedFee() - jobs*blendedDirect() - monthlyAll;
  cum2 += net;
  if (cum2 < worst2) { worst2 = cum2; worstMo2 = i+1; }
  if (breakevenMo === null && cum2 > 0) breakevenMo = i+1;
});
console.log(`      Add a ${f(SALARY)} founder salary and the 24-month net becomes ${f(totRev - totDir - monthlyAll*24)}`);
console.log(`      (was ${f(base)}). Deepest cash trough ${f(worst2)} at month ${worstMo2}.`);
console.log(`      Cumulative break-even: ${breakevenMo ? 'month '+breakevenMo : 'NOT REACHED inside 24 months'}.`);
const jobsToCover = (OVERHEAD_PA + SALARY) / (blendedFee() - blendedDirect());
console.log(`      Jobs per YEAR needed just to cover overhead + salary: ${jobsToCover.toFixed(1)}`);
console.log(`      = ${(jobsToCover/12).toFixed(1)} jobs a month, every month, before a penny of profit.`);

console.log('\n  (b) We pay the surveyor and the CTA before we invoice the client.');
const LAG = 2;  // months between paying suppliers and collecting the fee
let cash = 0, worstCash = 0, worstCashMo = 0;
ramp.forEach((jobs,i) => {
  const paidOut = jobs*blendedDirect();                  // month the work is done
  const collected = (i-LAG >= 0 ? ramp[i-LAG] : 0)*blendedFee();  // fee lands LAG months later
  cash += collected - paidOut - monthlyAll;
  if (cash < worstCash) { worstCash = cash; worstCashMo = i+1; }
});
console.log(`      With a ${LAG}-month lag between paying suppliers and collecting the fee,`);
console.log(`      and a founder salary, the deepest cash trough is ${f(worstCash)} at month ${worstCashMo}.`);
console.log(`      THAT is the funding requirement, not the ${f(worst)} the naive model shows.`);

console.log('\n  (c) Sanity check on the ramp itself.');
console.log(`      The ramp assumes ${y1} jobs in year 1 and ${y2} in year 2, reaching 10/month.`);
console.log(`      At a 1-in-4 conversion rate that needs ${(y2/CONV_RATE/12).toFixed(0)} qualified enquiries a month by month 24,`);
console.log(`      sourced almost entirely through accountant referral. That is the number to challenge.`);
