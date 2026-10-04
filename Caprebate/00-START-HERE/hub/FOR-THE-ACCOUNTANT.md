# FOR THE ACCOUNTANT — everything waiting on your sign-off

 **A live register. Version 1.0 · 4 September 2026 · Caprebate**

 **Corrected 16 September 2026 (Phase 132d) — every entry in this register now carries the register's own prefix.** The entries now read ACC-A1 to ACC-A15, ACC-B1 to ACC-B11, ACC-C1 to ACC-C12, ACC-D1 to ACC-D3.2, ACC-E1 to ACC-E3 and ACC-H1 and ACC-H2, where until today only ACC-B1, ACC-C8 and ACC-E1 carried it. The bare codes A1 to E4 are also the rows of the entitlement truth table in Rulebook B, which the tax adviser reads beside this register, so the same short code meant two things depending on which document you were in. **Only the codes changed:** no entry was added, removed or re-worded, no status moved, and every count in this register still says exactly what it said.

 **Added 25 September 2026 (Phase 151d) — this register is now a file, not a monday.com document.** monday.com was dropped on 25 September 2026. This register is `00-START-HERE/hub/FOR-THE-ACCOUNTANT.md` in the project's repository, and the tasks it names are rows of `00-START-HERE/hub/TRACKER.csv`, found by the same numbers. Where it says "the board", read the tracker; where it says a file is attached to a task, the file is on disk, and the tracker says where. Nothing moved in or out of it.

 **Added 25 September 2026 (Phase 151d) — Lakhbir has written his own view under eleven of Part 2's questions, and they are waiting for you.** They are in the Word questions document (Caprebate_Questions.docx), Section 3, "For the accountant": "Do you want a fee for sending clients, and what must you tell them?"; "Who sends the corrected tax return to HMRC: you or us?"; "Should the client deal with us directly, or should you stay in charge?"; "Are the four documents we ask for the right ones, and easy to get?"; "In what format would you like us to send our results?"; "How much of our evidence pack do you actually want to receive?"; "Is our way of working out the deadline to correct a return right?"; "When in your year is a good or bad time to talk to you?"; "If HMRC questions a claim, who does the client phone?"; "What would make you look bad in front of your client?"; and "Has another capital allowances firm contacted you before, and what happened?". **They are his input, not your answer.** Each question stays open, and each now carries a dated line saying it was read. Please read his view before you answer, and say where you disagree. One needs care: his view is that either we or you may send a corrected return, and clause 1 of our engagement letter says today that the client's own accountant or tax adviser signs off the filing, so the solicitor sees that before we ever file.

---

## Which parts need which person

 This document covers **two different professional roles**. They may be the same firm, or two different ones, and it is written to work either way.

|   |  Who |  What they are asked for |  Shape of the engagement |
| --- | --- | --- | --- |
|  **PART 1** |  A **chartered tax adviser** |  Read what we have written and tell us where we are wrong |  **A fixed-fee document review. Not a retainer.** You are being asked to check work, not to produce it |
|  **PART 2** |  **Your own accountant** — the practice that would refer clients to us, or file for them |  Answer questions only a practising accountant can answer |  A conversation, then a working arrangement |

 **If you are a tax adviser reading this, Part 1 is yours and Part 2 is not.** If you are an accountant in practice, Part 2 is yours; Part 1 will tell you what we have and have not had reviewed, which is worth knowing before you refer anybody.

---

## The honest position, and it is the reason this is a cheap engagement

 **We built everything and we switched nothing on.**

 Every reading of the law in this document that would make a claim **bigger** has been coded, tested both ways, and left **off**. The engine behaves today exactly as it behaved before any of the work was done. Eleven rulebooks are written with the statute cited throughout. Twenty-four engine readings sit in the live source behind named switches, each set to the behaviour the engine already had — counted by the extraction verifier and checked against the code on 15 September 2026 — plus one switch for the break-even answer (ACC-A13), which sits in the back end's funnel rather than in the engine. Of the twenty-four, fifteen would make a claim bigger if switched on, three can only make one smaller, four move money either way, one changes the basis of a figure and one removes false negatives. The ones that can only make a claim smaller are off too: off means today's behaviour, not the safer reading. (Corrected 14 September 2026 by Phase 131: this said seventeen. Corrected 15 September 2026 by Phase 132: this said nineteen. Phase 132 built five more — the aggregation of repairs into a replacement, the corporation tax rate from the associated-company count, the 60% band where the personal allowance is withdrawn, the later company deadline for a partnership with a company partner, and a landlord's contribution in supported living.)

 **Added 4 October 2026 by Phase 153a:** there are now twenty-five engine readings. The twenty-fifth, ACC-A16, takes a grant matched to named items off only those items, and it moves money either way; it is read by the surveyor's working file, not by the online estimate. The split above is counted for the first twenty-four. It is being re-derived for all of them in code, by switching each on alone against the same set of cases, once the readings Phase 153b adds are built.

 **Added 4 October 2026 by Phase 153b — twenty-nine readings now, and which way each moves a claim, counted in code rather than read off our own notes.** Phase 153b built four more, each off: ACC-A17 (an election with no tax references), ACC-A18 (an election under the wrong section), ACC-A19 (an elected figure above the law's limit) and ACC-A20 (a housing association's payment in supported living). Then each of the twenty-nine was switched on alone against all of them off, on the same set of cases — 6,000 seeded walks through each sector's own questions with every switch's questions answered, plus 40 cases taken from our own test fixtures for the rare ones — and the figures compared: the qualifying spend, the tax saving and the cash, both ends of each range, and whether the money arrives as a repayment or over years (03-app/caprebate-switch-direction.cjs). **Of the twenty-nine: seventeen make a claim bigger, four only smaller, six move it either way, and two act only in the surveyor's working file** (ACC-A6, which moves it bigger there, because the online estimate already applies no fixed-value cap where the seller never claimed; and ACC-A16, either way). Four differ from what our notes said: ACC-A7 (the seller who was never entitled) makes claims bigger, not "removes false negatives"; ACC-A8 (the grant traced to the common parts) moves money either way, because a traced share above the scheme-wide rate takes more off; ACC-A11 (the trade-purpose flat) is simply bigger; and ACC-A18 narrows the range — the floor rises to the elected figure and the top comes down to it. The split in the paragraph above is kept as written for the record; this one replaces it.


 **We are not asking you to bless a position we have already taken. We have not taken it.**

 That is not modesty. It is what makes the review quick: for every switched reading, one of your two answers is a **one-line change in one file** and the other is **doing nothing at all**. In Section A, confirming us is the one line and rejecting us is nothing. For the three readings in Section D, which were already live before anyone asked, it is the other way round — and since 12 September 2026 that one line exists for them too. Nobody writes new code either way, and nobody has to work out what the corrected arithmetic ought to be — it is already built and already tested.


 **And that sentence stops being true the moment we flip a switch on our own reading.** On 3 September the director gave his own view on seven of these questions and agreed with us on most of them. Nothing was switched on. His views are recorded under the questions as the company's **provisional position**, labelled as such. Please answer as if they were not there.

 **No claim has been filed and no client has been billed.** Caprebate is pre-launch. Nothing here is live in front of a paying client except the wording noted in a handful of entries, which is flagged where it occurs.

---

## How to use this register

 Every entry tells you the same six things: **what it is**, in plain English; **what state it is in** — built and tested, drafted, or partially drafted; **what we are asking you to do** — confirm, amend, or reject; **what happens if you confirm and what happens if you reject**; **what it unblocks**; and **a sign-off line**, with room for your amendment.

 **Answer in this document if that suits you.** Write in the sign-off block, initial it, date it. Where a question needs more room than the block gives, write "see attached" and send it however you like — we will transcribe it and keep your original.

 **Part 1 Section A is ordered by how much money it moves, not by how our project is organised.** If you only ever answer Section A, we can move. Sections B, C and D matter and none of them is urgent in the same way.

---

# PART 1 — FOR THE CHARTERED TAX ADVISER

## Section A — the fifteen things that change money


 **All twelve are now built, tested and switched off.** Until 7 September 2026 the first one — stamp duty — was the exception, written up but not built. It is built now, behind the eleventh switch, and it is off with the other ten. The twelfth, ACC-A12, was added beside ACC-A8 on 10 September 2026 and built and switched off the same day. **On 12 September 2026 the second half of ACC-A1 — whether legal and incidental acquisition costs follow the tax in — was built as well, behind a switch of its own, off.** Nothing in the arithmetic a client sees has changed.


 **Marked 12 September 2026: wherever this register still says "ten", "eleven" or "twelve" switched readings, it predates the stamp-duty switch (7 September), ACC-A12 (10 September) or the five switches added on 12 September. There are seventeen: thirteen behind Section A's twelve entries (ACC-A1 carries two), three behind ACC-D2, ACC-D3.1 and ACC-D3.2, and one behind the Scottish rates addendum.** The count is derived at runtime by the extraction verifier, which is the place to read it; the sentences here are corrected where they are the ones a reader relies on, and marked by this note where they are not. **Marked again 13 September 2026: there are now eighteen. The eighteenth is behind ACC-A14, added that day, so wherever this register says "seventeen" it predates ACC-A14.**


 **Marked 13 September 2026 by Phase 129b:** the note above says there are seventeen switched readings, and until today this section's heading said twelve. There are now nineteen switches in the engine, and this section holds fifteen entries, ACC-A1 to ACC-A15 — ACC-A13 is a switch outside the engine, and ACC-A15 is the nineteenth. The heading has been corrected; where the text below still gives a smaller number, it predates the entry that followed. **Corrected 15 September 2026 by Phase 132:** the extraction verifier now counts twenty-four switches in the engine, all off. The five Phase 132 built belong to entries already in this register (ACC-A7, ACC-A8, ACC-A9, and Rulebooks G and I in Section B), so no entry was added.


 **Two of these must be answered together, and two must not be treated as one question.** Both are flagged where they occur.

---

### ACC-A1 · Stamp duty in the figure that gets apportioned

> BOTH HALVES BUILT AND SWITCHED OFF 
> — the transaction tax 
> as of 7 September 2026
> ,
>  the legal and i
> ncidental acquisition costs as of 12 September 2026. Each has its own switch and its own question, both invisible while their switch is off, and eith
> e
> r
>  
> c
> an be
>  t
> u
> r
> ne
> d
>  
> o
> n 
> wi
> th
> o
> u
> t
>  the
>  other
> .

|  **What it is** |  When a building is bought, the price paid is apportioned to work out how much of it was plant. **We apportion the purchase price only. We do not add the stamp duty.** A competitor's published report adds the transaction tax into the apportionable figure and excludes legal fees, deliberately and on the face of the report, without saying why. |
| --- | --- |
|  **What state it is in** |  **BUILT, TESTED AND OFF** — 7 September 2026. The transaction tax is added to the apportionable figure by a shared module that all five sector engines call, behind the eleventh switch, defaulting to today's behaviour. The questionnaire now has the amount field it never had, worded for all four nations, and it is invisible to every client while the switch is off. Both readings are asserted in the test harness, per sector, so nobody can turn this on silently. **Pa****r****t 2 of the**** question**** b****e****low is no****w buil****t**** too — 12 September 2026 — be****hin****d**** ****a**** se****p****ara****t****e switch, also off.** A question asks for the legal and other costs directly attributable to acquiring the property (conveyancing fees, searches and similar; not finance fees, not the costs of setting up the business, not the tax). It is invisible while the switch is off. On, a stated amount is added to the apportionable figure on a purchase only, and a blank adds nothing. The two switches are independent, and both readings of each are asserted in the harness, per sector.
 |
|  **The size of it** |  The understatement is the tax divided by (price + tax) — **roughly 4 to 5% of every purchase claim we will ever produce**, and it does not average out across a portfolio. On the competitor's own worked job it is 4.76%. |
|  **The contradiction this used to carry**
 |  **Closed 12 September 2026.** Until then our client-facing wording told clients outside England that "acquisition costs added to the base under s.562" were their local transaction tax, while the arithmetic added nothing. **That sentence ****now fo****ll****ow****s the ****switch**: off, the client is told their local tax by name and that this estimate does not add it; on, the same tax is named as what is added. The wording no longer decides the question, so you are answering the arithmetic alone.
 |
|  **What we are asking you to do** |  Two questions. **(1) Does SDLT — and Land Transaction Tax and Land and Buildings Transaction Tax — form part of the consideration apportioned under CAA 2001 s.562?** **(2) If it does, do legal and other incidental acquisition costs follow it in, or stay out?** The competitor draws a line between them and does not explain it. We would rather have the reasoning than copy the line. |
|  **If you confirm** |  **We ****flip one ****b****oo****l****ean.** The switch, the amount field and both sides of the arithmetic already exist and are tested; confirming part 1 is a one-line configuration change, not a build. Every purchase claim goes up by about 4 to 5%. If you also confirm part 2 — that legal and incidental acquisition costs follow the tax in — that is a second boolean, not a build: the question and the arithmetic already exist and are tested.
 |
|  **If you reject** |  Both switches stay off and nothing changes. The client-facing wording was corrected on 12 September 2026 to say the tax is not added, so there is nothing left to undo.
 |
|  **What it unblocks** |  The single largest systematic under-claim we know about. (The misstatement to clients outside England was removed on 12 September 2026.)
 |

```
SIGN-OFF        Confirmed  /  Amended  /  Rejected      (delete two)

Part 1 - is the transaction tax in the s.562 consideration?

Part 2 - do legal and incidental acquisition costs follow it in?

Your amendment or reasoning:
.....................................................................
.....................................................................
.....................................................................

Signed .............................  Date ..........................
```

 **Added 15 September 2026 by Phase 132c — the text under the stamp-duty question is unsigned input, not an answer.** CAPREBATE QUESTIONS holds typed text in both parts of the answer box under "When a building is bought, is the stamp duty part of the price we apportion?": the transaction tax included in the consideration apportioned, and incidental costs following where directly attributable and capital. Asked who wrote it, Lakhbir's answer is that it will not be signed by a tax adviser. So it is kept there, and marked, as a draft for you to confirm or correct. Both halves of this entry stay switched off, and purchase claims are still apportioned without the transaction tax.

 **Added 16 September 2026 by Phase 132e — the unsigned text under this entry's question, quoted.** Nobody signed it and it is not a tax adviser's answer. It sits here, beside the entry, for you to confirm, correct or strike out. Nothing in this entry changes state and no switch is turned on.

 **Unsigned draft, not a professional's answer — confirm or correct:** typed into the answer box under “When a building is bought, is the stamp duty part of the price we apportion?” in CAPREBATE QUESTIONS, unsigned and undated. Quoted exactly as typed; only the box's own dotted leader, where it ran on at the start or end of a line, is left out. It moves no switch and no figure.

```
The transaction tax (SDLT/LTT/LBTT, as applicable) is included in the consideration/capital cost being apportioned,
to the extent attributable to the qualifying asset.

Part 2 - do legal and other incidental acquisition costs follow it in?
Legal and other incidental acquisition costs can follow it in where they are directly attributable to acquiring
 the qualifying asset and are capital expenditure for the relevant allowance. They should not all be automatically
included simply because they were incurred as part of the purchase.
```

---

### ACC-A2 · Can a high-care supported-living scheme fall outside the "home" restriction entirely?

|  **What it is** |  Capital allowances are barred on a dwelling-house. HMRC's own guidance accepts that **specialised supported housing may not be a dwelling-house at all**. If it is not, the ceiling we currently apply — which confines the claim to the communal parts — has nothing to stand on. Today we apply that ceiling to every supported-living scheme whatever the care model. On the other reading, an evidenced on-site-care scheme is claimed on the **whole** base. |
| --- | --- |
|  **What state it is in** |  **Built and tested, switched off.** Both readings implemented; the corrected client wording built alongside the corrected figure. One new client question is built and is invisible while the switch is off: _"Do the people living here receive personal care on site as part of the scheme itself?"_ |
|  **Which way the money moves** |  **MUCH BIGGER — the largest single item in this section.** The claimable base goes from roughly a quarter of the scheme to all of it: a **fourfold** increase. It also opens a market we currently price ourselves out of. |
|  **What we are asking you to do** |  Confirm, amend or reject the reading. **And if it depends on facts, tell us which facts** — we will build them into the client questionnaire rather than guess at them. |
|  **If you confirm** |  One word changes in one file. The ceiling is lifted for evidenced on-site-care schemes only, the new question becomes visible, and the client wording changes with the number. **One consequence you should rule on at the same time:** with the ceiling lifted, our fixture-density assumption stops being one of two compounded conservative numbers and becomes the only unverified assessment in the figure. We say that in terms in the report. Please tell us if saying it is enough. |
|  **If you reject** |  Nothing changes. The branch stays inert and the current ceiling stands. |
|  **What it unblocks** |  Whether we can serve high-care supported living at all, and at what size of claim. **This is the sector our own risk register names as our highest mis-selling exposure**, which is precisely why we will not decide it ourselves. |

```
SIGN-OFF        Confirmed  /  Amended  /  Rejected      (delete two)

If it depends on facts, which facts?

Your amendment or reasoning:
.....................................................................
.....................................................................
.....................................................................

Signed .............................  Date ..........................
```

---

### ACC-A3 · Can a buyer add their own installation alterations on top of an agreed figure?

|  **What it is** |  A seller and a buyer formally agree the boiler in the building is worth £20,000. The buyer then spends £5,000 knocking a hole in a wall to get the new plant in. **Is the claim £20,000 or £25,000?** Our reading is £25,000 — the agreed figure caps what passes from the seller, and the buyer's own alterations sit on top of it. Today the arithmetic caps the whole thing at £20,000. |
| --- | --- |
|  **What state it is in** |  **Built and tested, switched off.** Both readings implemented. |
|  **Which way the money moves** |  **BIGGER**, and it is **the single largest claim-increasing point in the system**. |
|  **The contradiction this used to carry**
 |  **Closed 12 September 2026.** Until then every client was told, with the switch off, that their own alterations "sit on top of any election cap rather than inside it", while the arithmetic kept them inside. **Th****e**** se****n****tence**** ****w****a****s ****n****ot e****d****i****t****e****d**** ****e****ith****e****r way; ****i****t**** ****n****o****w follow****s the ****swi****t****c****h****.** Off, the client is told their alterations were kept inside the cap, that the point is not yet confirmed and that the lower reading is used. On, the original sentence is said, and the switched arithmetic makes it true. The wording no longer decides the question.
 |
|  **What we are asking you to do** |  Confirm or reject it **explicitly**. The wording now follows your answer, so you are ruling on the number.
 |
|  **If you confirm** |  One-line switch. The buyer's alteration spend is added on top of the ceiling, but only where a ceiling actually bit, and the client is told so.
 |
|  **If you reject** |  Nothing changes. The switch stays off, and the client is already told the lower reading is the one used.
 |
|  **What it unblocks** |  The largest single correction we hold. (The contradiction between what we told a client and what we computed was closed on 12 September 2026.)
 |

```
SIGN-OFF        Confirmed  /  Amended  /  Rejected      (delete two)

(Since 12 September 2026 the wording follows the number - no separate ruling needed.)

Your amendment or reasoning:
.....................................................................
.....................................................................
.....................................................................

Signed .............................  Date ..........................

```

 **Added 15 September 2026 by Phase 132c — the question behind this switch now exists.** Until today no question set the buyer's own alteration spend, so switching this on would have changed nothing. Now, in all five sector flows, a buyer whose seller is known to have claimed is asked how much they spent on building work needed to install equipment — but only while this switch is on. With it off the question is never asked and no figure moves. With it on, the answer is added on top of an election or disposal-value ceiling: a £300,000 election plus £40,000 of alteration spend gives £340,000. A blank, "not sure", nothing at all or £0 adds nothing. One thing to rule on with the number: the addition follows the election outcome, not a test of whether the ceiling actually lowered the figure, so "only where a ceiling actually bit" above describes the intent more tightly than the code does.

---

### ACC-A4 · Where an earlier owner's entitlement came only through a contribution, do the ceilings apply?

> ANSWER THIS TOGETHER WITH ACC-A7.
>  Where both carve-outs fire on the same purchase, nothing is left holding the figure down. See the note after ACC-A7.

|  **What it is** |  Both statutory ceilings that cap a buyer's claim at an earlier owner's figure exclude plant that owner held **as a result of s.538** — that is, where their entitlement arose only because somebody contributed towards the cost rather than because they bought or installed it. Today our ceiling bites however the past owner became entitled. |
| --- | --- |
|  **What state it is in** |  **Built and tested, switched off.** One new client question is built and invisible: _"How did that earlier owner come to have allowances on these fixtures — did they pay for them, or did somebody contribute towards the cost?"_ |
|  **Which way the money moves** |  **BIGGER.** Both ceilings come off entirely. In our worked test case the figure moves from a £120,000 ceiling to the full band. |
|  **What we are asking you to do** |  Confirm, amend or reject — **and answer it in the same sitting as ACC-A7.** |
|  **If you confirm** |  One-line switch, and the new question becomes visible. |
|  **If you reject** |  Nothing changes; the ceiling continues to bite regardless of route. |
|  **What it unblocks** |  A whole class of second-hand purchases where the figure is currently held down by a cap we may not be entitled to apply. |

```
SIGN-OFF        Confirmed  /  Amended  /  Rejected      (delete two)

Your amendment or reasoning:
.....................................................................
.....................................................................
.....................................................................

Signed .............................  Date ..........................
```

---

### ACC-A5 · Is there a third route to fixing the value, and does it really have no deadline?

|  **What it is** |  We currently offer clients two ways of satisfying the fixed value requirement — a joint election with the seller, and an application to the tribunal — and both die when the two-year period closes. **We believe there is a third route**, open where the owner in between was never able to claim, satisfied by two written statements, and carrying **no time limit at all**. We do not offer it. |
| --- | --- |
|  **What state it is in** |  **Built and tested, switched off.** **Two** new client questions are built and invisible, and neither is asked today: _"Was that in-between owner ever able to claim capital allowances on the fixtures themselves?"_ and _"Do you have written statements from BOTH of those owners about the fixtures?"_ |
|  **Which way the money moves** |  **BIGGER, and on a closed window it is the difference between a live claim and no claim at all.** Today a closed window returns "unresolved, with the bottom of the range at nil". |
|  **What we are asking you to do** |  Confirm that the route exists as we read it, and confirm that it carries no time limit. |
|  **If you confirm** |  One-line switch. Two things change for clients: on a **closed** window an evidenced statements route settles the requirement outright; on an **open** window the urgency wording changes too, because a client is currently pushed to act inside a period that would not in fact be the last word. **We have built the route to be satisfied only where both facts are positively established** — "there probably were some statements" leaves the position unresolved, because the burden of producing them is the client's. Please tell us if that is too strict or not strict enough. |
|  **If you reject** |  Nothing changes. A closed window continues to stop the claim. |
|  **What it unblocks** |  A class of purchases we currently turn away, and what we are entitled to say to a client about urgency. |

```
SIGN-OFF        Confirmed  /  Amended  /  Rejected      (delete two)

Does the route carry no time limit?      Yes  /  No

Your amendment or reasoning:
.....................................................................
.....................................................................
.....................................................................

Signed .............................  Date ..........................
```

---

### ACC-A6 · Where the past owner never claimed, does the fixed value requirement apply at all?

> This one is in the review pack at Section D, but it was missing from our shorter questions document
>  — which, when this was written, listed the ten switched items and did not include it. See Appendix 1.

|  **What it is** |  The fixed value requirement hangs on the past owner having been **required to bring a disposal value into account**. An owner who never claimed brings none in — so on that reading the requirement never applies, and we should not be running a two-year clock or asking the fixed-value questions at all. Today we ask them of anyone with an entitled past owner, claimed or not. |
| --- | --- |
|  **What state it is in** |  **Built and tested, switched off.** The whole fixed-value question block is built to **drop out of the flow** where the past owner is known never to have claimed. It stays in where the claim history is unknown. |
|  **Which way the money moves** |  **BIGGER.** The requirement comes off entirely on a known "they never claimed". |
|  **What we are asking you to do** |  Confirm, amend or reject. |
|  **If you confirm** |  One-line switch. The requirement is disapplied on a known "no", and only where no earlier entitled owner sits further back who might have claimed. **We have built it to fire only on a known negative — an unknown claim history never relieves.** |
|  **If you reject** |  Nothing changes. |
|  **What it unblocks** |  A shorter client questionnaire for a whole class of purchase, and a claim that currently dies on a requirement that may not apply. |
|  **What this is NOT** |  **This says nothing about the pooling requirement**, which is a different subsection on different facts, points the other way — towards nil — and is deliberately not switched here. Answering this does not answer that. |

```
SIGN-OFF        Confirmed  /  Amended  /  Rejected      (delete two)

Your amendment or reasoning:
.....................................................................
.....................................................................
.....................................................................

Signed .............................  Date ..........................
```

---

### ACC-A7 · Was a seller who could never have claimed ever "entitled" to claim?

> ANSWER THIS TOGETHER WITH ACC-A4.

|  **What it is** |  Some sellers are barred from claiming outright — residential landlords, charities, pension funds, NHS bodies. **If a seller could never have claimed on these fixtures themselves, was the second-hand fixtures regime ever engaged on a purchase from them?** Today we run the triage on such a seller anyway, and can return nil on a claim that was never inside the rules. |
| --- | --- |
|  **What state it is in** |  **Built and tested, switched off.** One new client question is built and invisible: _"Was the seller someone who could never have claimed on these fixtures themselves?"_ |
|  **Which way the money moves** |  **REMOVES FALSE NEGATIVES.** Claims that currently die on a technicality survive. **Note carefully: switching the regime off does not make the claim uncapped.** The separate s.185 ceiling is left **unresolved**, and we raise a named flag saying so rather than quietly widening the figure. |
|  **The distinction we need you to rule on** |  The director's provisional view framed this on whether a claim was ever **made**. The question is whether the seller was ever **entitled** to make one. **Those come apart, and the gap is the whole answer:** a taxable seller who simply never got round to claiming is a different case from a charity that could never have claimed at all. We believe only the second engages the argument. **If that distinction is real, it is what we build into the client questionnaire — so please say so directly.** |
|  **If you confirm** |  One-line switch, plus the new question. |
|  **If you reject** |  Nothing changes. |
|  **What it unblocks** |  Purchases from charities, pension funds, NHS bodies and residential landlords — which in healthcare property is not a rare case. |

> THE COMPOUNDING NOTE — ACC-A4 AND ACC-A7 TOGETHER.
>  Where both carve-outs fire on the same purchase, the contribution route removes one ceiling and the barred seller removes the other, and 
> nothing is left holding the figure down.
>  Answered one at a time, each looks defensible. Answered together they produce an uncapped claim. Our engine raises a named flag saying exactly this whenever both fire, and there is a test asserting it. 
> We would rather you answered both in one sitting than gave us two separately reasonable answers that combine into something neither of us intended.

 Added 15 September 2026 by Phase 132. The narrowing you are asked to rule on is now in the switched gate: with the switch on, the fixtures regime is treated as not engaged only where an earlier owner is known not to have been entitled to claim. "Not sure" and no answer keep today's reading. Whether an owner who was entitled only through a contribution counts as "entitled" is recorded as part of the questions already asked here and at ACC-A4, and it has not been decided. Please confirm that only a known "never entitled" should narrow the regime, and answer the contribution point in the same sitting as ACC-A4.

```
SIGN-OFF        Confirmed  /  Amended  /  Rejected      (delete two)

"Never claimed" or "never entitled" - which is the test?

Your amendment or reasoning:
.....................................................................
.....................................................................
.....................................................................

Signed .............................  Date ..........................
```

---

### ACC-A8 · A scheme-wide grant, deducted twice

> This is the only item in Section A that would change a live client figure the moment its switch flipped. Every other one depends on a fact no client question currently captures, so they are inert twice over — the switch is off AND nothing could feed the branch. This one keys off a field the questionnaire captures today. 
> Corrected 15 September 2026:
>  it is not the only one. The reading at ACC-A7, on a seller who could never have claimed, also keys off an answer captured today — a seller described as a private landlord already records the fact that reading uses — so it too would move a live figure the moment its switch went on. For several other readings the question that feeds them exists but appears only once their switch is on, and one reading, a buyer's own alterations at ACC-A3, is fed by no question at all.

|  **What it is** |  Today a scheme-wide grant percentage is taken off the **whole** base, and the remainder is then cut down to the communal parts. **One payment therefore reduces the claim twice.** On the other reading, an untraced scheme-wide grant cannot be attributed to the claimable areas at all, and only a grant actually **traced** to them comes off, at its traced rate. |
| --- | --- |
|  **What state it is in** |  **Built and tested, switched off.** One new client question is built and invisible: _"Of the grant funding, what share was against the communal parts?"_ |
|  **Which way the money moves** |  **BIGGER** for an untraced grant. A traced grant still comes off in full at its traced rate, so a client who can evidence the split is not put at a disadvantage against one who cannot. Most of the effect lands in supported living. |
|  **What we are asking you to do** |  Confirm, amend or reject. The director answered with the general rule and a useful point about invoice evidence, but **not the narrow question, which is where the deduction lands**. |
|  **If you confirm** |  One-line switch, plus the new question — **and unlike the others, live figures move immediately.** We would want to agree the changeover with you rather than flip it silently. |
|  **If you reject** |  Nothing changes; the grant continues to be deducted from the whole base before the communal cut. |
|  **What it unblocks** |  A double deduction in the sector that carries our highest exposure. |
|  **Do not couple this with ACC-A9** |  Both concern money somebody else put in. **They are different questions with different answers and they have separate switches on purpose.** |

```
SIGN-OFF        Confirmed  /  Amended  /  Rejected      (delete two)

Where does the deduction land - the whole base, or the claimable areas?

Your amendment or reasoning:
.....................................................................
.....................................................................
.....................................................................

Signed .............................  Date ..........................
```

 Added 15 September 2026 by Phase 132. The same switched correction now also applies to care homes wherever the self-contained letting factor applies, not only to supported living. The switch is still off. Please confirm that your answer on where the deduction lands holds for a care home with self-contained lettings as well as for supported living, or tell us where the two differ.

---

### ACC-A12 · A grant-funded purchase that is also capped — does the grant come off before the ceiling or after it?

> Added 10 September 2026. It sits beside ACC-A8 because both are about where a grant lands, and it is numbered ACC-A12 because ACC-A9 to ACC-A11 were already numbered. 
> It is the only entry in Section A that can only take money off a client
>  — and, like ACC-A8, it keys off a field the questionnaire captures today, so it would move a live figure the moment its switch flipped.

|  **What it is** |  A trading company buys a care home for £2,000,000 and a public body's grant pays for 40% of it. An earlier owner had claimed allowances on the fixtures, so the claim is capped at the value fixed when that owner sold — here £120,000. **Today the grant comes off the spend first and the cap is applied to what is left**, so while the reduced spend still sits above the cap, the grant changes nothing. On the other reading **the cap is applied first and the grant's 40% comes off the capped figure**. The same question arises where a joint election or s.187A sets the ceiling. |
| --- | --- |
|  **What state it is in** |  **Built and tested, switched off.** It asks the client nothing new: it reads the grant share every sector already asks for. Applied the same way in all five sectors. |
|  **Which way the money moves** |  **SMALLER, and only where a ceiling binds.** On the facts above: **£120,000 today, £72,000 on the switch**, in every sector. Where no ceiling binds, the two orders give the same figure. |
|  **What we are asking you to do** |  Confirm the order we use, or tell us it runs the other way. **Our current order is the favourable one and nobody has confirmed it.** The director has given no view. |
|  **If you confirm today's order** |  Nothing changes. |
|  **If you say it runs the other way** |  One-line switch — and **live figures move down immediately** for every grant-funded purchase an earlier owner had claimed on, so we would want to agree the changeover with you rather than flip it silently. The client is told in a flag, raised only where a ceiling actually bound. |
|  **What it unblocks** |  The figure shown to every client, in every sector, who bought a grant-funded building that an earlier owner had already claimed on. |
|  **How it sits with ACC-A8** |  **They combine; neither replaces the other.** ACC-A8 decides how much of a supported-living grant comes off; this decides when. With both switched on, an untraced grant still comes off nowhere. |

```
SIGN-OFF        Confirmed  /  Amended  /  Rejected      (delete two)

Confirmed = the grant comes off the spend first (today).
Rejected  = the cap is applied first and the grant comes off after it.

Your amendment or reasoning:
.....................................................................
.....................................................................
.....................................................................

Signed .............................  Date ..........................
```

 **Added 16 September 2026 by Phase 132e — the unsigned text under this entry's question, quoted.** Nobody signed it and it is not a tax adviser's answer. It sits here, beside the entry, for you to confirm, correct or strike out. Nothing in this entry changes state and no switch is turned on.

 **Unsigned draft, not a professional's answer — confirm or correct:** typed into the answer box under “When a grant-funded purchase is also capped at a past owner's figure, does the grant come off before the cap or after it?” in CAPREBATE QUESTIONS, unsigned and undated. Quoted exactly as typed; only the box's own dotted leader, where it ran on at the start or end of a line, is left out. It moves no switch and no figure.

```
Before the cap
```

---

### ACC-A9 · A connected contributor

|  **What it is** |  Where a landlord or a pension fund contributes towards a fit-out, we deduct the contribution from the client's qualifying spend. **But a connected contributor may be barred from claiming contribution allowances at all** — and if they are, the provision that reduces the occupier's spend arguably has nothing to bite on, so the occupier's own spend stands in full. Today we deduct every contribution, whoever made it. |
| --- | --- |
|  **What state it is in** |  **Built and tested, switched off.** One new client question is built and invisible: _"Is whoever contributed towards the fit-out connected to you?"_ |
|  **Which way the money moves** |  **BIGGER** where the contributor is connected. An **unconnected** contribution is still deducted. |
|  **What we are asking you to do** |  Confirm, amend or reject. The director's answer to this was _"use your understanding"_, which we have not treated as an answer. |
|  **If you confirm** |  One-line switch, plus the new question, plus a built-in flag requiring confirmation that **the contributor is not also claiming**. |
|  **If you reject** |  Nothing changes. |
|  **What it unblocks** |  Group-owned and pension-fund-owned healthcare property, which is a large part of the care-home market. |
|  **Do not couple this with ACC-A8** |  See the note there. |

```
SIGN-OFF        Confirmed  /  Amended  /  Rejected      (delete two)

Your amendment or reasoning:
.....................................................................
.....................................................................
.....................................................................

Signed .............................  Date ..........................
```

 Added 15 September 2026 by Phase 132. Two things have changed. First, with the switch on, the software now says the connected-contributor exception does not apply to the structures and buildings allowance, and asks for confirmation that the contributor is not a public body. Second, a correction to "Today we deduct every contribution, whoever made it": supported living has never deducted a landlord's contribution. It now has a switch of its own that would, built and off. That switch can only make a claim smaller, and it waits on the order in which a landlord's contribution comes off against the common-parts share. Please confirm the structures and buildings allowance point and the public-body check, and tell us whether, and in what order, a landlord's contribution comes off in supported living.

---

### ACC-A10 · Does "expenditure on the provision of" plant reach installation and commissioning?

|  **What it is** |  Case law widened "expenditure on the provision of" plant. On that reading, **installing and commissioning an item is expenditure on the provision of the item itself** and qualifies in its own right. Today that spend reaches a claim only through the building-alterations route, and only where the client can tie it to a named parent element — which a commissioning invoice rarely does, so it is dropped. |
| --- | --- |
|  **What state it is in** |  **Built and tested, switched off.** One new client question is built and invisible: _"Of that spend, how much went on getting the equipment installed, wired and commissioned rather than on the equipment itself?"_ |
|  **Which way the money moves** |  **BIGGER.** Commissioning spend enters the claim. **It is de-duplicated against any building-alteration line for the same pound**, so the same money is never counted twice. |
|  **What we are asking you to do** |  Confirm, amend or reject. The director agreed with our reading — _"it will cover both the item and journey of the item"_ — but **did not separate installation labour, commissioning and builder's work, which may not travel together.** Please tell us whether they do. |
|  **If you confirm** |  One-line switch, plus the new question. |
|  **If you reject** |  Nothing changes. |
|  **What it unblocks** |  A category of spend clients routinely have invoices for and currently get no relief on. |

```
SIGN-OFF        Confirmed  /  Amended  /  Rejected      (delete two)

Do installation labour, commissioning and builder's work travel together?

Your amendment or reasoning:
.....................................................................
.....................................................................
.....................................................................

Signed .............................  Date ..........................
```

---

### ACC-A11 · A flat held for the purposes of the trade

> This one is in the review pack at Section D too, and missing from the shorter questions document for the same reason.
>  See Appendix 1.

|  **What it is** |  The dwelling-house restriction arguably does not reach a trade or profession. On that reading, **a practitioner's or manager's flat held for the purposes of the trade is not caught by the restriction at all**. Today we strip the residential fraction out regardless of why it is there. |
| --- | --- |
|  **What state it is in** |  **Built and tested, switched off.** One new client question is built and invisible: _"What is the residential part used for?"_ Since 15 September 2026 the switch table records that the Tevfik decision, read in full in Rulebook E, is consistent with the live reading; the switch stays off.
 |
|  **Which way the money moves** |  **A DIFFERENT BASIS, usually bigger.** A trade-purpose flat stays in the base. **A flat LET to a third party still comes out, on its own footing** — the switch does not make every residential part claimable. |
|  **Scope** |  Dental, GP and private hospitals. **Care homes are deliberately not touched**: their dwelling factor turns on a letting, which is a different question. |
|  **What we are asking you to do** |  Confirm, amend or reject. |
|  **If you confirm** |  One-line switch, plus the new question. |
|  **If you reject** |  Nothing changes. |
|  **What it unblocks** |  The flat over the practice — common in dental and GP premises, and currently written out of every one of those claims. |

```
SIGN-OFF        Confirmed  /  Amended  /  Rejected      (delete two)

Your amendment or reasoning:
.....................................................................
.....................................................................
.....................................................................

Signed .............................  Date ..........................
```

---

### ACC-A14 · A new lease for a premium with no joint election — is it item 9 of the disposal table, and is a section 198 election available at all?

> Added 13 September 2026. Found on 12 September 2026 while checking a gloss in our own rulebook against the Act. It is numbered ACC-A14 because ACC-A12 and ACC-A13 were already numbered, and it sits after ACC-A11 because it is about elections rather than grants or homes. Money moves either way on it: it can make one client's figure smaller and another's bigger.

|  What it is |  Item 9 of the section 196 Table is, in the Act's words, "Permanent discontinuance of the qualifying activity followed by the sale of the qualifying interest", and section 198(1) reaches only items 1 and 9 — both sales. Our software, and until 13 September 2026 our elections rulebook, treated a tenant who pays a premium for a new lease with no joint section 183 election as item 9, and so told them a section 198 election was available. That reading comes from HMRC's manual at CA26800, which says an election is available in that case but names no Table item. A worked example: a landlord grants a 125-year lease of a care home for a £1,200,000 premium at market value, and no joint election is made. Today we call that item 9, run the two-year clock from the grant, and offer a section 198 election. On the section text, no Table item seems to be triggered by the grant, and section 198 does not seem to be available. |
| --- | --- |
|  What state it is in |  Built and tested, switched off. Off is today's reading. On, a lease premium with no joint election is "not established" wherever the software works out a Table item — for the earlier owner's disposal and for the client's own lease — and you are named as the person who settles it. It asks the client nothing new. Our elections rulebook, Rulebook C, is corrected to the Table: row E1, row E-A2 split into E-A2 and E-A2b, and the field row that called the joint election the difference between items 5 and 9. |
|  Which way the money moves |  EITHER WAY. Where the two-year window is still open, a claim that is live today becomes unresolved with the bottom of the range at nil — smaller. Where a client holds a complete election made under section 199 on those facts, today we call it the wrong section; on the switch we do not, and it is sized at its elected figure — bigger once the window has closed. |
|  What we are asking you to do |  Answer the question already in CAPREBATE QUESTIONS under your name: "When a landlord grants a new lease for a premium and no joint election is made, which item of the disposal table applies — and is a section 198 election available at all?" Three parts: is item 9 ever a lease premium; which Table item applies on those facts, if any; and is a section 198 election available, and under what provision. |
|  If you agree the lease case is not item 9 |  One-line switch. The two "not sure whether a joint election was made" flags change with it, and nothing else needs building. |
|  If you tell us CA26800's lease case rests on a provision we have missed |  The switch stays off. We name that provision in Rulebook C and in the software's wording, so the route we offer rests on the Act rather than on the manual alone. |
|  What it unblocks |  Which statutory route we offer a tenant who paid a premium for a new lease, which date starts the two-year clock on those facts, and two rows of our elections rulebook. |

```
SIGN-OFF        Confirmed  /  Amended  /  Rejected      (delete two)

(a) Is item 9 of the s.196 Table ever a lease premium?        Yes / No
(b) Which Table item applies, if any?     ...........................
(c) Is a s.198 election available, and under what provision?
    .................................................................

Your amendment or reasoning:
.....................................................................
.....................................................................

Signed .............................  Date ..........................
```

 **Added 16 September 2026 by Phase 132e — the unsigned text under this entry's question, quoted.** Nobody signed it and it is not a tax adviser's answer. It sits here, beside the entry, for you to confirm, correct or strike out. Nothing in this entry changes state and no switch is turned on.

 **Unsigned draft, not a professional's answer — confirm or correct:** typed into the answer box under “When a landlord grants a new lease for a premium and no joint election is made, which item of the disposal table applies — and is a section 198 election available at all?” in CAPREBATE QUESTIONS, unsigned and undated. Quoted exactly as typed; only the box's own dotted leader, where it ran on at the start or end of a line, is left out. It moves no switch and no figure.

```
(a) Is item 9 of the s.196 Table ever a lease premium?          Yes / No - No
(b) On a new lease granted for a premium with no joint s.183
    election, which Table item applies, if any?    Do not assign item 9. The applicable statutory route needs to be
confirmed against the incoming-lessee provisions (particularly s.183/s.184) and HMRC's CA26800 guidance
(c) Is a s.198 election available on those facts, and under
    what provision?         HMRC guidance says yes, but the precise statutory route should be confirmed by the
 qualified tax adviser before the software is switched on.
```

---

### ACC-A15 · When the money was spent after the year end a client gives us, can we roll that year end forward to find the return the claim belongs in?

> Added 13 September 2026. Found by Phase 129a while building the item-9 correction, and built by Phase 129b the same day. It is numbered ACC-A15 because ACC-A14 was the last number, and it sits here, after ACC-A14, because it is about timing rather than grants, homes or elections. It can only make a claim bigger, and only where a client's own dates do not sit together.

|  What it is |  Whether a claim can still reach a refund depends on whether the tax return for the year the money was spent in can still be amended. That is Rulebook A, section 4: the annual investment allowance and first-year allowances are made for the period in which the expenditure is incurred. Until 13 September 2026 our software worked the deadline out from the accounting year end the client gave, however long before it the money was spent. A worked example: year end given 31 March 2026, purchase completed 1 June 2021. Worked from the year end given, the return is open until 31 March 2028 and the client was offered a refund route. Worked for the year the money was spent in — the year to 31 March 2022 — the return closed on 31 March 2024. |
| --- | --- |
|  What state it is in |  Built and tested. The year of spend is found by rolling the year end given to the first year end on or after the completion date, on the same day and month. Where that year ends before the year end given, it is used, live, because that can only close a window. Where the money was spent after the year end given, the year end given still decides, and rolling it forward sits behind a switch that is off. It asks the client nothing new. The client is told which year the window was worked out for, and that it assumes twelve-month accounting years that kept the same year end. |
|  Which way the money moves |  BIGGER, and only on the switch. On, a client who gave a year end long before the money was spent can be shown a refund route. Example: year end given 31 March 2019, completion 1 June 2025 — out of time since 31 March 2021 on the year end given, but in time until 31 March 2028 for the year to 31 March 2026. The relief is the same either way; what changes is whether it can come back as cash for an earlier year. |
|  What we are asking you to do |  Answer the question already in CAPREBATE QUESTIONS under your name: "When the money was spent after the accounting year end a client gives us, can we roll that year end forward to find the return the claim belongs in?" And, because the live half rests on the same reading of section 4, tell us if you think the period of expenditure is not the one an amendment has to reach. |
|  If you agree we may roll it forward |  One-line switch. Nothing else needs building. |
|  If you would rather the client confirmed their year end first |  The switch stays off, and we add a confirmation question for that one case. |
|  What it unblocks |  Whether a client who spent the money after the year end they gave us is shown a refund route — the one remaining half of the amendment-window correction. |

```
SIGN-OFF        Confirmed  /  Amended  /  Rejected      (delete two)

(a) Is the amendment window the one for the period of expenditure?   Yes / No
(b) Where the money was spent after the year end given, may the
    year end be rolled forward to find that period?
    Yes  /  No  /  Only once the client has confirmed it

Your amendment or reasoning:
.....................................................................
.....................................................................

Signed .............................  Date ..........................
```

 **Added 16 September 2026 by Phase 132e — the unsigned text under this entry's question, quoted.** Nobody signed it and it is not a tax adviser's answer. It sits here, beside the entry, for you to confirm, correct or strike out. Nothing in this entry changes state and no switch is turned on.

 **Unsigned draft, not a professional's answer — confirm or correct:** typed into the answer box under “When the money was spent after the accounting year end a client gives us, can we roll that year end forward to find the return the claim belongs in?” in CAPREBATE QUESTIONS, unsigned and undated. Quoted exactly as typed; only the box's own dotted leader, where it ran on at the start or end of a line, is left out. It moves no switch and no figure.

```
Roll the year end forward
```

### ACC-A16 · When a grant's papers say which items it paid for, should it come off only those items?

> Added 4 October 2026 by Phase 153a. It is numbered ACC-A16 because ACC-A15 was the last number, and it sits here, after ACC-A15, because it is the item-by-item half of the grant question ACC-A8 asks for supported living. Money moves either way on it: a grant that paid for qualifying items takes more off than an equal share would, and a grant that paid only for items that never qualify takes nothing off.

|  What it is |  Section 532 reduces spend "to the extent that" someone else met it, and Rulebook F's rule F3 says to trace a grant to the items it paid for before sharing anything out. Until 4 October 2026 nothing in our software could: a grant on a claim was matched to its items in words only. Now each grant on the claim record can name the rows of our fixture list it paid for (the electrics, the fire alarm, the nurse call), and the survey pack — the surveyor's working file for a claim — takes the claim's grants off its figures in a new chapter, "Grants and VAT". A worked example: price paid £1,000,000, land £200,000, so the building is £800,000; £120,000 of it qualifies (£40,000 for the fire alarm in the main pool, £80,000 for the electrics in the special rate pool); the NHS paid £40,000 towards the fire alarm. |
| --- | --- |
|  What state it is in |  Built and tested both ways. Off, as it ships, every grant comes off every item in equal share — the grant as a share of the price paid, which is how our online estimate has always treated a grant: £40,000 on £1,000,000 is 4%, so £115,200 qualifies. On, a grant matched to rows of the list comes off only those rows: the fire alarm's £40,000 was met in full, so £80,000 qualifies, all of it in the special rate pool. A grant matched only in words, or not at all, keeps the equal share — we never treat an unknown trace as having paid for nothing. Insurance money after damage is not taken off either way. A grant whose amount is not known gives no figure at all until it is known. The online estimate does not change either way: it holds no item-by-item spend. |
|  Which way the money moves |  EITHER WAY, and only on the switch. In the example, on takes £40,000 off where off takes £4,800. A grant that paid only for the flats or the walls, which never qualify, takes nothing off when on, where off takes its share. |
|  What we are asking you to do |  Answer the question in the Word questions document under your name: "When a grant's papers say which items it paid for, should it come off only those items?" And tell us if a grant matched to several items should be shared between them by their rebuild cost, which is what we built, or in some other way. |
|  If you agree |  One-line switch. Nothing else needs building. |
|  If you do not |  The switch stays off and every grant keeps the equal share. Before any claim moves on, the gate already asks for the grant papers or your view on the split (built the same day, for the question "How should we split a grant when we cannot tell what it paid for?"). |
|  What it unblocks |  Whether a grant reduces only what it paid for, in every sector — and with it the supported-living case in ACC-A8, where most of a grant bought flats that never qualify. |

```
SIGN-OFF        Confirmed  /  Amended  /  Rejected      (delete two)

(a) Does a grant traced to named items reduce only those items'
    qualifying spend?                                     Yes / No
(b) Where it paid for several items, may it be shared between them
    by their rebuild cost?        Yes  /  No  /  Another basis: ........

Your amendment or reasoning:
.....................................................................
.....................................................................

Signed .............................  Date ..........................
```

---

### ACC-A17 · An election with no tax references, once the window has closed — a fixable slip, or no election?

> Added 4 October 2026 by Phase 153b, on our recommendation for you to check (Word question 95, "Does a missing tax reference make an election invalid, or can it be fixed?"). Lakhbir's typed view is that it is a fixable administrative error; that is his view, not a sign-off.

|  What it is |  Section 201(3)(f) asks for both parties' tax references. Older elections often have none. Today our software treats a document without them as no election at all: inside the two-year window we tell the client to remake it; once the window has closed, the fixtures are nil. Worked example: an election from 2019 names both parties, the building, the items and £80,000, but no tax references. Today, outside the window: nil. |
| --- | --- |
|  What state it is in |  Built and tested both ways, switched off (`election_missing_utr_fixable`). On: where the tax references are the only thing missing and the window is known to have closed, the election stands at its figure — £80,000 — and is flagged as a slip to put right with HMRC. Inside the window, and where the window is not known, nothing changes. Anything else missing still fails it. |
|  Which way the money moves |  BIGGER — nil becomes the elected figure (counted in code). |
|  What we are asking you to do |  Answer question 95 in the Word questions document: count it if everything else is in order and the parties and value can be identified? |
|  If you agree |  One-line switch. |
|  If you do not |  The switch stays off: today's strict reading. |

```
SIGN-OFF        Confirmed  /  Amended  /  Rejected      (delete two)
Your amendment or reasoning: .........................................
Signed .............................  Date ..........................
```

---

### ACC-A18 · An election made under the wrong section — valid if it meets every rule of the right one?

> Added 4 October 2026 by Phase 153b, on our recommendation for you to check (Word question 96, "Is an election made under the wrong section of the law still valid?"). Lakhbir's typed view is that a wrong label does not by itself make it invalid; that is his view, not a sign-off.

|  What it is |  Many elections carry the wrong label, because of the market shorthand "section 198 for a freehold, 199 for a lease". Today a complete election under the wrong label is sent to be remade inside the window and left unresolved — bottom of the range nil — outside it. Worked example: a freehold sale, an election labelled section 199 that has everything section 198 needs, at £60,000; window closed. Today: unresolved, nil at the bottom. |
| --- | --- |
|  What state it is in |  Built and tested both ways, switched off (`election_wrong_section_accepted`). On: where the window is known to have closed, it is read under the section the facts require and the label treated as a slip; the claim on those fixtures is the elected figure. Inside the window, and where it is not known, nothing changes. |
|  Which way the money moves |  EITHER WAY — the range narrows to the elected figure: the bottom rises from nil, and the top comes down to it, because a valid election caps the fixtures it covers (counted in code). |
|  What we are asking you to do |  Answer question 96. |
|  If you agree |  One-line switch. |
|  If you do not |  The switch stays off. |

```
SIGN-OFF        Confirmed  /  Amended  /  Rejected      (delete two)
Your amendment or reasoning: .........................................
Signed .............................  Date ..........................
```

---

### ACC-A19 · An election that sets too high a value from the start — cut down to the most the law allows?

> Added 4 October 2026 by Phase 153b, on our recommendation for you to check (Word question 98, "What happens if an election sets too high a value from the start?"). Lakhbir's typed view: not void, limited to the permitted amount; that is his view, not a sign-off.

|  What it is |  Section 198(3) says the amount fixed may not exceed the smaller of what the seller could bring in as a disposal value (never more than their own cost, s.62) and the price paid. The law covers a maximum that falls later (s.200); it is silent on a figure too high from the start. Today our software caps the claim at whatever the election states. Worked example: the election says £300,000; the seller's own cost of those fixtures was £250,000. |
| --- | --- |
|  What state it is in |  Built and tested both ways, switched off (`election_value_cut_to_lawful_max`). On: a new question asks what the seller paid for the fixtures; the figure is cut to the lower of that and the price paid where each is known — £250,000 in the example — and the client is told why. A limit not known cuts nothing and is flagged as not checked. The survey pack's legal check caps the pack at the cut figure and says so. |
|  Which way the money moves |  SMALLER (counted in code). |
|  What we are asking you to do |  Answer question 98: still effective but cut down, rather than void or effective as written? |
|  If you agree |  One-line switch. |
|  If you do not |  The switch stays off: the figure the election states. |

```
SIGN-OFF        Confirmed  /  Amended  /  Rejected      (delete two)
Your amendment or reasoning: .........................................
Signed .............................  Date ..........................
```

---

### ACC-A20 · Is a private housing association a public body for the grants rule?

> Added 4 October 2026 by Phase 153b, on our recommendation for you to check (Word question 108, "Is a private social housing provider a public body for tax relief rules?"). Lakhbir's typed view: not a public body just because it is registered; that is his view, not a sign-off.

|  What it is |  Money from a public body always comes off a claim (s.532); a private payment that gets the payer no tax relief can stay in (s.536). The supported-living funding question offers "a grant or public subsidy" and "a private payment with no relief", but nothing for a housing association, so its money is usually taken off like a grant. Worked example: a housing association pays £80,000 towards the shared-area works and gets no relief on it. As a public body: £80,000 comes off. As a private body: it stays in. |
| --- | --- |
|  What state it is in |  Built and tested both ways, switched off (`registered_provider_not_public_body`). On: the question also offers "A housing association or registered provider of social housing"; it is treated as not a public body, so its payment stays in, and a flag says to check the provider is not itself a public body and got no tax relief. Off: the answer is not offered. |
|  Which way the money moves |  BIGGER (counted in code, against the same client answering "a grant or public subsidy" with the switch off). |
|  What we are asking you to do |  Answer question 108. |
|  If you agree |  One-line switch. |
|  If you do not |  The switch stays off. |

```
SIGN-OFF        Confirmed  /  Amended  /  Rejected      (delete two)
Your amendment or reasoning: .........................................
Signed .............................  Date ..........................
```

---

### Section A — the summary you can work from

|   |  What it changes |  Direction |  Built? |
| --- | --- | --- | --- |
|  ACC-A1 |  Stamp duty in the apportionable figure |  Bigger — about 4-5% of EVERY purchase claim |  Yes, off (both parts, each on its own switch) |
|  ACC-A2 |  High-care supported living outside the "home" restriction |  Bigger — up to 4x in that sector |  Yes, off |
|  ACC-A3 |  Buyer's own alterations on top of an agreed figure |  Bigger — largest single point |  Yes, off |
|  ACC-A4 |  Ceilings where entitlement came only via a contribution |  Bigger — ceilings come off |  Yes, off |
|  ACC-A5 |  The third route to fixing the value, with no deadline |  Bigger — live claim vs none |  Yes, off |
|  ACC-A6 |  Fixed value requirement where the past owner never claimed |  Bigger — requirement disapplied |  Yes, off |
|  ACC-A7 |  A seller who was never entitled to claim |  Removes false negatives |  Yes, off |
|  ACC-A8 |  A scheme-wide grant deducted twice |  Bigger — and live-ready |  Yes, off |
|  ACC-A9 |  A connected contributor |  Bigger where connected |  Yes, off |
|  ACC-A10 |  Installation and commissioning as provision |  Bigger |  Yes, off |
|  ACC-A11 |  A flat held for the purposes of the trade |  Different basis, usually bigger |  Yes, off |
|  ACC-A12 |  A grant taken off after the ceilings |  Smaller — only where a ceiling binds |  Yes, off |
|  ACC-A13 |  "Roughly break-even" read as not enough taxable profit |  More cautious — never a better-looking claim |  Yes, off |
|  ACC-A14 |  A new lease for a premium with no joint election, not item 9 of the disposal table |  Either way |  Yes, off |
|  ACC-A15 |  The amendment window where the money was spent after the year end the client gave |  Bigger — only where the client's dates do not sit together |  Yes, off (the other half is live, because it can only close a window) |
|  ACC-A16 |  A grant matched to the items it paid for comes off only those items |  Either way |  Yes, off |
|  ACC-A17 |  An election with no tax references stands, once the window has closed |  Bigger |  Yes, off (added 4 Oct 2026) |
|  ACC-A18 |  An election under the wrong section is read under the right one, once the window has closed |  Either way — the range narrows to the elected figure |  Yes, off (added 4 Oct 2026) |
|  ACC-A19 |  An elected figure above the law's limit is cut down to it |  Smaller |  Yes, off (added 4 Oct 2026) |
|  ACC-A20 |  A housing association's payment in supported living is not a public body's |  Bigger |  Yes, off (added 4 Oct 2026) |

 **Answer ACC-A4 with ACC-A7. Do not couple ACC-A8 with ACC-A9, and read ACC-A12 beside ACC-A8.** In the table above, ACC-A1 to ACC-A6 and ACC-A8 to ACC-A10 make claims bigger; ACC-A11 changes the basis; ACC-A7 removes false negatives; ACC-A12 can only make a claim smaller; ACC-A13 can only make one more cautious; ACC-A14 moves money either way; ACC-A15 can only make a claim bigger, and only on its switch; and ACC-A16, added 4 October 2026, moves money either way. Until 13 September 2026 this sentence counted nine of twelve, and said ACC-A12 had no row because a row cannot be added to a table here. The table has since been replaced whole, with every earlier row carried word for word and rows for ACC-A12, ACC-A13 and ACC-A14 added — and replaced whole again on 13 September 2026 by Phase 129b, carrying ACC-A1 to ACC-A14 word for word and adding a row for ACC-A15. **A firm that only ever finds arguments in its own favour is a firm to be suspicious of, and we know that** — which is why the direction is printed here rather than left for you to notice.

 **Counted in code, 4 October 2026 (Phase 153b).** Each of the twenty-nine engine switches switched on alone against all off, on the same cases (03-app/caprebate-switch-direction.cjs; how, in the note at the top of this register). Where a row above says otherwise, this is what the engine does: **bigger** — ACC-A1 (both switches), ACC-A2, ACC-A3, ACC-A4, ACC-A5, ACC-A7, ACC-A9, ACC-A10, ACC-A11, ACC-A15, ACC-A17, ACC-A20, the repairs aggregation and a partnership's later company deadline (Rulebooks G and A, Section B), the shared lounge (ACC-D3.1) and the purchase clock (ACC-D3.2); **smaller** — ACC-A12, ACC-A19, the flats reading (ACC-D2) and supported living's landlord contribution (with ACC-A9's item); **either way** — ACC-A8, ACC-A14, ACC-A18, and from Rulebook I the Scottish rate band, the corporation tax rate from associated companies and the 60% band; **only in the surveyor's working file** — ACC-A6 (bigger there) and ACC-A16 (either way). ACC-A13 is a funnel switch, outside the twenty-nine.


---

## Section B — the eleven rulebooks

 **What they are.** Eleven statutory rulebooks covering the law we rely on, written from the statute and HMRC's published manuals, with the sources cited throughout and read in full rather than relied on through commentary. They are the foundation everything else stands on.

 **What state they are all in.** **Complete drafts, awaiting review.** None has been reviewed by a chartered tax adviser. Nine of the eleven carry their own list of open questions; **all of those questions are collected in the review pack at Section D**, one per line.

 **What we are asking you to do, for all eleven.** **Read them and tell us where we are wrong.** We are not asking you to write them. If a rulebook is right, say so and we stop treating it as provisional. If it is wrong, mark it up.

 **If you confirm one:** it stops being a draft, and the engine behaviour that rests on it stops carrying a "pending review" caveat in client documents. **If you reject or amend one:** we rewrite it and re-run the tests that depend on it, and any client-facing wording that rests on it changes with it.

 **Each rulebook has one sign-off line, at the end of this section.** They are homogeneous enough that eleven separate blocks would be noise.

|   |  Rulebook |  What it covers |  The thing in it most worth your eye |
| --- | --- | --- | --- |
|  **ACC-B1**
 |  **A — claim timing and windows** |  Which return is open, which amendment window applies, when a claim can still be made and when it cannot |  Whether we are stopping some clients too early. There is a whole class of purchase we currently turn away at the door. And, for a partnership, whether twelve months after the filing date really is the last day to reopen a past year: for a partnership of individuals nothing earlier than 2024-25 is still open, and that year closes on 31 January 2027
 |
|  **ACC-B2** |  **A, addendum — the two-year fixed-value window** |  The two-year period for fixing the value between buyer and seller, and what survives its closure |  **Whose purchase starts the clock** — our client's, or an earlier one. If it is the earlier one, a class of acquisitions arrives already dead, before our client did anything at all, and we have to say so in the first conversation rather than after taking a fee |
|  **ACC-B3** |  **B — who is entitled to claim** |  Entitlement, written as a truth table rather than as prose, so every branch is visible |  How far back diligence on the ownership chain reasonably goes before the position is treated as unestablishable. We need a **written stopping point** and we do not have one |
|  **ACC-B4** |  **C — elections between buyer and seller** |  Section 198 and 199 elections: form, content, validity, and what happens when one is defective |  **An election that was excessive at the outset.** The statute covers only later reductions. Void, reduced to the ceiling, or effective as to the permitted amount — the three readings give a full claim, a reduced claim, and nil |
|  **ACC-B5** |  **D — what qualifies as plant** |  The statutory lists, the integral-features rules, and how they apply in clinical buildings |  **The scope of "an electrical system" in a healthcare building** — this is the lowest-confidence item in the whole rulebook set, and it is a large number |
|  **ACC-B6** |  **E — the dwelling-house rule and the residential carve-out** |  Where the restriction bites, and what is a common part rather than part of a dwelling |  **A shared lounge where the flats are genuinely self-contained.** Our own notes call the wider version of this the single biggest risk in a care-home claim, and record that we have not decided it. We are not going to decide it. The Hora Tevfik decision, now read in full, was about houses in multiple occupation and does not decide it either
 |
|  **ACC-B7** |  **F — contributions and grants** |  Grants, landlord contributions, NHS and social-housing funding, and how they reduce a claim |  Whether a private registered provider of social housing is a public body for these purposes. **Supported living turns on it** |
|  **ACC-B8** |  **G — repairs versus capital** |  The revenue/capital boundary applied to our five sectors |  It matters in both directions and we say so: calling capital a repair is an over-claim with penalty exposure; calling a repair capital defers relief for years and may lose it on a sale |
|  **ACC-B9** |  **H — land remediation relief** |  The relief, its gateway conditions, and who can actually claim it |  **It is a corporation tax relief only** — an unincorporated GP or dental partnership gets nothing. Rulebook H was corrected on 14 September 2026 where it described the relief too generously: the tax credit's limits and one-year claim deadline, work a local authority notice requires, and the narrow derelict-land route for a conversion. Every correction narrows the relief. And Rulebook H reaches a conclusion on how the relief interacts with the dwelling-house rules **with no authority either way**, which is exactly the kind of finding we want challenged
 |
|  **ACC-B10** |  **I — the rates and reliefs table** |  The single source of truth for every rate the system asserts. Rulebooks A to D deliberately state no rates at all |  Every figure was fetched from a live primary source on the day it was written and cited to it; nothing is asserted from memory. On 14 September 2026 it gained the Class 4 National Insurance rates, the cap on reliefs against general income and the payments-on-account rules, each read from a primary source on 13 September; one carve-out in that cap is recorded but not applied until you confirm it. **Rulebook I also records that rate material elsewhere in our own system is out of date against it.** Please confirm the table, because five other documents were deliberately emptied so that this one could be authoritative
 |
|  **ACC-B11** |  **I, addendum — Scottish rates** |  Scottish income tax rates, held separately |  **No Scottish figure may be quoted anywhere in the system until this is reviewed**, and that restriction is enforced rather than merely stated |

 Added 15 September 2026 by Phase 132, for Rulebook G. The rule in section 33B(4) that adds together spending on one integral feature within twelve months, so that repairs can together count as a replacement, is now built behind a switch, off. On, it makes claims bigger. It waits on Rulebook G's own questions about that rule, and those are what we ask you to answer before it is considered.

 Added 15 September 2026 by Phase 132, for Rulebook I. Two readings are now built behind switches, both off, and each can move money either way. The corporation tax marginal rate is worked out from the number of associated companies and the profits, and an unknown count is never read as nought. The 60% band where the personal allowance is withdrawn, from £100,000 to £125,140, is applied, and a "not sure" keeps today's top rate. Two readings that were already built are confirmed rather than changed: the writing-down allowance that depends on the date, and the 26.5% marginal rate. Please confirm both new readings when you confirm the Rulebook I table.

> One process point, and it is a real one.
>  Rulebooks G, H and I each log open questions of their own — roughly eighteen between them — and 
> those questions are not in the review pack at Section D.
>  The review pack covers rulebooks A to F. Whether G, H and I are inside this engagement or are a second, later piece of work is 
> a scoping decision nobody has taken
> , and it should be settled with you before a fee is agreed rather than discovered halfway through.

```
SIGN-OFF - SECTION B, THE ELEVEN RULEBOOKS

Mark each one:  C = confirmed   A = amended   R = rejected   - = not reached

  A ....   A addendum ....   B ....   C ....   D ....   E ....   F ....
  G ....   H ....   I ....   I addendum ....

Are G, H and I inside this engagement?      Yes  /  No  /  Separately quoted

Your amendments (or "marked up on the documents themselves"):
.....................................................................
.....................................................................
.....................................................................

Signed .............................  Date ..........................
```

> A housekeeping note for whoever maintains this register, not for you.
>  One rulebook document, the A addendum, is held on a separate file-carrier record that exists only to hold the attachment; the six carriers for A to F were closed on 12 September 2026 because each rulebook's own record now carries an identical copy. 
> It carries no separate question and needs no separate signature: it follows the sign-off of the rulebook it carries.
>  It is named here so that nothing on our board is left without a home.

---

## Section C — the documents a client or their accountant actually receives

 **These are the four client-facing and filing-facing outputs.** They contain no new law: they present what the rulebooks and the engine produce. What we need from you is whether they **say it correctly and safely**. **Corrected 15 September 2026:** Section C now holds twelve entries — these four, ACC-C1 to ACC-C4, and eight added since, ACC-C5 to ACC-C12, each declared in its own note in this register because a row cannot be added to the table.


---

### ACC-C1 · The client report — headline figure, cash position, forward schedule

|  **What it is** |  The plain-English report the client reads. The headline allowances figure and the indicative lifetime saving at their marginal rate, the immediate cash position, and a forward schedule. **It does not contain the detailed valuation** and points to the accountant report for it. |
| --- | --- |
|  **What state it is in** |  **Complete draft, awaiting review.** Conservative in tone, every figure marked indicative. |
|  **What we are asking you to do** |  Confirm it is safe to put in front of a lay client — or mark up what is not. Particularly: **is the distinction we draw between allowances and cash properly drawn?** |
|  **The house rule you are being asked to check** |  **The word "refund" is restricted.** Relief is one thing; cash is another. We allow "refund", "reclaim" and "money back" **only** where the claim produces an actual HMRC repayment — an amendment to an already-filed return, or a loss carried back. Where the claim simply reduces a bill that has not been paid yet, or where relief comes through ordinary writing-down allowances, **no refund language is permitted anywhere.** The route is derived from the client's own acquisition date and accounting period rather than asked as a question, and the report copy keys off it automatically. **We are strict about this because a client told they are getting money back who then gets a smaller bill eighteen months later has been mis-sold, whatever the small print said.** |
|  **The one edge case we cannot resolve ourselves** |  **An individual whose payments on account are adjusted downwards does receive money back from HMRC**, even on a route our house rule classes as no-refund. The rule as written does not cleanly cover it. Until you settle it we treat that route as no-refund and describe the payments-on-account effect in its own words. **Please tell us whether that is right.** |
|  **If you confirm** |  The report goes into service and the caveat comes off. |
|  **If you reject** |  We rewrite the wording; no arithmetic changes. |
|  **What it unblocks** |  Everything a client sees. Nothing goes to a client until this is signed. |

```
SIGN-OFF        Confirmed  /  Amended  /  Rejected      (delete two)

The payments-on-account edge case - is our handling right?

Your amendment or reasoning:
.....................................................................
.....................................................................

Signed .............................  Date ..........................
```

---

### ACC-C2 · The tax implication summary — which route the relief actually takes

|  **What it is** |  The technical summary that goes to whoever files: pool additions, the annual investment allowance and writing-down movements year by year, the profit or loss effect, the loss reconciliation, the payments-on-account adjustment for individuals and partnerships, the corporation tax effect for companies, **and a clear statement of which return entries change and for which years**. Produced in the variant matching the claimant type. |
| --- | --- |
|  **What state it is in** |  **Complete draft, awaiting review.** The sole-trader and partnership variants are finished; **the route variants — repayment versus reduced liability — are the part awaiting you.** |
|  **What we are asking you to do** |  Confirm that our reading of the four routes is right, that the mechanics we carry are the right mechanics, and that the banned-vocabulary list attached to the no-refund routes is neither too tight nor too loose. |
|  **If you confirm** |  It goes into service. |
|  **If you reject** |  We rewrite it. No engine change. |
|  **What it unblocks** |  The document that makes the referral channel work at all. **An accountant who cannot see immediately which return entries change will not use us twice.** |

```
SIGN-OFF        Confirmed  /  Amended  /  Rejected      (delete two)

Your amendment or reasoning:
.....................................................................
.....................................................................

Signed .............................  Date ..........................
```

---

### ACC-C3 · The disposal note — the election the client signs on a future sale

|  **What it is** |  A drafted election position for the client's **future** sale, handed over at the end of the job: the six statutory content requirements, the two-year limit, and the fact that an election is **irrevocable with no correction route**. |
| --- | --- |
|  **What state it is in** |  **Complete draft, awaiting review.** |
|  **What we are asking you to do** |  Confirm the position and the wording. **This is a document that will be acted on years after we have gone, by someone who may never have spoken to us.** |
|  **If you confirm** |  It goes into the standard pack. |
|  **If you reject** |  We rewrite it. |
|  **What it unblocks** |  Whether we hand a client anything at all about their future sale — and if we do not, a client who claims through us and then sells badly has been left worse off by us than if we had never been there. |

```
SIGN-OFF        Confirmed  /  Amended  /  Rejected      (delete two)

Your amendment or reasoning:
.....................................................................
.....................................................................

Signed .............................  Date ..........................
```

---

### ACC-C4 · The defence pack — the evidence set, sealed at claim close

|  **What it is** |  Generated automatically when a claim closes and stored so it cannot be altered afterwards: the evidence set exactly as it stood on the day, for an enquiry years later. Built to be **verifiable by an outsider** rather than by us. |
| --- | --- |
|  **What state it is in** |  **Complete draft, awaiting review.** The generation mechanism is specified; the pack's contents are what need your eye. |
|  **What we are asking you to do** |  Tell us **whether this would actually survive an enquiry** — what an inspector would ask for that is not in it, and what is in it that should not be. |
|  **If you confirm** |  It becomes the standard close-out artefact. |
|  **If you reject** |  We change what goes into it, which is a specification change rather than a rewrite. |
|  **What it unblocks** |  The client's position years after we have been paid, which is where the reputational risk in this sector actually sits. |

```
SIGN-OFF        Confirmed  /  Amended  /  Rejected      (delete two)

What would an inspector ask for that is not in it?

Your amendment or reasoning:
.....................................................................
.....................................................................

Signed .............................  Date ..........................
```

 Added 15 September 2026 by Phase 132. The row above that says the generation mechanism is specified is out of date: the generator is now built, on the stamp every issued deliverable carries, and it is switched off. It waits on your sign-off of the Defence Pack Template, and nothing is generated for any claim until then. Please read the template with the question in the block above in mind.

---

## Section D — the review pack, and one thing we are telling you before you find it

---

### ACC-D1 · The review pack — every open question, one per line

 **Corrected 28 September 2026 (Phase 153) — the counts in the table below are from 13 September and are now out of date.** Rulebook I, the table of tax rates behind every relief figure, joined this review with its seven questions (decided on Lakhbir's answer read 15 September, added to the pack on 16 September; Word question 50, closed 24 September). Re-derived in code from the tracker today: **fifty-three questions recorded — forty-nine open, two recorded as answered, two superseded — so fifty-one are put to you: fifteen blockers, twenty-eight high and eight standard** (the one unrated line is one of the two superseded). The three-day estimate for your first review (Word question 7, closed) was set when the pack held forty-six; it stands, with the note that complicated property structures may need more time. The hiring documents now carry the same correction.

|  **What it is** |  **Forty-six questions**, each one a separate tracked line with its own answer state, drawn from rulebooks A to F. Each carries the statutory citation trail behind it and where it lands in the engine. **This is the actual scope of the fixed-fee review.** |
| --- | --- |
|  **What state it is in** |  Counted from the board on 13 September 2026: **forty-two open, two recorded as answered — from our own reading of the statute, and we would still like those two confirmed — and two superseded**. One was superseded because the statute contradicted its premise; the other was reframed into a question that is still open. **That leaves forty-four put to you****. Not one of the forty-six has been answered by a qualified adviser.** Seven carry a provisional view from the director, recorded on the line and labelled as provisional.
 |
|  **What we are asking you to do** |  Work through them. **Fifteen of the forty-six are marked as blockers** — something stops without them — twenty-three as high, and seven as standard; one is unrated and is explained below. **That severity is our assessment, not a fact about the law**, and until 5 September 2026 it was not recorded anywhere you could check. **It is now on the board, one rating per question, so the counts in this paragraph can be re-derived rather than taken on trust** — they were re-derived that way on 13 September 2026 and came to 15, 23 and 7. **If you think we have the priorities wrong, that is itself useful.** The entries in Section A above are drawn from this set and are the ones that move money. **The unrated one is the reframed question about the buyer's own alteration spend**: the board now records it as superseded too, and its live question is the one on whether that spend sits on top of an agreed figure, which is rated a blocker. We have left it unrated rather than invent a rating for it. (Corrected 14 September 2026: this said the board recorded it as live.) Re-derived from the board on 15 September 2026: of the forty-four put to you, fifteen are blockers — thirteen in Rulebooks C to F and two in the Rulebook A Addendum — twenty-three are high and six are standard.
 |
|  **A contract point you should raise with us before signing anything** |  **Our own hiring documents and the draft engagement letter refer to "42 questions" and "13 blockers". The board records 46 questions; 44 are put to you, and 15 of them are blockers.** The old numbers predate two of the rulebooks, and the hiring documents had still not been corrected on 14 September 2026. **If the letter is signed as drafted, the contracted scope will not match the scope in the pack.** We are telling you this rather than letting you find it. **Corrected 15 September 2026:** the hiring pack, and the draft letter inside it, now say 46 recorded, 44 put to you and 15 blockers, and describe the scope as seven documents — the six rulebooks A to F and the Rulebook A Addendum. The day estimate, which was sized for thirteen blockers, is left for Lakhbir to decide, and is asked in CAPREBATE QUESTIONS under "The tax adviser's review now has fifteen blockers, not thirteen — do we re-size the day estimate before the approach goes out?"
 |
|  **If you confirm the set** |  We have a scope and a fee. |
|  **If you tell us it is the wrong set** |  Better now than after the engagement letter. |
|  **What it unblocks** |  Everything in this document. |

```
SIGN-OFF        The scope is:   as drafted  /  amended  /  not accepted

Your fee basis for this scope:

Your amendment:
.....................................................................
.....................................................................

Signed .............................  Date ..........................
```

---

### ACC-D2 · One thing we want to raise before you find it

|  **What it is** |  **A deliberate disclosure, not a question.** Most of our recent corrections made claims smaller — we found places where the system was letting people claim things they should not, which is the safe direction to be wrong in. **Several went the other way**, and we are naming them rather than letting them surface later. |
| --- | --- |
|  **The specific one** |  A building split into several self-contained flats used to stop the assessment dead. We changed it so that only a genuinely single home stops, and **blocks of flats now proceed and can produce a claim.** That makes some claims bigger. It rests on our reading of one piece of HMRC guidance. **It is already shipped.** Until 12 September 2026 it was behind no switch at all; **it**** ****n****ow**** ****h****as on****e****,**** ****s****e****t to k****e****e****p**** i****t**** ****live**, so a rejection is a one-line change rather than a roll-back.
 |
|  **What state it is in** |  **Live in the engine today**, behind a switch set to keep it live (since 12 September 2026).
 |
|  **Why we are flagging it** |  Every other change in that batch reduced claims, so this one could easily be waved through as part of a general tightening. **It is the opposite, and it carries more risk than the rest.** |
|  **What we are asking you to do** |  **Confirm this reading directly, on its own**, rather than approving the batch as a whole. |
|  **If you confirm** |  Nothing changes; the shipped behaviour stands, now with a signature behind it. |
|  **If you reject** |  **We turn its switch on.** Several self-contained homes then stop at the same reasoned negative as a single home, and the client is told it is a switched position. That is built and tested, and it is one line, not a roll-back. It is one of three entries in this document, with ACC-D3.1 and ACC-D3.2, where rejecting us changes something live.
 |
|  **What it unblocks** |  Our own confidence that the one claim-increasing thing we shipped before asking was right to ship. (It has a switch now; it is still the one we shipped first.)
 |

```
SIGN-OFF        Confirmed  /  Amended  /  Rejected      (delete two)

Your amendment or reasoning:
.....................................................................
.....................................................................

Signed .............................  Date ..........................
```

---

### ACC-D3 · Two more things shipped before we asked — both make claims SMALLER, and both now have a switch


 **Added 5 September 2026.** ACC-D2 above is the claim-_increasing_ thing we shipped without a gate. **It is not the only thing we shipped without a gate**, and the other two point the opposite way. They are put here rather than in Section A because Section A is the readings we built before asking, and **these two were running before anyone asked.** Since 12 September 2026 each also has a switch, set to keep today's behaviour.


 **Why that matters to you.** Everywhere else in this register, rejecting us costs nothing — a switch stays off. **On these two, rejecting us means changing something that is live** — but since 12 September 2026 that change is one switch, already built and tested both ways, not a revert. They are also the two readings on which a client is being told something today.


---

 **ACC-D3.1 · The shared lounge in supported living — the narrow position is already in force**

|  **What it is** |  In a supported-living scheme with self-contained flats, which of the shared areas can be claimed. **On 20 August 2026 we removed shared lounges, kitchens and resident bathrooms from the claimable base and from the client-facing copy**, on the strength of HMRC's published guidance, because the wider position had been assessed as an over-claim. |
| --- | --- |
|  **What state it is in** |  **Live in the engine and in the client-facing wording today, behind a switch set to keep it so** (since 12 September 2026) — the same shape as ACC-D2, and the opposite direction.
 |
|  **The one you should not miss** |  **The director gave a provisional view on 3 September that goes the other way**: _"Supported living is different altogether, so yes it's claimable and it's the whole property."_ **We have not acted on it and we are not going to act on it without you.** Three reasons: it is broader than the question we asked — a shared lounge, a corridor serving only flats, a communal laundry and a staff office are four different cases and the answer distinguishes none of them, nor any of them from the inside of a resident's own flat; **it would reverse a correction we shipped precisely because the wider reading was an over-claim**; and it is in the sector our own risk register names as our highest mis-selling exposure. |
|  **Not to be confused with the switched question in Section A** |  Whether specialised supported housing falls outside the dwelling-house restriction **altogether** is a separate reading, it is built, and it is switched off — it is at ACC-A2. **This one is about the shared areas within a scheme that is inside the restriction, and its switch is a different one.** The two can be answered independently and answering one does not answer the other.
 |
|  **What we are asking you to do** |  **Answer it case by case, because the cases differ**: the shared lounge · a corridor serving only flats · a communal laundry · a staff office. **And if you think the wider reading is right and our August correction was wrong, say so directly** — that is a real answer and we will act on it. |
|  **If you confirm the narrow position** |  Nothing changes. The shipped behaviour stands, with a signature behind it, and the director's provisional view is closed rather than left hanging. |
|  **If you reject it** |  **We turn its switch on.** In a scheme of self-contained homes, a shared lounge or kitchen outside the homes is asked about and counted as a common part, and what the client is told changes with it. It moves a figure only where that room is the scheme's only common part; otherwise the ceiling stands and only the wording changes. That is a claim-increasing change we would be making on your authority and not on our own. **The switch covers a shared lounge or kitchen only** — if you tell us the corridor, the laundry or the staff office is claimable too, that part is new work.
 |
|  **What it unblocks** |  The claimable base in supported living, and the client-facing wording that describes it. |

---

 **ACC-D3.2 · Whose purchase starts the two-year clock — also shipped, and switched since 12 September 2026**


|  **What it is** |  Where the fixed value requirement applies, the two-year period does **not** run from our client's own purchase. It runs from the acquisition by **the person who bought from the past owner**. Where somebody sat in between — a developer, a charity, a housing association, a property company that never claimed — **the clock may have started and finished before our client was a party to anything.** |
| --- | --- |
|  **What state it is in** |  **Built and live. Since 12 September 2026 it has a switch, set to keep it live.** The flow asks whether there was an owner in between, asks for that owner's purchase date if the client knows it, **refuses to substitute the client's own date when they do not**, and reports the window as not determinable rather than open.
 |
|  **Why we are flagging it here rather than leaving it in the review pack** |  Because it is the same shape as ACC-D2 and ACC-D3.1: **something already running that a rejection would change** — since 12 September 2026 by one switch rather than an undo. The direction is the safe one — it closes windows the engine previously reported as open, which makes claims smaller — but **it is still a reading of the statute that we took and shipped, and no adviser has confirmed it.**
 |
|  **The disagreement we are relying on our own reading to resolve** |  **HMRC's own two pages do not say the same thing.** One states the statutory rule — two years beginning when the purchaser from the past owner acquires the interest. The page before it glosses it as running from when the new owner acquires the fixture. **Where the client is the purchaser from the past owner those are the same sentence. Where somebody sat in between they are different dates**, and the gloss produces a window that has not started when the statutory one has already closed. **The question our system originally asked was a paraphrase of the gloss.** |
|  **What it costs if we are right** |  **A whole class of acquisitions arrives already dead** — before our client did anything at all. That has to be said in the first conversation rather than after taking a fee, which is why it is worth confirming rather than leaving open. |
|  **The provisional view we did not count as an answer** |  The director answered _"2 year clock starts from completion date"_ on 3 September. **That is correct and it answers a different question** — which date, not whose purchase. It is recorded as provisional and it changed nothing. |
|  **What we are asking you to do** |  Confirm that the period runs from the intervening purchaser's acquisition, or tell us it runs from our client's. **And tell us whether anything rescues a client who bought after it expired** — there is a route in the statute that has no time limit at all, it is asked separately in the review pack, and it is the difference between "dead on arrival" and "harder but possible". |
|  **If you confirm** |  Nothing changes and a live reading acquires a signature. |
|  **If you reject** |  **We turn its switch on**, and the two-year period runs from the client's own completion date, whoever sat in between. That is built and tested; the client's own date must still be known. The questions about the in-between owner stay in the flow with the switch on — taking them out would be a further, small change.
 |
|  **What it unblocks** |  Whether a class of purchases is claimable at all, and what we are entitled to say at the first conversation. |

```
SIGN-OFF        Confirmed  /  Amended  /  Rejected      (delete two)

ACC-D3.1  Supported living, area by area — claimable or not?
      Shared lounge ......................................
      Corridor serving only flats ........................
      Communal laundry ...................................
      Staff office .......................................
      Was our August narrowing right?              Yes / No

ACC-D3.2  Whose purchase starts the two-year period?
      The intervening purchaser's  /  our client's own
      Does anything rescue a client who bought after it expired?
      ....................................................

Your amendment or reasoning:
.....................................................................
.....................................................................

Signed .............................  Date ..........................
```

 **For the tax adviser — one sentence for you to word (added 24 September 2026, Phase 151, from Lakhbir's answer to "If a client has no accountant, who confirms the claim fits their tax return?").** Lakhbir decided the client confirms in writing, and that is built. What is left is yours: the sentence that tells such a client the last day they can amend the return the claim belongs in, and what happens if they miss it. We would suggest something like: "You can amend your [year] return until [date]. After that date this claim cannot go into that return, and the relief would have to be claimed another way, if at all." Please confirm it, change it, or tell us it must not be said. Until you do, no letter to a client without an accountant carries a last-day sentence.

---

# PART 2 — FOR YOUR OWN ACCOUNTANT

 **This part is not a tax review.** Nothing here turns on the law. It is for the practice that would refer clients to us, or file for a client who came to us directly — and it decides what the referral channel actually is, because at the moment we have designed it without asking anybody who would use it.

 **Two honest caveats before you read on.** These questions have not been tested on a practising accountant: they are a first draft, and the first accountant who reads them will improve them. And **the referral-fee question cannot properly be answered until our own fee basis is settled**, because what is being offered changes the answer.

---

## Section E — the two documents that describe the channel

---

### ACC-E1 · The accountant handoff pack — how a referral runs, both ways round


|  **What it is** |  The document that explains, to an accountant who has never heard of us, what we do and how a referral runs end to end: the nine steps, the three hand-offs, what we need from you and when, what you get back, what to do with it, our fee in outline, **and what we do not do**. It covers both directions — you referring your client to us, and a client who came to us directly arriving on your desk with our pack. |
| --- | --- |
|  **What state it is in** |  **Complete draft. Not approved and not sent to any accountant.** |
|  **What we are asking you to do** |  Read it as the recipient it was written for and tell us **what would stop you referring**. Specifically: is the four-document request at engagement reasonable, and how long does each one actually take you to pull? |
|  **Two things in it worth your attention before you agree to anything** |  **(1)** We will not run a property "to see if there's anything in it" as a favour — not for you, not for a prospect, not as a demonstration. That is a condition of the lawful basis on which we process data at all, and if we break it once it is broken for every client. **A referral therefore costs you nothing and commits your client to nothing; the only step that matters is your client's signature. (2)** There is a statutory notification duty with a three-month clock that our work can trigger. Our reports now route it by clause 1 of the engagement letter: through the client's own accountant or tax adviser where one signs the filing position; through a chartered tax adviser we introduce, once one is appointed; and otherwise the client acts personally, directly with HMRC. **Since 15 September 2026 the ****handof****f**** p****ack****'****s ****own ****te****xt**** say****s**** the same.** Whether surfacing the duty this way is right still sits with the tax reviewer. (Corrected 14 September 2026: this said the reports told every client to act through their own accountant. Corrected 15 September 2026: this said the handoff pack's own text had not caught up yet.)
 |
|  **If you confirm** |  It becomes the document we send to practices. |
|  **If you reject** |  We rewrite it. It has never been sent, so nothing has to be unwound. |
|  **What it unblocks** |  The referral channel, which is meant to be the main way clients reach us. |
|  **Three things corrected since this register was written**
 |  **(1) The old company name is gone.** This entry used to warn you that the pack still carried it throughout and to read past it. That was fixed on 5 September 2026 and the pack now reads Caprebate everywhere. **(2) The fee basis was stated wrongly and is now right.** Section 8 said the baseline was 5% of the tax saved. It is 5% of the capital allowances identified, settled on 3 September 2026, and the two are very different numbers — on allowances of £500,000 at a 25% tax rate, 5% of the allowances is £25,000 while 5% of the tax saved would be £6,250. Corrected on 6 September, with a note added that the fee can exceed what your client saves in tax in the first year, because that is the question they are most likely to bring to you. **(3) The engagement lette****r ****now exists.** Section 10 listed it as not yet written. It was written on 4 September 2026 and states the model in terms. Its clause 1 now covers the client who has no accountant — a chartered tax adviser we introduce signs, once one is appointed, and otherwise the client acts personally — and since 15 September 2026 the pack's notification section follows it. Whether surfacing the duty that way is right is still with the tax adviser. (Corrected 15 September 2026: this said the letter did not yet cover the client who has no accountant.)
 |

```
SIGN-OFF        Confirmed  /  Amended  /  Rejected      (delete two)

What would stop you referring?

Your amendment:
.....................................................................
.....................................................................

Signed .............................  Date ..........................
```

---

### ACC-E2 · The accountant cover note — showing the work without embarrassing them

|  **What it is** |  The short note that travels on top of the pack when it lands on an accountant's desk. Its whole design brief is that it **makes the accountant look good rather than look past**: it shows the work without implying they should have found it. It carries three issue modes for the three ways a pack can arrive, and the fallback for a client with no accountant acting. |
| --- | --- |
|  **What state it is in** |  **Complete draft, in its second version. Not approved and not sent.** The tax content in it also needs the review at Part 1 before it goes anywhere. |
|  **What we are asking you to do** |  Tell us whether it lands the way it intends to — and specifically, **whether anything in it would make you look bad in front of your own client.** That is the failure mode we are most worried about and the one we are least able to judge. |
|  **If you confirm** |  It goes into service with the pack. |
|  **If you reject** |  We rewrite it. |
|  **What it unblocks** |  Whether the first contact with a practice reads as a partnership or as a criticism. |

```
SIGN-OFF        Confirmed  /  Amended  /  Rejected      (delete two)

Would anything in it make you look bad in front of your client?

Your amendment:
.....................................................................
.....................................................................

Signed .............................  Date ..........................
```

---

## Section F — the questions only a practising accountant can answer

 **Thirteen questions. None of them blocks anything, and none of them has been asked of anybody yet.** They are written out in full in our questions document; they are listed here so that this register is the one place a professional has to look.

### The four that decide whether the channel works at all

|   |  Question |  Why it is one of the four |
| --- | --- | --- |
|  **F1** |  **Would you refer a client to us, and what would stop you?** |  The blunt opener, asked cold. **The reasons an accountant will not refer are usually specific and unglamorous, and they are the only thing worth knowing on a first conversation** |
|  **F2** |  **Do you want a referral fee — and what does your professional body require you to tell the client?** |  Members of the accountancy bodies generally have to disclose commission and referral arrangements to their client. **So this is not only a commercial question: it decides what has to appear in writing in front of the client, and in whose document.** Some firms will prefer no fee at all precisely so the disclosure conversation never arises. **We do not pay cash commission to individuals, and the referral-fee model is not settled** — so please treat this as a question, not an offer |
|  **F3** |  **Who files the amended return — you or us?** |  This decides where our work stops and what the handover has to contain. **If you file, our output has to drop into your process; if we file, we need authority to act and you need to be comfortable with that. Those are genuinely different products** and we should not assume the answer |
|  **F4** |  **Should the client engage us directly, or should you stay in front?** |  We can do both. **You are the one who knows which your client would prefer**, and getting it wrong reads as going around you |

### The handover itself

|   |  Question |  Why we are asking |
| --- | --- | --- |
|  **F5** |  **We ask for four documents at engagement. Are they the right four, and are they easy for you to pull?** |  A request that is trivial for us to write and awkward for you to satisfy is where a referral quietly dies. **We want to know what each one actually costs you in time** |
|  **F6** |  **What format do you want the output in?** |  The real question underneath: **does what we send drop into your workflow, or does it create work for you?** If it creates work, the referral has a cost you will not mention and will not repeat |
|  **F7** |  **How much of the defence pack do you actually want?** |  We generate a full evidence pack at claim close and we do not know whether you want all of it, a summary, or only the figures to enter. **Sending more than you want is not generosity; it is a filing problem we have handed you** |

### Timing

|   |  Question |  Why we are asking |
| --- | --- | --- |
|  **F8** |  **Does our reading of the amendment window match how you actually work?** |  We derive the window from the acquisition date and the accounting period rather than asking the client. **You will know immediately whether that logic survives contact with real filing dates**, and you see the edge cases we do not |
|  **F9** |  **When in your year is this conversation welcome, and when is it the worst possible time?** |  Cheap to ask, and it decides when the channel is worth working. **A good idea introduced in the wrong week gets a no that means "not now" and reads as "never"** |

### Risk and reputation

|   |  Question |  Why we are asking |
| --- | --- | --- |
|  **F10** |  **If HMRC opens an enquiry, who does the client ring?** |  They ring you. **So you need to know, before referring, what we will do and how fast.** If we have not told you, we have handed you a risk without saying so |
|  **F11** |  **What would make you look bad in front of your client?** |  Our stated objective for the handover pack is to make you look good. **That is worth testing rather than assuming** — the honest answer is usually a specific story, not a principle |
|  **F12** |  **Have you been approached by a capital allowances firm before? What did they do?** |  Often the most useful of the thirteen (corrected 15 September 2026; this said twelve). **This sector has a reputation problem and we will be measured against whoever got there first.** Better to hear it now than in a decline we cannot explain
 |

### And one for whoever does our own compliance

|   |  Question |  Why it matters more than the others |
| --- | --- | --- |
|  **F13** |  **Do we need anti-money-laundering supervision to do this?** |  Capital allowances advice provided by way of business may fall within the definition of a tax adviser for money-laundering purposes, and a tax adviser must be supervised. **Operating unsupervised where supervision is required is a criminal offence rather than a compliance gap.** Our own reading, and it is a reading rather than a conclusion, is that **it probably does apply**: the money-laundering regulations cover assistance or advice provided "directly or through a third party", HMRC's own published test makes a study of a client's particular circumstances producing a recommended course of action ADVICE rather than information, and at least one professional body publishes in terms that capital allowances advice requires supervision. HMRC would be the supervisor and the registration fee is small. **We would rather have a direct answer than an assumption, and we have written it up rather than quietly assuming we are outside it.** |

```
SIGN-OFF - PART 2

Which of F1 to F13 have you answered?  ..................................

Answered separately (attached / by email / in conversation on ........ )

Signed .............................  Date ..........................
```

 **Added 16 September 2026 by Phase 132e — unsigned text typed under three of the questions above.** Our questions document holds an answer box under each of F1 to F13. Three of them hold an answer that nobody signed and no practising accountant or compliance adviser wrote; each is quoted below so it is in front of you, not as an answer. Ten more hold advice on how to ask the question rather than an answer to it; those are prompts for whoever runs the conversation with you, not drafts of your answers, and are not repeated here. Nothing changes because of any of it.

 **F3.** **Unsigned draft, not a professional's answer — confirm or correct:** typed into the answer box under “Who files the amended return — you or us?” in CAPREBATE QUESTIONS, unsigned and undated. Quoted exactly as typed; only the box's own dotted leader, where it ran on at the start or end of a line, is left out. It moves no switch and no figure.

```
Your answer: We can or their accountant
```

 **F10.** **Unsigned draft, not a professional's answer — confirm or correct:** typed into the answer box under “If HMRC opens an enquiry, who does the client ring?” in CAPREBATE QUESTIONS, unsigned and undated. Quoted exactly as typed; only the box's own dotted leader, where it ran on at the start or end of a line, is left out. It moves no switch and no figure.

```
Cap Rebate
```

 **F13.** **Unsigned draft, not a professional's answer — confirm or correct:** typed into the answer box under “Do we need anti-money-laundering supervision to do this?” in CAPREBATE QUESTIONS, unsigned and undated. Quoted exactly as typed; only the box's own dotted leader, where it ran on at the start or end of a line, is left out. It moves no switch and no figure.

```
.Yes — treat AML supervision as required unless a solicitor/compliance adviser confirms that Cap Rebate's
 actual activities fall outside the regulated scope. HMRC's current guidance specifically recognises capital
 allowances claims as specialist tax-adviser work, and businesses carrying on relevant regulated activity must be
supervised
```

---

## Appendix 1 — what is NOT in this register, and why

 **Two kinds of thing are deliberately absent.**

 **First: everything waiting on a signature that is not a tax adviser's or an accountant's.** Nine items on our project board are finished and waiting on somebody's confirmation, and that somebody is neither of you:

|  Waiting on |  What it is |
| --- | --- |
|  **A solicitor** |  Whether our original pre-engagement data-lookup design broke the data protection rules, and whether we need money-laundering supervision. **The second of those overlaps F13 above** — it is the same question put to a different professional, deliberately, because it is worth two views |
|  **The data protection officer** |  Four approvals: how long we keep the breach register and the complaints log; six years' retention on a client's uploaded documents; that the audit log is tamper-EVIDENT rather than tamper-PROOF; and the impact assessment on the document pipeline |
|  **The director** |  The process for engaging a one-off tax adviser or surveyor, and where the breach register lives and who may write to it |
|  **The developer** |  The handover pack — brief, build order and what to price — and the specification of what the back end may and may not hold |

 **These now have a register of their own**: FOR THE SOLICITOR, THE DPO AND THE DEVELOPER, board item 12983537653, written on 5 September 2026 and sitting beside this one. Earlier versions of this appendix said such a register had been scheduled; it exists. **Bet****w****een**** ****the t****h****ree regi****s****t****e****rs, every item**** o****n**** our ****b****o****ard carrying "Built — a****w****aiti****n****g**** ****sign-****o****ff"**** ****appe****a****r****s ****i****n ****e****x****a****c****t****ly on****e**** of**** t****hem** — one hundred and ten items, re-derived from the board and the three registers on 15 September 2026: forty-five here, nine in FOR THE SURVEYOR, and fifty-six in the new one, which holds sixty-three entries because some items carry two. **Corrected 15 September 2026.** This sentence still gave the 5 September count — forty-nine items, thirty-five here, five with the surveyor and nine in the new one — after the notes below had moved on from it. Count again rather than quote this. 


 **Second: two of the eleven items in Section A are missing from our own shorter questions document.** ACC-A6 (whether the fixed value requirement applies at all where the past owner never claimed) and ACC-A11 (a flat held for the purposes of the trade) are both in the review pack, both built, both switched off — and neither appears in the ten that document lists as "already coded and switched off". **Two questions in that list are not switch-backed at all**, which is how the miscount arose. That document has been corrected. **Nothing was lost: both questions are asked in full in Section A above.**

---

## Appendix 2 — this is a live register

 **This document is maintained, not published once.** Every phase of work on this project is required to update it — to add an entry, remove one, or re-word one — whenever it touches anything either professional has to approve.

 **It goes stale silently.** Nothing else in the project will tell you it is wrong, which is why the obligation sits in the standing instructions rather than in anybody's memory.

 **If you are reading this weeks after the date at the top and something looks out of date, it probably is.** Ask, and we will re-derive it from the board rather than from this page.

---

## Appendix 3 — internal index, for whoever maintains this register

 **Not for the reader. Not part of the review.** Board 18422317809.

|  Entry |  Board item |
| --- | --- |
|  ACC-A1 stamp duty |  12975610449 |
|  ACC-A2 supported housing / dwelling-house |  12851707697 |
|  ACC-A3 buyer's own alterations |  12840979279 |
|  ACC-A4 s.538 carve-out |  12852259255 |
|  ACC-A5 third route, no deadline |  12921346993 |
|  ACC-A6 fixed value requirement applies at all |  12921346994 |
|  ACC-A7 seller never entitled |  12851716705 |
|  ACC-A8 grant deducted twice |  12852269900 |
|  ACC-A9 connected contributor |  12852267228 |
|  ACC-A10 provision of / commissioning |  12843022045 |
|  ACC-A11 trade-purpose flat |  12851716860 |
|  ACC-A16 grant matched to its items (added 4 Oct 2026) |  13200627626 |
|  ACC-A17 election with no tax references (added 4 Oct 2026) |  13200700684 |
|  ACC-A18 election under the wrong section (added 4 Oct 2026) |  13200701317 |
|  ACC-A19 elected value above the law's limit (added 4 Oct 2026) |  13200702306 |
|  ACC-A20 a housing association's payment (added 4 Oct 2026) |  13200704047 |
|  B1-B11 rulebooks |  A 12830061109 / A add 12921255840 / B 12830061291 / C 12830037336 / D 12830044150 / E 12830037617 / F 12830044153 / G 12830061107 / H 12830043662 / I 12830060773 / I add 12889350666 |
|  B file carrier
 |  12921255840 (A addendum) — the A–F carriers 12830178875 / 12830182172 / 12841288962 / 12851645135 / 12910751557 / 12910769642 were closed 12 Sep 2026; their files are byte-identical copies of the files on the Rulebook items.
 |
|  ACC-C1 client report |  12830166288 |
|  ACC-C2 tax implication summary |  12919762132 |
|  ACC-C3 disposal note |  12830181411 |
|  ACC-C4 defence pack |  12804317757 |
|  ACC-D1 review pack |  12830043701 (46 subitems) |
|  ACC-D2 claim-increasing disclosure |  12851910641 |
|  ACC-E1 handoff pack
 |  12923216479 |
|  ACC-E2 cover note |  12804375491 |
|  F1-F13 |  CAPREBATE QUESTIONS, section three |

 **The twenty-four switches all live in one object, ****`CB_CTA`****, in ****`Caprebate site.html`****. There is nowhere else to look.** Every one is asserted both ways in `03-app/caprebate-regression.cjs`, Suite H — and four of the five Phase 132 built in Suite X. **Flipping one makes its branch-B assertion fail — that failure is the harness telling you a tax position has been taken, and it is answered by updating the harness deliberately, never by muting it.** (Corrected 15 September 2026 by Phase 132: this said seventeen.) _4 October 2026 (Phase 153b): there are twenty-nine now, all off, counted by the extraction verifier; the four Phase 153b built are asserted in Suite AI. The fee comparison's VAT switch (Word question 59) is in `CB_FEEGUARD`, beside the two fee-guard switches, not in `CB_CTA`._


 **Register size, re-derived from the board on 5 September 2026.** 32 numbered entries — 11 in Section A, 11 rulebooks under one sign-off block in Section B, 4 in Section C, **4**** in Section D** (ACC-D1 the review pack, ACC-D2 the claim-increasing disclosure, and ACC-D3.1 and ACC-D3.2, the two claim-reducing readings shipped behind no switch, added 5 September 2026), 2 in Section E — plus 13 questions in Section F. **Board items covered: 35, unchanged** — ACC-D3.1 and ACC-D3.2 are disclosures about live engine behaviour and about questions already inside the review pack at ACC-D1, so they add entries and no items. 

 **Board items covered: 37.** Twelve switch items, ten rulebook items and seven file-carrier items, four output documents, the review pack, the disclosure, and the two referral-channel documents. ACC-A1 (stamp duty) became the eleventh switch item on 7 September 2026 and moved from "Ready — Claude can build" to "Built — awaiting sign-off" with the rest; it was the odd one out in this register for exactly as long as it was the odd one out in the engine. ACC-A12 (a grant taken off after the ceilings, board item 13014647417) became the twelfth on 10 September 2026, built and switched off the same day. Its row is missing from the index table above because a row cannot be added to an existing table here, so it is recorded in this sentence instead.


 **12 September 2026: five more switches, no more board items.** Each sits on an item already covered here — ACC-A1's stamp-duty item carries the second switch for legal and incidental acquisition costs; ACC-D2's disclosure item, this register itself (ACC-D3.1), the Rulebook A item (ACC-D3.2) and the Scottish rates addendum (ACC-B11) carry the other four. The same day, the six rulebook file carriers this appendix counted were closed as duplicates of the rulebook items, so the count here no longer holds; the live count is restated at the end of this register.


---

 _Prepared 4 September 2026. __**Nothing in this document is tax advice, and nothing in it has been reviewed by a chartered tax adviser.**__ Every figure it describes is a figure our system produces, not a figure anyone has yet signed._

---

## Note added 5 September 2026 — the documents in this register were re-issued under the Caprebate name

 **Nothing in this register changed its meaning, and nothing new is waiting on you because of it.** Every document listed above was drafted while the business was called Ledgerstone, and later Health Tax Partners. Those names were replaced with **Caprebate** throughout, and the copies attached to the board were replaced with the corrected versions. The tax reasoning, the figures, the section references and the open questions are untouched.

 **The one thing to be aware of.** The documents in Section C — the client report, the tax implication summary in both its sole-trader and partnership variants, the disposal note and the defence pack — and the accountant cover note in Section E are **client-facing and carry tax content**. The brand correction on them is finished. **The tax content is not signed off and none of them is ready to send.** That is what this register exists to record, and it is unchanged.

 **The filenames that still carried the old name are now corrected — and this paragrap****h**** said so onc****e ****before it was true. **As written on 7 September 2026 it claimed that seven rulebook and register attachments, plus the exported Statutory Rules Register, had been re-uploaded under their Caprebate names. **Sixteen**** o****f them had ****n****ot**** ****been.** A board-wide sweep on 9 September 2026 found every rulebook A to I, the entitlement truth table and the Scottish addendum still filed under names beginning "Ledgerstone-Statutory-Rules-Register-…", on both the rulebook item and its FILE ONLY companion. **All sixteen we****r****e ****r****e****-uploa****d****ed from**** the ****c****l****ean-****name****d**** ****orig****in****als on 9**** ****Sep****t****e****m****b****er 2026, and ****eac****h**** body w****a****s compare****d again****st the attachment i****t ****re****placed before**** the swap: e****v****ery ****one wa****s**** identica****l**** ****onc****e**** th****e brand was normali****s****ed. The contents are unchanged, they remain the versions described in Section B,**** a****n****d ****n****o****thing**** ****he****re**** is wai****ti****ng ****on**** you.** One filename on the board still carries the old name on purpose — the legacy site fork attached to an engine-remediation item, whose filename is cited as evidence by another item and by a measured hit count taken against it. It is not a rulebook and it is not in this register.


---

## Added 8 September 2026 — the fee basis in the finance documents was wrong, and the correction makes the numbers larger

 **Phase 101.** Two documents in your part of this project described the fee on a base that had been superseded, and both are corrected in the copies now attached to their board items.

-  **The monthly management accounts pack template** said the fee basis was _"settled 28 August 2026 at 5% of tax saved"_. **It is 5% of the capital allowances identified** — settled by Q55 on 3 September 2026. The template's **categories are unaffected**, because it asks for fee values rather than computing them. What changes is the size of the numbers entered into it: on the corrected base the fee is roughly **four times larger** for a company client at 25% than the old wording implied.

-  **The VAT threshold monitoring procedure** described the fee decision as _"5% of tax saved as the baseline"_. Corrected. **This one matters to you more than it looks:** the procedure exists to watch the rolling-twelve-month turnover against the registration threshold, and a fee base four times larger reaches that threshold four times sooner. The procedure's own worked example — a multi-site care group at **£75,000 of fee from one client** — was already computed on the allowances figure and **is unchanged and correct**; the sentence above it was the part that was wrong.

 **Nothing new is waiting on your signature.** Both were factual corrections to documents already in this register, not new work.

 **SUPERSEDED ON 9 SEPTEMBER 2026 — the banner is gone and the figures are rebuilt. **This paragraph used to warn you that the business plan's pricing sections and the rate card were still on the old fee base, carried a do-not-quote banner, and understated their revenue figures by two and a half to four times. **All fi****ve**** p****r****icing**** ****docu****m****e****n****t****s ****were**** ****re****built**** ****o****n**** the ****de****cid****ed b****ase**** ****on 9**** ****Sep****t****ember**** ****2026**** and ****every b****a****nn****e****r has**** be****e****n**** re****moved.** The five are the rate card, the fee-basis options paper, the business plan and the two minimum-fee papers. Their revenue figures are now computed on 5% of the capital allowances identified, they are generated by a tested model rather than typed by hand, and **you may quote from them.** The cost figures in them never changed.


---

## Note added 9 September 2026 — one number in Appendix 1 is wrong, and nothing you are being asked to sign has changed

 **Nothing in Sections A to D changed.** No reading, no rulebook, no output document and no question was added, removed or re-worded by this note. **If you are here to sign something, stop reading at the end of this paragraph** — the rest is housekeeping about how these three registers keep themselves honest.

 **Appendix 1 says that between the three registers every item on our board carrying **_**"Built — awaiting sign-off"**_** appears in exactly one of them, and puts the total at forty-nine — thirty-five here, five with the surveyor, nine with the solicitor and the data protection officer.** That was re-derived on 5 September 2026 and was true then. **Re-derived from the live board on 9 September 2026 it is fifty-nine.**

 **So nine finished pieces of work are waiting on somebody's signature and appear in none of the three registers.** They are not new work and none of them is yours to worry about until it is written up — the point of recording it here is that **these documents are derived from the board, nothing on the board reports when one has fallen behind it, and they therefore go stale in silence.** Saying so in the register is the only way a reader can tell.

 **Reconciling the nine — deciding which register each belongs in and writing each one up in the shape these documents use — is a scheduled job with its own board item (13004486738)**, not a note somebody hopes to get to. **Until it is done, read the thirty-five in this register as complete for what it covers, and the split in Appendix 1 as the shape rather than the count.**

 **One thing in Appendix 1's own table is also now out of date, and it is a description rather than a number.** The developer's row reads _"the handover pack — brief, build order and what to price"_. **What is handed to a developer since 9 September 2026 is two working applications and one specification that describes them**, at `09-app/CAPREBATE-DEVELOPER-SPEC.md`. The brief and the build order are archived and still travel with the pack. The table cannot gain a row through the interface that maintains this document, which is why this is said in prose beside it.

---

## Added 9 September 2026 — the five pricing documents are rebuilt, and one of them is now clear to come to you

 **Nothing in this register's Sections A to F has changed and nothing new is being asked of you.** This note exists because an earlier note in this document told you not to quote a revenue figure from two named documents, and that instruction is now wrong.

 **What happened.** Five documents priced jobs on _5% of the tax saved_ — the base the fee-basis options paper recommended and which Q55 did not choose. On 8 September they were banned from quotation; on 9 September they were rebuilt on **5% of the capital allowances identified**, which is what we charge. **The rate card, the fee-basis paper, the business plan and both minimum-fee papers are all now current**, and the paragraph above has been corrected. _(Updated 28 September 2026, Phase 153: that was true on 9 September. Since then the fee has become a flat **3%** of the capital allowances identified, so "5% … which is what we charge" is history, not the current charge; the rate card and the papers now say 3%. The old extra charges are Word question 235, "Do the old extra charges stay: the add-on for complicated jobs and the £1,500 manual-handling charge?".)_

 **The one thing in it that is a question for a tax adviser rather than for us**, and it is raised here rather than in Section A because it is a commercial point with a tax shape rather than a reading of the legislation:

> Our fee is a flat 3% of the allowances identified, which is 7.5% of an unincorporated client's lifetime relief at 40% and 12% of a company's at 25%.
>  
> (Revised
>  
> 17 September 2026: when this w
> a
> s writte
> n
>  the fee was 5%,
>  
> wh
> i
> ch
>  exceed
> ed
>  what the client relieves in their FIRST year on most jobs and on every company job
>  — 89% to 333% of first-year benefit in the fee-basis paper. At 3% it still exceeds year one on special-rate plant and for clients with low profits, but no longer on every company job.) 
> Is a flat percentage of allowances the right shape of fee for a client whose benefit arrives over a decade, or should the first invoice be capped against year-one relief with the balance staged?
> 

 **That is not new information** — the fee guard in the engine established it independently in September and both switches that would cap or warn on it are deliberately off. **What is new is that the papers now say it in terms**, and it is the question a client's own accountant is most likely to bring back to us.

 **Nothing here is waiting on your signature.** The decision is Lakhbir's, it is recorded as an open question in the questions register under his name, and it is flagged in the rate card as something to discuss before a fee is quoted.

---

## Added 9 September 2026 — the count in Appendix 1 is now right, the reconciliation is done, and nothing in front of you has changed

 **Nothing in this register gains or loses an entry. Thirty-six board items, unchanged.** This note corrects a number and records that a gap the note above described as scheduled has been closed.

 **What Appendix 1 says, and what is now true.** It states that between the three registers every item on the board carrying _"Built — awaiting sign-off"_ appears in exactly one of them, and puts the total at **forty-nine** — thirty-five here, five with the surveyor, nine with the solicitor and the data protection officer. A note above corrected the total to **fifty-nine** on 9 September and said nine items appeared in no register at all, with the reconciliation scheduled.

 **Re-derived from the live board today, in code and not by eye: sixty-one items carry that status, and the split is thirty-six here, seven with the surveyor, and eighteen with the solicitor, the data protection officer and the developer.** Thirty-six plus seven plus eighteen is sixty-one. **Every item at that status now appears in exactly one register**, which is the claim Appendix 1 makes and which none of these three documents can check about itself.

 **The eight that had no home — and the note above said nine, which was right when it was written.** Since then two more items reached that status and three were adopted by the phases that finished them. **That churn inside two days is the argument for a standing check rather than an argument against either number.** Of the eight, one was a surveyor's question — where a desk-only claim stops paying for itself — and seven were legal, data-protection or developer work. **None of them was yours**, which is why the thirty-six in this register is unchanged and why you can read it as complete.

 **The word "shape rather than the count" in the note above no longer applies.** It is the count.

 **And the underlying defect is recorded rather than fixed.** These registers are derived from the board, and **nothing on the board reports when one has fallen behind it** — so they go stale silently and only a deliberate look catches it. A question has been opened for the director asking whether that reconciliation should be an automated check rather than something a sweep remembers to do.

 **Correction to the last paragraph above, made the same day.** It says a question has been opened for the director about automating the check that these registers still match the board. **On the project's own rule that is the wrong destination** — a thing that can be built today without anybody answering anything is built, not asked about. **A phase has been written to build the check** instead. Nothing else in the note changes, and nothing in this register needs your attention because of it.

---

## Note added 9 September 2026 — the check the note above promised is built, and it is running

 **Nothing in Sections A to F changes and nothing new is waiting on your signature.** If you are here to sign something, you can stop at the end of this paragraph.

 **The note above says a phase had been written to build a check that these three registers still match the board. It is built.** It reads every item the board says is finished and waiting on a signature, reads the board item numbers each register names, and fails when an item appears in **no** register, in **more than one**, or on a status a register no longer expects — and separately when a register's own stated count or split disagrees with what the board actually holds.

 **The count in the note above is unchanged and correct: thirty-six board items here, out of sixty-one across the three registers.** The split it states — thirty-six, seven and eighteen — was reported wrong by the first run of the check, and the fault was not in this register: the surveyor's ninth entry had been written up in full without its board item number, so nothing linked it to the board. **That is fixed in that register and the split now reconciles.**

 **Why you are being told about a piece of our machinery at all.** Because the honest position stated at the top of this document depends on it. These pages are derived from a project board, they went stale twice in five days, and until today the only thing that ever caught it was somebody deciding to look. **What the check cannot do is tell you whether an entry is well written or answerable** — only that the item is named and counted. That part is still a person's job, and it is still ours.

---

## Added 10 September 2026 — one entry more: ACC-A12, a grant taken off after the ceilings

 **This register gains one entry and one board item.** ACC-A12 sits in Section A, directly beside ACC-A8. It is the twelfth engine switch — built, tested both ways and switched off on 10 September 2026 — and the only one of the twelve that can only make a claim smaller. Board items covered: 37.

 **Re-derived from the live board today, in code and not by eye: sixty-two items carry that status, and the split is thirty-seven here, seven with the surveyor, and eighteen with the solicitor, the data protection officer and the developer.** Thirty-seven plus seven plus eighteen is sixty-two, and every one of them appears in exactly one register — checked by the sign-off register check against a snapshot of the board taken today. The notes above that give the earlier counts were right on the day they were written; the only change since is ACC-A12.

---

## Added 10 September 2026 — one entry more: ACC-A13, reading "roughly break-even" as not enough taxable profit

 **This register gains one entry and one board item: 13005757375.** ACC-A13 sits in Section A beside the twelve engine switches, and it is a different kind of switch. It does not live in the engine. It lives at the point where the answers to our six-screen assessment become the engine's session. **It is built, tested both ways, and switched off.**

 **Off, as shipped:** a client who tells us the business is roughly break-even is treated exactly like one who says "not sure" and one who was never asked. No gate opens and we go on asking. **On:** break-even is read as "no, not enough taxable profit", which is the reading the engine's own profit question points at. That client then gets exactly the session a loss-making client gets: the profit gate shuts, no near-term cash figure is shown, and no other fact moves. Turning it on can never make a claim look better, only more cautious.

 **What we are asking you** is the question already in CAPREBATE QUESTIONS under your name, "Is 'roughly break-even' enough profit for the relief to bite on?". Your answer is now a one-line change rather than a build. Board items covered: 38.

 **Re-derived from the live board today, in code and not by eye: sixty-six items carry that status, and the split is thirty-eight here, seven with the surveyor, and twenty-one with the solicitor, the data protection officer and the developer.** Thirty-eight plus seven plus twenty-one is sixty-six. Four items moved since the note above: ACC-A13 here, and three in the third register — the redraft of clause 7 of the engagement letter, and the governance policies and the privacy notice, both moved from Done because neither is approved.

---

## Added 11 September 2026 — one entry more: ACC-E3, the referral channel as built

 **This register gains one entry and one board item: 13025214371.** ACC-E3 belongs with ACC-E1 and ACC-E2 in Section E, the channel, and it is the first entry in Part 2 that is working software rather than a document: what a practice actually receives from us, and the form it would fill in. **Nothing in Sections A to F changes.**


### ACC-E3 · The referral channel as built — the notices a practice receives, and the referral form

|  **What it is** |  When you refer a client, the referral is recorded against your firm. **Only if your client tells us they want it**, a short notice goes to the one person at your firm named to receive them, at six moments: the referral reaches us; your client's indicative range is issued; they engage us; the report is delivered; our invoice stage is complete; and, if there is no claim, that there is none, with the listed reason. **A notice carries your client's business name and the stage — never a figure, a document, or anybody's name.** Separately, a short referral form for a practice: your practice, your name and email, your client's business, its sector, the property's postcode, what happened at the property and the year, and your confirmation that your client agreed to your passing the details on. |
| --- | --- |
|  **What state it is in** |  **Built and tested. Nothing is sent** — every notice is written to an outbox and stays there. **The form is switched off** until our privacy notice says what a referring firm passes to us. |
|  **What we are asking you to do** |  Tell us whether these are the notices you would want, **worded the way you would want them**, and whether any of them could embarrass you in front of your client. The words are in the back end's introducer module, under NOTICES; we will send them as a page if that is easier. |
|  **Two things worth knowing before you answer** |  **(1) The "fee settled" notice says our invoice stage is complete, not that anything was paid**, because nothing in our process records payment. If you would rather not hear about our invoicing at all, say so and that notice goes. **(2) Whether anything is paid to your firm for a referral is not settled** — it is Lakhbir's decision, and both answers are built and switched off. F2 asks what your professional body would require you to tell your client if it were. |
|  **If you confirm** |  The notice words and the form's fields stand. |
|  **If you reject** |  We rewrite the words or change the moments. Nothing has been sent to anyone, so nothing has to be unwound. |
|  **What it unblocks** |  A practice hearing from us at the right moments, in words it is comfortable with, once the channel is live. |

```
SIGN-OFF        Confirmed  /  Amended  /  Rejected      (delete two)

Would any of these notices, or the form, make you look bad in front of your client?

Your amendment:
.....................................................................
.....................................................................

Signed .............................  Date ..........................
```

 **Internal index, for whoever maintains this register:** ACC-E3, the referral channel as built — board item 13025214371.

 **Board items covered: 40 — with ACC-C5, below.** On the live board, counted in code at the close of CRM 7 of 10, **seventy items carry that status: forty here, seven with the surveyor, and twenty-three with the solicitor, the data protection officer and the developer.** Forty plus seven plus twenty-three is seventy. CRM 5 of 10 added two on 11 September — this one, and the data protection officer's check of what a referred client is told before their progress is shared, which is in that register as P11 — CRM 6 of 10 added one the same day, ACC-C5 below, and CRM 7 of 10 added one on 12 September: the invoice-fraud procedure, which waits on the solicitor, the data protection officer and the developer.


---

## Added 11 September 2026 by CRM 6 of 10 — one entry more: ACC-C5, the claim's facts, the four figures and your sign-off, as built

 **This register gains one entry and one board item: 13025790820.** ACC-C5 belongs with ACC-C1 to ACC-C4 in Section C — what a claim produces — and, like ACC-E3, it is working software rather than a document. **Nothing in Sections A, B or D changes, and no switch moves.**

### ACC-C5 · The claim's facts, the four figures, your sign-off as a record, and clause 13 — as built

|  **What it is** |  Five readings a claim now takes from its own records, each built the way we read the rules, and each yours to confirm. **(1) The amendment window** is the engine's own rule of thumb — a company twenty-four months after the accounting period end; self assessment twelve months after the 31 January filing date. It is **not known, and so opens nothing,** whenever the acquisition date, the accounting period or the claimant type is not known, for a charity, and where the acquisition date falls outside the period recorded. It does **not** read the extension an open enquiry gives. The report stage needs the window open; the invoice stage needs the claim to have been filed inside it. **(2) An election is resolved** on a recorded "no election", or on one with its section, value and scope recorded and notified within the two years s.201(1) allows — or with an undetermined tribunal application lodged in time, s.201(1A). A late notice is a stop, not a pass. A nominal value is recorded like any other. **(3) Every grant traced** means each grant or contribution recorded against the cost elements it met — never pro-rated. **(4) The four figures**: A our indicative estimate, B a researched estimate (not permitted yet), C the surveyor's committed figure, D the figure you sign. **Your sign-off is kept as a record — who, your credential, the date, the scope, a method note, the switch readings you confirmed and the figure — and not as a signature,** and it is the only thing that opens the sign-off stage or releases a figure to a client. A reconciliation then compares them in the Estimate-to-Outcome design's own schema; the quote is the range the client saw, so the quote gap is "not known" on every case, and **you tag the variance before a case closes**. **(5) Clause 13** — the fee recalculated when a claim is reduced — is switched off while its three terms are blank. |
| --- | --- |
|  **What state it is in** |  **Built and tested. Nothing is switched on, and no claim is live.** |
|  **What we are asking you to do** |  Confirm or correct each of the five. Three deserve your particular attention: **whether a partnership's window may assume every member is an individual** — a corporate member moves the date; **whether the extension an open enquiry gives should open the window** for a claim not yet filed; and **whether a nominal election should stop a claim at data gathering** rather than pass as resolved. |
|  **If you confirm** |  The readings stand as built. |
|  **If you reject** |  Each is one function with its own test; we change the reading and the test says so. |
|  **What it unblocks** |  A claim reaching its report and invoice stages on dates you have checked, and your sign-off being the record that releases a figure. |

```
SIGN-OFF        Confirmed  /  Amended  /  Rejected      (delete two)

(1) the window   (2) the election   (3) grants traced   (4) the four figures and your record   (5) clause 13

Your amendment:
.....................................................................
.....................................................................

Signed .............................  Date ..........................
```

 Added 15 September 2026 by Phase 132, on the first of the five readings, the amendment window, for a partnership with a company as a partner. Where the company deadline is earlier, it now applies, live, because that can only close a window. Where it is not known whether a partner is a company, the window counts as open only if it is open on both dates. Where the company date is later, using it sits behind a switch, off, and waits on the partnership question. Please confirm the live half, and tell us whether a company partner's later date may keep a partnership's window open.

 **Internal index, for whoever maintains this register:** ACC-C5, the claim's facts, figures and sign-off as built — board item 13025790820.

 **Board items covered: 40.** On the live board, counted in code at the close of CRM 7 of 10, **seventy items carry that status: forty here, seven with the surveyor, and twenty-three with the solicitor, the data protection officer and the developer.** Forty plus seven plus twenty-three is seventy. CRM 6 of 10's addition is this entry's item; CRM 7 of 10's is in FOR THE SOLICITOR, THE DPO AND THE DEVELOPER.


## Added 12 September 2026 — nothing new waits on you, and the count moves by one elsewhere

 **Nothing in this register changes.** CRM 8 of 10 built the compliance registers — customer due diligence, rights requests, complaints, breaches, consent and retention — and their sign-off belongs to the solicitor and the data protection officer, not to you. On the live board, counted in code at the close of CRM 8 of 10, **seventy-one items carry that status: forty here, seven with the surveyor, and twenty-four with the solicitor, the DPO and the developer.** Forty plus seven plus twenty-four is seventy-one.

---

 **Changed 12 September 2026 by the Phase 127 sweep, on entries already in this register. Nothing was added or removed.**

 **The claim-route codes.** The accountant handoff pack's refund section now uses Rulebook A's codes: W1 amend, W2 current-period pooling (window closed, property still owned), W3 closed (window closed, property sold), W4 enquiry open. The Tax Implication Summaries always used these. The estimate engine used the same four codes for three other things — a return not yet filed, allowances carried forward and a loss carried back — and was corrected the same day. Every cash figure it produces is unchanged, and a proof over every combination of the facts it reads shows it.

 **One thing to add to what you are asked.** A loss carried back on a closed window (W2) repays tax. The refund rule as written does not cover that, any more than it covers payments on account adjusted down. Both edges are now flagged in the pack and in the engine, and a question asking both is written into Phase 129.

 **No allowance rate is quoted any more** in the pack, the report cover or the fee disclosure a client sees. They said "18% or 6% a year"; they now say the rate in force for each chargeable period, which Rulebook I sets.

---

## Added 12 September 2026 by Phase 128 — nine entries more: finished documents that sat at Done while their own pages said draft

 **Nothing below is new work.** Every entry is a document that was already finished, that the board had marked Done, and whose own first page says it has not been reviewed by a chartered tax adviser, or not approved. Done on this board means finished and in force, and a draft at Done appears in no register — so nobody was ever going to be asked to sign these. Each board item now carries an update quoting its document's own status line. **A row cannot be added to the index table in Appendix 3 through the document API, so every entry is declared here, in prose, with its board item number.**

### Part 1, Section C — seven more documents a client or their accountant receives

 **ACC-C6 · The tax implication summary, sole trader variant.** Board item 12830183379. Its header reads "NOT YET REVIEWED BY A CTA". It carries the personal-allowance restriction and the payments-on-account recalculation the company version does not. Corrected on 14 September 2026 to version 1.1: payments on account are now verified to include Class 4 National Insurance, and a section on when relief becomes cash was added. Corrected 15 September 2026: section 4.1 called 2024-25 the only year that can still be amended; it is the earliest year still open, and a filed 2025-26 return stays amendable to 31 January 2028. **Unblocks** issuing a report to an unincorporated client.


 **ACC-C7 · The tax implication summary, partnership variant.** Board item 12830205673. "NOT YET REVIEWED BY A CTA". The claim goes in the partnership return, and the headline turns on each partner's profit share in the year of claim. Corrected on 14 September 2026 to version 1.1: the £25,000 annual cap on relief for non-active and limited partners is now verified and stated, and the fee wording follows the decided basis. Corrected 15 September 2026: section 4.1 called 2024-25 the only year that can still be amended; it is the earliest year still open, and a filed 2025-26 return stays amendable to 31 January 2028. **Unblocks** issuing a report to a partnership.


 **ACC-C8 · The reasoned negative — the report a client receives when there is no claim.** Board item 12804151034. "Draft — requires CTA review before issue". Its anchor case is the £1 election. **Unblocks** telling a client, defensibly, that there is nothing to claim.


 **ACC-C9 · The four-document request to the client's accountant.** Board item 12804375390. "Draft — requires CTA review before issue". **Unblocks** sending it at engagement, in parallel with the survey.

 Added 15 September 2026 by Phase 132. The request now asks for the number of associated companies, as a field of its own, shown only while the corporation tax marginal-rate switch under Rulebook I is on. While that switch is off, the request is unchanged. Please confirm the wording of the field, and that an accountant can supply the count at engagement.

 **ACC-C10 · The Stage 2 document upload screen.** Board item 12818978746. "Draft — requires CTA review before issue". Its ten subitems are the list itself, not unfinished steps. **Unblocks** the client-facing copy on the upload page.

 **ACC-C11 · The yield bands relabelled "assessed, not independently calibrated".** Board item 12818099899. The relabelling is made and shipped; its record calls it "a draft for human approval — not a decision made", and the attribution it adds says the bands await your review. **Confirm the wording.** The recalibration behind the bands is the surveyor's question and is not asked here. **Unblocks** the only figure a client sees before engagement being described in words you accept.

 **ACC-C12 · The private hospitals and clinics question flow, version 2.** Board item 12840725124. Its own status says the items in its section 12 need sign-off before go-live. **The surveyor signs its fixture questions too**; it is housed here because most of section 12 is tax. **Unblocks** the fifth sector going live.

 Added 15 September 2026 by Phase 132. The seven question cards that were missing from the built flow are now built. They capture answers only and move no figure, with one exception: a known yes to "the owner caused the contamination" removes the land remediation relief line. Please sign off the flow, including that exception, before the sector goes live.

 Added 16 September 2026 by Phase 132i. The land remediation line in this flow now appears only when the client has said the contamination was **not** caused by them or anyone connected with them. Until today, "not sure" and no answer at all both left the line showing — and with no answer, nothing flagged it. The line tells the client about a relief they may have, so it may not rest on an unknown answer. For example: a hospital group that cleared asbestos from a building it bought, and answers "not sure" to who caused it, now sees no land remediation line and a flag asking a specialist to confirm polluter status. **No capital allowances figure moved** — nothing in the estimate reads the line. Please sign off the flow with the line as now worded.

 **Added 16 September 2026 by Phase 132j — the same question is now asked in the other four flows.** Care homes, dental, supported living and GP all asked whether the work dealt with contamination or a derelict building, and showed the land remediation line on a "yes", but none of them ever asked who caused it. They now ask it straight after, in the same words as the private hospitals flow, and behave the same way: the line appears only when the client says the contamination was not caused by them or anyone connected with them; "yes" removes it and says why; "not sure" removes it and flags it for a specialist; no answer removes it too. For example: a care home company that removed asbestos from a house it bought, and answers "not sure" to who caused it, now sees no land remediation line and a flag asking a specialist to confirm polluter status. No capital allowances figure moved in any of the four flows — nothing in the estimate reads the line. Those four flows have no entry of their own in this register, so this note sits beside the flow where the question was first written. When you sign off this entry, please say whether the same treatment stands for all five flows.


### Part 1 — two of our own operating documents

 **ACC-H1 · The standard operating procedures, enquiry to defence pack.** Board item 12552682457. "DRAFT — for approval", and its invoice-fraud addition says not in force. Brought to version 1.1 on 14 September 2026 for the fee basis, the advise-or-support model and clause 1, clause 13, the two-tier lookup rule, no minimum job size and the launch jurisdiction; it adds an open question on who confirms a claim fits the return where the client has no accountant. **You and the surveyor both sign these, and they are here because you sign first.** Your engagement is one fixed-fee read of finished documents, and the stages from the claim onward rest on the rulebooks that same read covers; the surveyor's sign-off waits on a surveyor being engaged at all. The surveyor reads the survey stages after you. The invoice-fraud procedure keeps its own entry in FOR THE SOLICITOR, THE DPO AND THE DEVELOPER. **Unblocks** the procedures governing a real job.


 Added 15 September 2026 by Phase 132. Three corrections to the procedures. The enquiry scope now describes a trading business with healthcare property in the UK. The assessment's owner line now matches the flow as built. And the sign-off stage is now a tax adviser's sign-off — the client's own accountant or tax adviser, or our own chartered tax adviser, who is not yet appointed — following clause 1 of the engagement letter. Stage 8's "accountant confirms" is unchanged, pending Lakhbir. Please confirm the sign-off stage as now worded.

 _Added 4 October 2026 by Phase 153a. One correction to the procedures, in two places (SOP 4, step 3, and the data protection officer's retention question near the end): they no longer keep an HM Land Registry owner-name exception. No owner's name is taken from the title register — a person reads it and types at most seven facts, none of them a name — and an uploaded official copy that names a private owner is kept whole and read only by a person, as the data protection officer agreed on 27 September 2026. Nothing you are asked to sign about tax changed._

 **ACC-H2 · The business plan — pricing and the 24-month forecast.** Board item 12552682421. "A draft for approval by Sadique Maskeen, Data Protection Officer, and adoption by CAP REBATE LTD, by a director. Nothing here is decided." (Until 18 September 2026 the plan said "a draft for Lakhbir Dhillon to approve"; Lakhbir, who has no affiliation with CAP REBATE LTD, set the approver that day — Phase 133i.) Rebuilt on the decided fee base on 9 September, and brought up to date on 14 September 2026: advise-or-support decided, clauses 1 and 13, no minimum job size, and four figures in the risk section re-derived from the model. The pricing and forecast figures did not move. On 15 September 2026 the risk section's count of questions put to the tax adviser was corrected to forty-four, and a note now says that the dental cost range and ratio in section 6 are not printed by the plan's model — they come from the job-economics module, at 16 and 200 jobs. **For the practising accountant:** check the pricing and forecast arithmetic before the company relies on it. **Unblocks** the plan being approved and adopted.


 **Internal index, for whoever maintains this register:** ACC-C6 to ACC-C12, ACC-H1 and ACC-H2 — nine board items, one entry each.

 **Board items covered: 43.** On the live board, counted in code during Phase 129 on 12 September 2026, **109 items carry that status: forty-three here, nine with the surveyor, and fifty-seven with the solicitor, the data protection officer and the developer.** Forty-three plus nine plus fifty-seven is 109. Six fewer here than Phase 128 counted, because the six rulebook file-carrier records were closed that day as duplicates of the rulebook items, whose own copies of the same files remain.


## Added 12 September 2026 by Phase 129 — five more switches, two contradictions closed, and nothing switched on

 **Nothing new is added and no entry is removed. No switch is on.**

 **The three readings we shipped before asking now each have a switch.** ACC-D2 (several self-contained homes), ACC-D3.1 (the shared lounge) and ACC-D3.2 (whose purchase starts the two-year clock) were live behind no switch. Each now has one, set to today's behaviour. Confirming us still changes nothing; **rejecting us is now one line, not a revert.** Their entries are re-worded accordingly.

 **ACC-A1's second half is built.** Whether legal and incidental acquisition costs follow the tax in now has its own question and its own switch, off, independent of the stamp-duty switch.

 **Two contradictions are closed.** The sentence that told clients their own alterations sit on top of an election cap (ACC-A3), and the sentence that told clients outside England that acquisition costs were added (ACC-A1), each now follow their switch. With the switches off, clients are told what the arithmetic actually does. **You now rule on the number in each; the words follow.**

 **One more switch sits under the Scottish rates addendum (ACC-B11).** For a sole trader or partnership the income tax rate is read today from the property's nation. A switch that reads it from the taxpayer's main home instead is built and off. It moves the rate band, not the allowances.

 **And one flow defect is fixed without a switch moving.** The supported-living question about who the seller was now offers a private landlord who let the building as homes (ACC-A7). It records nothing ACC-A7's switch would not; with the switch off it moves no figure.

 **Added 15 September 2026 by Phase 132c.** The same answer — "a private landlord who let it out as homes" — is now offered when the care homes, dental, GP and private hospital flows ask who the seller was, not only in supported living. It records the same fact in all five. With ACC-A7's switch off it is treated exactly as a tax-paying seller, so no figure moves; with it on, the answer reaches the same branch in every sector. The GP flow keeps its separate "a private individual / other" answer.

## Added 13 September 2026 by Phase 129a — one entry more: ACC-A14, and Section A's summary table now has a row for every entry

 This register gains one entry and one board item. ACC-A14 sits in Section A, directly after ACC-A11. It asks whether a tenant who pays a premium for a new lease, with no joint election, falls under item 9 of the disposal table — the Act says item 9 is a discontinuance followed by a sale — and whether a section 198 election is available on those facts at all. It is the eighteenth engine switch: built, tested both ways and switched off. Money moves either way on it. The question is already in CAPREBATE QUESTIONS under your name.

 Section A's summary table was replaced whole the same day. Every row it had, ACC-A1 to ACC-A11, is carried word for word, and rows for ACC-A12, ACC-A13 and ACC-A14 are added — ACC-A12 had been described only in the sentence under the table, because a row cannot be added to a table here. The sentence under the table now names the direction of each entry rather than counting them.

 One housekeeping correction in Section B: the note about the A addendum's file-carrier record spoke of several carriers after the other six were closed. It now speaks of one.

 Internal index, for whoever maintains this register: ACC-A14, a new lease for a premium with no joint election is not item 9 of the disposal table — board item 13033203928.

 Board items covered: 44. On the live board, counted in code at the close of Phase 129a on 13 September 2026, 110 items carry that status: forty-four here, nine with the surveyor, and fifty-seven with the solicitor, the data protection officer and the developer. Forty-four plus nine plus fifty-seven is 110. One item moved since Phase 129 counted: ACC-A14's, here.

## Added 13 September 2026 by Phase 129b — one entry more: ACC-A15

 This register gains one entry and one board item. ACC-A15 sits in Section A, directly after ACC-A14. It asks whether, when a client spent the money after the accounting year end they gave us, we may roll that year end forward to find the return the claim belongs in. The rest of the correction is already live: where the year the money was spent in ends before the year end given, the amendment window is now worked out for that year, which Rulebook A section 4 requires and which can only close a window. ACC-A15 is the nineteenth engine switch: built, tested both ways and switched off. It can only make a claim bigger. The question is already in CAPREBATE QUESTIONS under your name.

 Section A's summary table was replaced whole again the same day, carrying ACC-A1 to ACC-A14 word for word and adding a row for ACC-A15, and the sentence under the table now names ACC-A15's direction.

 Internal index, for whoever maintains this register: ACC-A15, the amendment window is the one for the year the money was spent in — board item 13034238993.

 Board items covered: 45. On the live board, counted in code at the close of Phase 129b on 13 September 2026, 111 items carry that status: forty-five here, nine with the surveyor, and fifty-seven with the solicitor, the data protection officer and the developer. Forty-five plus nine plus fifty-seven is 111. One item moved since Phase 129a counted: ACC-A15's, here.

 **Marked 14 September 2026 by Phase 131 — nothing moved into or out of this register; the count moved by one in FOR THE SOLICITOR, THE DPO AND THE DEVELOPER.** Phase 131 brought the documents behind several entries here up to date, and the entries say so: the opening paragraph, ACC-B1, ACC-B6, ACC-B9, ACC-B10, ACC-C6, ACC-C7, ACC-D1, ACC-E1, ACC-H1 and ACC-H2. The review pack's counts were re-derived from the board. Board items covered: 45. On the live board, counted in code at the close of Phase 131 on 14 September 2026, 110 items carry that status: forty-five here, nine with the surveyor, and fifty-six with the solicitor, the data protection officer and the developer. Forty-five plus nine plus fifty-six is 110. The item that moved is the HR and employment framework, parked until a first hire.


## Added 16 September 2026 by Phase 132f — a company tax implication summary, the covers' lifetime figure, and the words "our tax adviser"

 Nothing moved into or out of this register, and no count changed. No figure moved: the cash route proof, run against the site file as it stood that morning, lists no moved state.

 **ACC-C2, the tax implication summary: a company variant now exists.** Until today only the sole trader and partnership variants existed, although the accountant covers already enclosed a company one. The new company variant is an unsigned draft for you, in the same two parts: Part 1 is the current and immediate position (§7 to §13) and Part 2 is the future position (§14 to §16). It restates only what the rulebooks and the personal variants support. Where they do not settle a company point, it leaves one of ten marked placeholders, CO-P1 to CO-P10, and two open questions, CO-Q1 and CO-Q2. The placeholders cover:

-  the CT600 pages and the company filing dates;

-  the order of the annual investment allowance against full expensing and the first-year allowances;

-  sharing the allowance within a group, and group relief;

-  the structures allowance on a later gain;

-  company loss relief;

-  restricting a claim;

-  quarterly instalments;

-  balancing charges on fully expensed plant.

 It is attached beside the sole trader variant.

 **The covers still show a lifetime relief figure (new question COVER-Q1, HIGH, in the decision pack, not counted among the fifty-one).** The full cover says "the total relief is around £259,000 over the life of the pools, with about £100,219 of allowances in the first year". The two-page cover has a row "Indicative relief over the life of the pools". Both add Part 1 and Part 2 of the summary together, which the summary's own release check forbids. The full cover also sets an amount of tax relief beside an amount of allowances. Our recommendation is to remove the row and the sentence. If a whole-life figure is wanted, it belongs in Part 2, labelled as including the first period.

 **"Our tax adviser" is gone from the site.** No tax adviser is appointed, yet twelve client-facing sentences said "our tax adviser", five of them the landlord seller assumption line (ACC-A7). They now say a matter is "still to be confirmed by a chartered tax adviser" or "stands only if a chartered tax adviser has answered it that way". The advertising audit's claim C7 records each sentence before and after.

 **ACC-A7, the landlord seller answer.** Changing the seller answer away from the landlord used to leave the never-entitled fact and its assumption line behind, in all five flows. It now clears both. With the switch off, as it stays, no figure moves either way, and a new harness suite proves it.

 **The no-claim threshold and the engagement gate in the back office.** Wherever the back office sets our fee against the client's benefit, it now shows the no-claim reading (five-year relief less our fee under £1,000), marked for your review. The reading prints the figures and refuses nothing, and unknown relief never fires it. The engagement gate now has its costs, and its caveat still says those costs are placeholders.

 **Marked 17 September 2026 by Phase 133a — nothing moved into or out of this register; the count moved by one in FOR THE SOLICITOR, THE DPO AND THE DEVELOPER.** The back office's screens were rearranged so that each login has its own layout, and Accounting's home page now shows invoices due and overdue, fees waiting to be invoiced and the VAT position. No figure, rule or entry here changed. Board items covered: 45. On the live board, counted in code at the close of Phase 133a on 17 September 2026, 111 items carry that status: forty-five here, nine with the surveyor, and fifty-seven with the solicitor, the data protection officer and the developer. Forty-five plus nine plus fifty-seven is 111. The item that moved is the CRM's new layout, which waits on the developer.

 **Marked 17 September 2026 by Phase 133b. Nothing moved into or out of this register. The count moved by one in FOR THE SOLICITOR, THE DPO AND THE DEVELOPER.** The finance page now opens with the totals at the top and six tabs: Money, VAT, Invoices, Fee controls and firms, Settings, and Earlier invoices. Its eight numbered sections are unchanged, and Accounting's home page opens three of them directly. No figure, rule or entry here changed. Board items covered: 45. On the live board, counted in code at the close of Phase 133b on 17 September 2026, 112 items carry that status: forty-five here, nine with the surveyor, and fifty-eight with the solicitor, the data protection officer and the developer. Forty-five plus nine plus fifty-eight is 112. The item that moved is the layout on the five long screens, which waits on the developer.

 **Marked 17 September 2026 by Phase 133c. Nothing moved into or out of this register. The count moved by one in FOR THE SOLICITOR, THE DPO AND THE DEVELOPER.** The finance screens now use the Cap Rebate brand's colours and type, show every date the British way ("24 Sep 2026"; an invoice due on 16 September reads "1 day overdue (16 Sep 2026)" on the 17th), and read "Not set" where a setting has no value. No figure, rule or entry here changed. Board items covered: 45. On the live board, counted in code at the close of Phase 133c on 17 September 2026, 113 items carry that status: forty-five here, nine with the surveyor, and fifty-nine with the solicitor, the data protection officer and the developer. Forty-five plus nine plus fifty-nine is 113. The item that moved is the brand and new-user work on the CRM, which waits on the developer.


## Marked 17 September 2026 by Phase 133d — ACC-E1, the accountant handoff pack, now names us "Cap Rebate"

 **Nothing moved into or out of this register. The count moved by one in FOR THE SOLICITOR, THE DPO AND THE DEVELOPER.** The handoff pack is what an accountant reads about how a referral runs. It said "Caprebate" in sixteen places; each now says "Cap Rebate", the name in the brand book. The one left is the name of a program file in the developer references at the end. The line naming the entity now also records Lakhbir's decision of 17 September 2026: the name is "Cap Rebate", with no "Ltd" and no company number until it is settled which company contracts with clients. No other word of the pack changed, and the copy on the board matches the working copy exactly. ACC-E1 asks you nothing new. Board items covered: 45. On the live board, counted in code during Phase 133d on 17 September 2026, 114 items carry that status: forty-five here, nine with the surveyor, and sixty with the solicitor, the data protection officer and the developer. Forty-five plus nine plus sixty is 114. The item that moved is the work that renamed the engagement letter, which waits on the solicitor.


## Added 18 September 2026 — eight entries now say "Cap Rebate" where you read the business's name, and no other word changed

 On 17 September 2026 Lakhbir decided that the business is **"Cap Rebate"** in anything a person reads — no "Ltd" and no company number — until CAPREBATE QUESTIONS' "Which company will sign our engagement letters?" is answered. Phase 133e applied that to the documents below. **In each, only the business's name changed, and only where you, a client or the public would read it.** File names, the web address and the placeholders a system fills in (for example the signatory's) are unchanged, and so is every figure, every sentence and every conclusion you are being asked to sign. Nothing here is a new question for you.

|  Entry |  What changed |
| --- | --- |
|  ACC-C1 · the client report |  the name of the report the client receives |
|  ACC-C3 · the disposal note |  one section heading the client reads |
|  ACC-C4 · the defence pack |  the pack's own title, the row on who gives the HMRC notice, and the instructions a third party follows to verify the pack — six places |
|  ACC-C6 · the tax implication summary, sole trader |  one sentence in the body |
|  ACC-C7 · the tax implication summary, partnership |  two sentences in the body, one of them the fee sentence; and the company variant beside it, one sentence |
|  ACC-C8 · the no-claim report |  the report's title |
|  ACC-C9 · the four-document request to the client's accountant |  the one sentence the client passes on to their solicitor |
|  ACC-E2 · the accountant cover note |  the cover's title and the sentence introducing us |

 Each corrected file is attached to its task in place of the old one, and was compared byte for byte with the working copy after upload.

## Added 18 September 2026 — eighteen more entries now say "Cap Rebate" in our own working papers too, and no other word changed

 Phase 133e renamed the business in what a client, an accountant, a surveyor or the public reads. Phase 133f finished the job: the remaining documents, including our own internal working papers and the briefs that go to outside parties, now say **"Cap Rebate"** wherever they name the business, on Lakhbir's decision of 17 September 2026. **In each entry below, only the business's name changed.** Every figure, every sentence and every conclusion you are being asked to sign is as it was. Left exactly as written, on purpose: file names, the web address, code, a record of what an earlier decision said at the time, a verbatim quotation of earlier text, and the name of the project folder. Nothing here is a new question for you.

|  Entry |  Where the name changed |
| --- | --- |
|  ACC-A2 · supported housing, is it a dwelling-house |  two places in the working note |
|  ACC-A10 · "on the provision of" and commissioning cost |  one place |
|  ACC-B2 · Rulebook A addendum, the statutory rules register |  the register's title and two sentences |
|  ACC-B8 · Rulebook G |  three places |
|  ACC-B9 · Rulebook H |  one place |
|  ACC-B10 · Rulebook I |  three places |
|  ACC-C3 · the disposal note |  the drafting notes of both documents, three places; the client's text was already renamed |
|  ACC-C4 · the defence pack |  the working notes of the template and its v2 additions, eleven places; the pack's own text was already renamed |
|  ACC-C6 · the tax implication summaries, sole trader and company |  the deliverable header and source notes, six places; the company variant's opening note now says correctly that it is attached to this task |
|  ACC-C7 · the tax implication summary, partnership |  the header, the change notes and two body sentences, five places |
|  ACC-C9 · the four-document request to the client's accountant |  one working note |
|  ACC-C11 · the yield bands relabelled |  two places |
|  ACC-D1 · the tax adviser's review pack |  the decision pack and the rulebooks pack, twenty places, including "What Cap Rebate is" |
|  ACC-D2 · the claim-increasing disclosure (questions pack) |  four places, including the pack's "prepared by" line |
|  ACC-E1 · the handoff pack (call agenda) |  the agenda's footer line |
|  ACC-E2 · the accountant cover note |  the drafting notes, seven places; the cover's own text was already renamed |
|  ACC-H1 · standard operating procedures |  forty-two places |
|  ACC-H2 · the business plan |  the title and four sentences |

 Each corrected file is attached to its task in place of the old one and was compared byte for byte with the working copy after upload.

## Added 18 September 2026 — two entries name the company

 CAP REBATE LTD is ours (Lakhbir, 18 September 2026): company number 17307313, incorporated 29 June 2026, registered office 1st Floor, 1-9 Castle Street, Hinckley, LE10 1DA. Phase 133h filled the company placeholder in two entries you are asked to approve. **Nothing else in either changed, and nothing moved into or out of this register.**

|  Entry |  What changed |
| --- | --- |
|  ACC-H1 · standard operating procedures |  the header line under the title names the company |
|  ACC-E1 · accountant handoff pack |  the entity row names the company; the note of 17 September that it said "Cap Rebate" with no "Ltd" and no number is kept as a record |

 Each corrected file is attached to its task in place of the old one and was compared byte for byte with the working copy after upload.

### Added 18 September 2026 — who approves, and who signs for the company

 Lakhbir, 18 September 2026: Sadique Maskeen is the data protection officer and approves the policies; every countersignature is CAP REBATE LTD's, by a director (today Jalil Ahmed); Lakhbir Dhillon, Head of Business Development, has no affiliation with the company. Phase 133i corrected the documents to match. **In this register three entries' documents changed:** ACC-H1, the standard operating procedures, whose approver is now Sadique Maskeen with adoption by CAP REBATE LTD, by a director, and whose SOP 1 owner line names him in place of Lakhbir; ACC-H2, the business plan, likewise (the entry above says so); and the accountant handoff pack, where a row that named Lakhbir for a company act now names CAP REBATE LTD, by a director. **No figure moved, and nothing moved into or out of this register.** All three corrected files are attached to their tasks and were compared byte for byte with the files on disk.


## Note added 22 September 2026 by Phase 144 — plain words on the claim screens: two wordings for the tax adviser to skim, and nothing is blocked

 Phase 144 rewrote every back-office screen so a 12-year-old can read it. The tax meaning was kept everywhere; statutory references stay, after a plain sentence. **Please skim these and tell us if any plain sentence now says something different in tax terms.**

-  **The amendment window and the election sentences** on a claim's facts (the partnership and company filing dates under TMA 1970 s.12AA(5B)/(5C) and s.12ABA(4)(b); the section 198/199 election, where "irrevocable" now reads "cannot be undone" and "the first anniversary of the period end" reads "one year after the period end"). Example: _"We do not know if any partner or member is a company"_ now opens the partnership-date reading.

-  **The client filing record** (staff description only): "that they remain responsible for the filing position" now reads _"that what they put on their return is still their responsibility"_. The sentence the client signs is unchanged.

-  **Grants (Rulebook F), unchanged in meaning:** the valuation check now says _"X of N grants are not matched yet to the items paid for. A grant is never taken as a share of everything."_ and _"We do not know yet if anyone else paid for this work. Not sure or not known never passes."_

## Note added 22 September 2026 by Phase 144a — the assessment's first question: a plainer wording waits for you before it changes

 **What we are asking.** The public assessment's first question decides whether a client says they have already claimed. Its wording can change what a client answers, so we have **not** changed it. Please tell us whether the plainer wording below asks the same thing.

-  **Today:** _"Have you already made a capital allowances claim on the fixtures in this building — the plant, wiring, heating and similar?"_

-  **Proposed:** _"Have you already claimed capital allowances on this building's fixtures, such as its wiring or heating?"_

 **What we think.** It asks the same thing. The one difference: the proposed wording drops the word "plant" and the words "and similar". A client might read "such as its wiring or heating" as a full list. The help line under the question still says "We mean the fixed things in the fabric of the building", which covers the rest.

 **A worked example.** A dental practice claimed on its new air-conditioning in 2021, and on nothing else. Today's wording names "plant", so they answer Yes. With the proposed wording, air-conditioning is not named. They should still answer Yes, because of the help line, but some might answer No. A wrong No means we could estimate a claim on fixtures they have already claimed on.

 **Our recommendation.** Use the proposed wording with air-conditioning added: _"Have you already claimed capital allowances on this building's fixtures, such as its wiring, heating or air-conditioning?"_ Or keep today's wording. Either is safe; the choice is yours.

 **What your answer unblocks.** One edit, made in the site file and the assessment together. A test fails if the two ever differ.

 **Also for you to skim — words changed, meaning kept.** Five reasons a lead is lost or a claim stops now read plainly (the stored code is the same):

-  _"A nominal or unscoped section 198 election affects the property"_ now reads _"A section 198 election at a token value, or with no clear scope, covers the property"_.

-  _"A grant or contribution cannot be traced to specific cost elements"_ now reads _"A grant or other payment cannot be matched to the items it paid for"_.

-  Three help lines on the assessment were split into shorter sentences, with the same words. The cosmetic-work note now reads _"cosmetic work usually counts as a repair. A repair is not a capital improvement."_

 **Your answer:**

> (write here — the wording to use for the first question, and anything above that now says something different in tax terms)

 **Phase 146, 22 September 2026 — what changed under entries in this register.** No entry was added or removed, and no status moved.

-  **The land remediation wording on the site** (supported living, care homes and the contamination question) now says only what Rulebook H supports. It covers companies only, and only land already contaminated when bought and not caused by the company or anyone connected. A grant or a short lease rules it out. It no longer says the relief is "often worth more".

-  **Rulebook C** now carries a dated note on who signs the filing position under clause 1: the client's accountant or tax adviser, or the client where there is neither.

-  **The fee against year-one relief at 3%** is re-run with real numbers under "Do we cap the fee, warn about it, or adjust the percentage?" in CAPREBATE QUESTIONS. A company at the 19% small profits rate on main-pool plant from April 2026 is behind the fee in year one, and a test now pins that.

---

## Added 22 September 2026 (Phase 146a) — two documents you are asked to sign, reworded on who makes a filing-position call

 The client's upload screen (the Stage 2 document list) said that tracing a grant to particular items was "a CTA review task". It now says it is Rulebook F's tracing judgement, made under that rulebook. The Private Hospitals and Clinics question flow said the defensible figure comes with "a CTA sign-off". It now says the figure is signed off by whoever signs the filing position under clause 1 of the engagement letter: the client's accountant or tax adviser, or the client if there is neither. Caprebate engages no tax adviser per case. Each change has a dated note beside it, and the files on both tasks were replaced on 22 September 2026. Nothing you are asked to decide has changed.

 **Marked 22 September 2026 by Phase 146e. Nothing moved into or out of this register. The count moved by one in FOR THE SOLICITOR, THE DPO AND THE DEVELOPER.** Nothing an accountant reads in this register changed. Client documents can now be read by the Claude API; it is built and switched off until the data protection officer approves it. Board items covered: 45. On the live board, counted in code at the close of Phase 146e on 22 September 2026, 115 items carry that status: forty-five here, nine with the surveyor, and sixty-one with the solicitor, the data protection officer and the developer. Forty-five plus nine plus sixty-one is 115.

 **Marked 23 September 2026 by Phase 146d. Nothing moved into or out of this register, and nothing an accountant reads in it changed. Board items covered: 45.** The count moved by one in FOR THE SOLICITOR, THE DPO AND THE DEVELOPER: the two lookups we pay for — a paid address lookup and HM Land Registry's title register — are now built and switched off. **One thing is worth your knowing, even though it waits on the solicitor rather than on you.** The title register is the only source there is of what a commercial building sold for, and HM Land Registry restricts passing an official copy on to somebody else. **Until the solicitor answers, nothing from it goes into the pack we give a client's own accountant**, so if you expect to see a purchase price there and it is absent, that is why. On the live board, counted in code at the close of Phase 146d on 23 September 2026, **116 items carry that status: forty-five here, nine with the surveyor, and sixty-two with the solicitor, the data protection officer and the developer.** Forty-five plus nine plus sixty-two is 116.

 **Marked 23 September 2026 by Phase 146g. Nothing moved into or out of this register, and nothing an accountant reads in it changed. Board items covered: 45.** One entry was added to FOR THE SOLICITOR, THE DPO AND THE DEVELOPER — the one page a developer reads before opening an account with any of our suppliers. On the live board, counted in code at the close of Phase 146g on 23 September 2026, **117 items carry that status: forty-five here, nine with the surveyor, and sixty-three with the solicitor, the data protection officer and the developer.** Forty-five plus nine plus sixty-three is 117.

 **Marked 23 September 2026 by Phase 146h. Nothing moved into or out of this register, and nothing an accountant reads in it changed. Board items covered: 45.** One entry was added to FOR THE SOLICITOR, THE DPO AND THE DEVELOPER — a back-office screen that lets a member of staff settle a close-but-not-certain register match by picking the right building from a ranked list, built and switched off until the data protection officer agrees to it. On the live board, counted in code at the close of Phase 146h on 23 September 2026, **118 items carry that status: forty-five here, nine with the surveyor, and sixty-four with the solicitor, the data protection officer and the developer.** Forty-five plus nine plus sixty-four is 118.

 **Marked 23 September 2026 by Phase 146i. Nothing moved into or out of this register, and nothing an accountant reads in it changed. Board items covered: 45.** One entry was added to FOR THE SOLICITOR, THE DPO AND THE DEVELOPER — a question only a person can answer about a client's own document: whether a name on it belongs to an organisation rather than to somebody. Two things we read from a grant funding agreement and a building regulations completion certificate are kept on that footing alone, and until this phase nobody could give the answer, so **neither kind of document could be captured at all** — not that one line, the whole document. That is fixed; whether a member of staff may make the call is the data protection officer's. On the live board, counted in code at the close of Phase 146i on 23 September 2026, **119 items carry that status: forty-five here, nine with the surveyor, and sixty-five with the solicitor, the data protection officer and the developer.** Forty-five plus nine plus sixty-five is 119.

 **Marked 25 September 2026 by Phase 151b. Nothing moved into or out of this register. Board items covered: 45.** One entry is added to: ACC-C8, the no-claim report (board item 12804151034).

 **ACC-C8, added to — VAT on our fee in the £1,000 no-claim test.** Lakhbir answered "For the £1,000 no-claim test, do we count five years of relief, and include VAT?" on 24 September 2026: the relief is measured over five years, and VAT is included where the client cannot reclaim it. Five years was already how the test worked. What is new: VAT on our fee is counted only once Cap Rebate is VAT-registered (it is not today, so nothing a client sees has changed) and only where the client cannot reclaim it. A client who can reclaim it is measured on the fee alone. A client whose VAT position is not known is never told not to claim: the test says it cannot be worked out.

 **Worked example.** £30,000 of special-rate allowances, a company at 25%, a period starting 1 April 2026. Five-year relief is £1,995.72 and our fee is £900. Not VAT-registered: relief after the fee is £1,095.72, so the no-claim message does not show. Registered, and the client cannot reclaim VAT: the fee counted is £1,080, relief after it is £915.72, and the message shows.

 **The wording we ask you to review** (none of it can reach a client while we are not VAT-registered):

1.  "our fee is £X plus VAT of £Y, which you cannot reclaim, so £Z in all, and the relief left after our fee and its VAT is £W"

2.  "our fee is £X plus VAT, which you can reclaim and so is not counted here"

3.  "we do not know whether you can reclaim the VAT on our fee, so the relief after our fee and its VAT cannot be worked out. It is not guessed either way, and we do not tell you not to claim"

4.  "we are VAT-registered but no VAT rate is set, so the VAT on our fee cannot be worked out and is never treated as nil"

5.  For you, on the no-claim reading in the back office: "VAT on our fee is counted only when we are VAT-registered and the client cannot reclaim it; a client who can reclaim it is measured on the fee alone; and where we do not know whether the client can reclaim it, the test is not determined and never tells the client not to claim."

 **One question for you, in the Word questions document:** whether the client's answer about VAT on their building works can stand for whether they can reclaim VAT on our fee. Until you answer, the engine does not connect the two.
 **28 September 2026 (the Phase 152 sweep): one clash for the tax adviser, and no new entry.** Rulebook A, section 4, keeps the word "refund" to W1 and W4, and says W2 (the window closed, the property still owned) only reduces tax over time. The estimate says "refund" on W2 as well, when the client says the claim creates a loss and that the loss is carried back to the year before; Module 00 agrees with the estimate, and the rulebook never mentions losses. It was never asked. It is now Word question 237, "When a claim through the pool creates a loss that is carried back, may we tell the client part of it comes back as a refund?", and the rulebook carries a dated note beside the sentence. Nothing in the estimate changes until it is answered.


## Phase 153, 28 September 2026 — dated lines on four entries; nothing moved in or out

-  **ACC-D1, the review pack.** Fifty-three questions, fifty-one put to the tax adviser — see the correction at the top of ACC-D1, re-derived in code. The hiring pack, the decision pack, the rulebooks export, the business plan (ACC-H2) and the Blockers page now carry the same count; the three-day estimate stands.
-  **ACC-B4, Rulebook C.** Section 8.1 said "I have not read TMA 1970 s.12ABA". The section was read in full on 24 August; a dated correction now sits beside the sentence. What remains is the tax adviser's confirmation of the partnership amendment window and its flow-through to partners' returns.
-  **ACC-H1, the standard operating procedures.** Step ~273 no longer says the connectors are not built: they are built and switched off. The title register is bought and read by hand (Phase 146k), still only after a signed engagement letter.
-  **ACC-H2, the business plan.** "Forty-four" questions is now fifty-three recorded, fifty-one put to the adviser.
-  **The fee.** The note of 9 September ("5% … which is what we charge") now carries a dated line: the fee is a flat 3% of the capital allowances identified; the old extra charges are an open question for Lakhbir.
-  **The tax adviser's switches.** The extraction verifier now counts twenty-four, every one off; which way each one moves a claim is being re-counted in Phase 153a.

 **This register's size is unchanged by Phase 153**: no item moved into or out of it. The count is the register check's.

---

## Phase 153a, 4 October 2026 — one entry more: ACC-A16, a grant matched to the items it paid for

 **This register gains one entry and one board item.** ACC-A16 sits in Section A after ACC-A15, with a row in Section A's summary table and in Appendix 3's index. It is the twenty-fifth engine switch — built, tested both ways and switched off — and it moves money either way. Two more checks were built the same day on the way a claim leaves valuation: the grant papers or your view before a grant split in equal share moves on, and the client's confirmation that they have checked with whoever paid the grant. They answer the recommendations under "How should we split a grant when we cannot tell what it paid for?" and "Is a warning enough when claiming relief might force a grant to be repaid?", and both questions now say so. **Board items covered: 46.**

 **And the board's own total at the close of Phase 153a, 4 October 2026, counted in code: 120 items carry that status**: forty-six in FOR THE ACCOUNTANT, nine in FOR THE SURVEYOR, and sixty-five with the solicitor, the data protection officer and the developer. Forty-six plus nine plus sixty-five is 120.

---

## Phase 153b, 4 October 2026 — four entries more (ACC-A17 to ACC-A20), dated lines on eleven, and which way every switch moves a claim

 **This register gains four entries and four board items**: ACC-A17 to ACC-A20, each a tax adviser's switch built, tested both ways and left off, with a row in Section A's summary and in Appendix 3. Every one of the twenty-nine switches now has its direction counted in code (the note at the top of this register, and the paragraph under Section A's summary). Everything else Phase 153b built is something you are asked to check, and it is listed here against the entry it belongs to. **None of it is switched on.** Each question was asked on 29 September in the review document beside the main questions document, with our recommendation; nobody had answered any of them when this was built, so each is built to the recommendation. **Board items covered: 50.**

-  **ACC-A7, the seller who was never entitled (question 73).** The extra question the switch used to ask ("Was the seller someone who could never have claimed …?") is gone, as Lakhbir asked: the switch now reads the client's own answer to "Who did you buy the property from?" — a private landlord who let it out as homes — and nothing else.
-  **ACC-A2, high-care supported living (question 77).** With the switch on, the documents we ask a supported-living client for gain two: the lease or contract with the care provider, and a letter from the care provider confirming the care given on site. Lakhbir has his own template for that letter; until it is filed, ours is a draft.
-  **ACC-A9's item, the landlord's contribution in supported living (question 86).** A new question behind the same switch: did the landlord's payment pay for the shared parts? A known yes takes it straight off the shared parts, never below nil; any other answer keeps the even spread, and "not sure" is flagged. In the review's example — £400,000 spent, the landlord paid 30%, shared parts 25% — spread, the claim is £70,000 of shared parts; tied, it is nil.
-  **ACC-B10, Rulebook I, and ACC-C2, the two tax summaries (question 85).** The same-business exception to the loss relief cap (ITA 2007 s.24A(7)(b)) is written into Rulebook I §6.4 and both summaries now show the capped and uncapped lines side by side; neither is chosen until you confirm. Example: a GP partner with £120,000 of income sets an £80,000 loss against last year's income from the same practice: capped, £50,000 now; with the exception, all £80,000.
-  **ACC-C2, the partnership summary (question 88).** A warning where the repayment is first mentioned: a repayment follows the partners of the year amended, so part may belong to former partners.
-  **ACC-B1, Rulebook A, and ACC-C1, the client report (question 92).** Rulebook A §4 now carries the loss-carried-back exception: on W2, cash comes back as a repayment only where the client says the claim makes a loss that is carried back. The estimate's words changed from "a refund of tax already paid" to "a repayment of tax paid for last year".
-  **ACC-B7, Rulebook F (question 111).** The dental help text now says there is "no general NHS premises grant scheme like the GP one", not that there is none; any grant a dental client names still comes off like any other.
-  **ACC-B3, Rulebook B (question 113).** The stopping rule is written (§8a), with the ownership-history checklist: no fixed number of years; stop at the last owner who could have claimed, or where the law stops the look-back; if the title history and the seller's replies run out first, record "unable to establish" and keep nil at the bottom.
-  **ACC-C8, VAT on our fee (questions 226 and 59).** The client's answer about VAT on their building works now tells us whether they can reclaim VAT on our fee — "reclaimed in full" can, "exempt" cannot — but only where the business that paid for the works is the one we would invoice and nothing has changed; that confirmation is asked only once we are VAT-registered, and every other answer stays not known. And the fee-versus-benefit comparison can count VAT on our fee the same way the £1,000 no-claim test does, behind its own switch (question 59, the director's), dormant until we are registered.
-  **Part 2, "In what format would you like us to send our results?" (question 121).** Beside the signed PDF report, the return entries for each year, as a spreadsheet: the spend added to each pool in the first return, then five years of writing-down allowances and balances, at the rates in Rulebook I. It is attached to the sign-off email and is on your private link. Where the claim's accounting period is not recorded, the main pool's rows are left blank and say why.
-  **Part 2, the LLP question (question 198).** Companies House says what type a company is. Built and off: a limited company or a plc filled in as "Limited company"; an LLP only once the client confirms it; anything else asked. Keeping the company type also needs the data protection officer's yes — it is now a proposed field of the source register, for him.

 **Two of Phase 153b's lines are Lakhbir's, not yours, and are not in this register:** the job cost model's tax adviser line is renamed "our own tax adviser, if we introduce one", with every figure unchanged (question 191); and Homedata is marked as the chosen planning source, still off until the account opens (question 202).

 **One thing the count found, for you to know about:** where a seller who could have claimed never did, the online estimate applies no cap and raises no flag about the pooling requirement — it applies the election and fixed-value caps only to a seller known to have claimed. The surveyor's working file does assess it. It is written into the sweep's phase of faults to check against Rulebook B. *Done by Phase 154a1 on 4 October 2026 — see that phase's section at the end of this register.*

 **And the board's own total at the close of Phase 153b, 4 October 2026, counted in code: 124 items carry that status**: fifty in FOR THE ACCOUNTANT, nine in FOR THE SURVEYOR, and sixty-five with the solicitor, the data protection officer and the developer. Fifty plus nine plus sixty-five is 124.

---

## Phase 153c, 4 October 2026 — nothing moved into or out of this register

 Phase 153c built data protection and back office work for the data protection officer to check. Two items were added to FOR THE SOLICITOR, THE DPO AND THE DEVELOPER (SDP-P41 and SDP-P42); none here.

 **And the board's own total at the close of Phase 153c, 4 October 2026, counted in code: 126 items carry that status**: fifty in FOR THE ACCOUNTANT, nine in FOR THE SURVEYOR, and sixty-seven with the solicitor, the data protection officer and the developer. Fifty plus nine plus sixty-seven is 126.


---

## Phase 153d, 4 October 2026

 Phase 153d built the commercial papers in test form for the director and the solicitor. **One dated line here: ACC-C3, the disposal note (Word question 23).** The test system shows a fixed fee of **£290** for the review and the drafted election, costed in the job cost model as four hours of our time at £60 plus the £50 data line, at cost, never a percentage of the sale or the election figure. It is marked "a test default, not agreed" in both disposal notes, on the staff disposal task and on the aftercare panel. The director decides the figure. Nothing moved into or out of this register.

 **And the board's own total at the close of Phase 153d, 4 October 2026, counted in code: 126 items carry that status**: fifty in FOR THE ACCOUNTANT, nine in FOR THE SURVEYOR, and sixty-seven with the solicitor, the data protection officer and the developer. Fifty plus nine plus sixty-seven is 126.


---

## Phase 153e, 4 October 2026

 Phase 153e built the surveyor's workbench on our recommendation. **One dated line here: ACC-A16, chapter 15's VAT half (line 17 of the phase, added by Phase 153a).** The surveyor records the claimant's VAT position with a reason. Only an exempt claimant's VAT not reclaimed is added to the price before it is shared out; a claimant that reclaims VAT adds nothing; a partly exempt claimant changes nothing and waits for you; not known and not recorded count nothing. It is a test reading, for you to check.

 **And the board's own total at the close of Phase 153e, 4 October 2026, counted in code: 126 items carry that status**: fifty in FOR THE ACCOUNTANT, nine in FOR THE SURVEYOR, and sixty-seven with the solicitor, the data protection officer and the developer. Fifty plus nine plus sixty-seven is 126.


---

## Phase 153f, 4 October 2026 — a date fault fixed in the election check; nothing moved in or out

 **The election window now reads the date it is given.** The engine's check of whether a fresh election can still be made (the two-year window) read the computer's own clock, not the date a case was run for. The back end's legal check passes a date, so a case run for a fixed date could get the wrong answer either side of the deadline. Fixed, with a test a day either side; no switch, no figure moved for a case run today.

 **And the board's own total at the close of Phase 153f, 4 October 2026, counted in code: 126 items carry that status**: fifty in FOR THE ACCOUNTANT, nine in FOR THE SURVEYOR, and sixty-seven with the solicitor, the data protection officer and the developer. Fifty plus nine plus sixty-seven is 126.


---

## Phase 153g, 4 October 2026 — nothing moved in or out

 Phase 153g built the surveyor's last ten pack chapters. Three of them hold facts for you, and decide nothing: 17 Structures allowance (the structure left after the plant and the land, worked out, never carried across from a plant answer), 18 Other reliefs (land remediation flags), and 20 Repairs or capital, which records what the surveyor saw of any works, for your repair-or-capital call. **One gap for you:** nothing in the assessment or on the claim asks whether the property was sold and leased back, or whether contamination was taken on from someone else, so chapters 16 and 18 say "not on file". Should either be asked, and where?

 **And the board's own total at the close of Phase 153g, 4 October 2026, counted in code: 126 items carry that status**: fifty in FOR THE ACCOUNTANT, nine in FOR THE SURVEYOR, and sixty-seven with the solicitor, the data protection officer and the developer. Fifty plus nine plus sixty-seven is 126.

---

## Phase 154a1, 4 October 2026 — the pooling requirement now applies in the online estimate; nothing moved in or out

 **What was wrong.** A client who bought from a tax-paying business that could have claimed capital allowances on the fixtures, but never did, got the full range with no cap and no warning. The estimate only looked at the second-hand fixtures rules where the seller was known to have claimed. Rulebook B (branch C, row C1) says the opposite: a seller who could claim but never pooled the spending, and stopped owning after April 2014, leaves the buyer nil (s.187A(4) and (3)).

 **What it does now, in all five sectors and in the surveyor's legal check alike.** It is built on, not behind a switch, because it puts the estimate back in line with Rulebook B, and it can only make a figure smaller or unsettled, never bigger.
-  **The seller could claim, never did, and stopped owning after April 2014:** nil. The flag names the pooling requirement and says what would meet it: the seller putting the spending into its pool in a tax period that began on or before the sale, which it may still be able to do by amending its return for the period of the sale. Example: a care home bought for £2,000,000 in June 2019 from a trading company that never claimed — nil, where it was a range up to the top of the band.
-  **The same seller, but we do not know when it stopped owning:** unsettled, with nil at the bottom and the top of the range shown, flagged. The date could take the rule out of force, so it is never a firm nil.
-  **The seller could claim and we do not know whether it did** ("not sure", or never asked): unsettled in the same way, nil at the bottom (row C9). "Not sure" and no answer give the same result.
-  **Unchanged:** a seller who claimed (the fixed-value rules apply, as before); a seller who could never claim (still the best case); a sale before April 2014, when the pooling requirement was not yet in force (branch D); a seller whose entitlement itself is not known (see the second point below).

 **Three things for you to check. None of them is a new question; each is already in your review pack.**
1.  **"Never claimed" is read as "never pooled".** We do not ask separately whether the seller pooled (Rulebook B, defect 9; your review pack, B-Q6, which proposes splitting the question). A claim is a pooling (s.202(3)), so a seller who claimed has pooled; we treat a seller who never claimed as one that never pooled. If a seller can pool without ever claiming an allowance, that reading is too harsh and the question needs splitting first.
2.  **How an unsettled case is shown.** We show a range with nil at the bottom and a flag, the way every other unproven s.187A position is shown, rather than no figure at all. That is your review pack's B-Q2; Rulebook B section 6 leans towards showing no figure.
3.  **A seller whose entitlement is not known, who never claimed, still gets the upper half of the band.** Rulebook B says that seller sits between branches B and C. It is not changed here; it is written into the sweep's phase to build, with nil at the bottom, and the wording for a branch D seller corrected.

 **One switch, checked again.** "The fixed value requirement needs a past owner who claimed" (fvr_requires_past_owner_claim) is now read after the pooling requirement, as Rulebook A's addendum orders them, so it cannot clear a case the pooling requirement takes to nil. Counted in code again: it still moves no figure in the online estimate, and only the surveyor's legal check, for a seller who sold before April 2014. Every other switch kept its direction.

 **And the board's own total at the close of Phase 154a1, 4 October 2026, counted in code: 126 items carry that status**: fifty in FOR THE ACCOUNTANT, nine in FOR THE SURVEYOR, and sixty-seven with the solicitor, the data protection officer and the developer. Fifty plus nine plus sixty-seven is 126.
