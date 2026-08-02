# ADR-0015 — First run is a connect gate, not a wizard

- **Status:** Accepted
- **Date:** 2026-07-20
- **Amended 2026-08-01** by ADR-0021 (issue #352) — see *Amendments*. The
  headline decision stands; three points below no longer hold as written.

## Context

The first-run flow shipped as a three-step wizard: welcome, connect the
inventory, register consuming repos, with a progress strip promising a third
step, `3 · deploy`, that no screen delivers. The `/impeccable critique` of
2026-07-20 (snapshot `.impeccable/critique/2026-07-20T19-16-46Z__packages-web-src-wizard.md`,
score 21/40) traced most of its findings to one structural question rather
than to individual defects: the cockpit is already the destination — does the
wizard earn its existence? Its P0: the flow ends on four `Nothing deployed
here.` cards with no deploy affordance, so the most memorable moment of
onboarding is a dead end.

Two facts framed the decision. The strongest moment in the product —
`✓ 36 primitives found · read-only, never writes back` — exists *because* the
wizard forces a stop-and-read beat, so dissolving everything risks losing it.
And registering a repo, the moment Maestro is granted a **write** target,
carried no safety clause at all; nobody had yet decided what Maestro promises
about folders it can write into. Issue
[#208](https://github.com/fimoklei/maestro/issues/208) demanded both answers
in this ADR.

## Decision

**The wizard shrinks to a connect gate: welcome plus the connect form, then
straight into the cockpit.** The gate is the one precondition — a cockpit
without an inventory has nothing to show — so it is not a detour; everything
beyond it is.

1. **Two screens, no progress strip.** A welcome intro, then the connect
   form. There is no step 2 and no promised step 3, so nothing advertises
   more than the flow delivers. The first-run gate guards both routes;
   a configured install cannot re-enter them. Copy follows the voice rule
   (no "you"/"we") and each screen carries a real `<h1>`.
2. **The reassurance beat stays on the gate.** Connect success keeps its
   explicit confirmation state — the primitive count plus
   `read-only, never writes back` — with a deliberate continue action, not an
   auto-navigate. This is where that promise lives.
3. **The gate lands on Inventory,** not Deploy-state. The first image after
   setup is the connected primitives with their `deploy →` actions — and a
   deploy is genuinely possible immediately, because global targets exist
   without any registration (detected tools, ADR-0011). This retires the
   critique's P0 empty-state ending.
4. **Registration has exactly one control: `+ repo` in the sidebar.** The
   empty Deploy-state and the deploy target picker (when no repos are
   registered) each gain an informational line pointing at it — information,
   never a duplicate button.
5. **The write promise is two-part and shown at the registration action**, in
   the browse dialog, in the connect line's register: *registering writes
   nothing; writes happen only on an explicit deploy and touch only the
   chosen primitive plus apm's bookkeeping.* Exact copy is decided at build
   time; this ADR fixes the content of the promise and its location.

## Consequences

- The four onboarding fixes parked under #208's "Blocks" resolve as: step-2
  primary action — obsolete (no step 2); land on Inventory — decided here;
  gate every wizard route — absorbed (two routes remain, both guarded);
  voice/`<h1>` fixes — absorbed for the two remaining screens. All build work
  lands as **one spec issue**, not four.
- The browse dialog stays, reached only via `+ repo` — it becomes
  post-onboarding surface, which changes where issue #212's improvements
  apply.
- The gate keeps a maintained surface (two screens) that a full dissolve
  would have deleted; that is the price of keeping the reassurance beat on
  its own stage.

## Rejected alternatives

- **Dissolve the wizard entirely** — connect as an amber row inside the empty
  Deploy-state. Fewest clicks, but the product's best moment loses its
  stop-and-read stage, and the highest-anxiety action (pointing a local web
  app at a filesystem path) happens inside a busy surface.
- **Keep the three-step wizard and fix it** — four fixes were already scoped.
  Rejected because the shape itself makes a promise (`3 · deploy`) the flow
  cannot keep, and duplicates registration the sidebar already owns.
- **Pre-checked "register all" of sibling git repos** — on the gate's success
  state or as the picker's default. Rejected outright: registration keeps a
  single deliberate route, and a bulk opt-out default sits badly with the
  write promise made in the same breath.

## Amendments

### 2026-08-01 — ADR-0021, issue #352

The gate itself is unchanged: welcome plus connect form, no wizard, unreachable
once configured. Three points were written when Maestro was consumer-only.

- **Point 2 — the read-only promise.** `read-only, never writes back` is no
  longer true of the repository. Maestro writes into the **working harness**
  when the author promotes or releases (ADR-0021). The reassurance beat stays
  and the promise narrows to the one that holds: **a deploy never writes back to
  the inventory.** Exact copy is still decided at build time; this fixes the
  content.
- **Point 3 — "the gate lands on Inventory".** No longer fixed. A joining member
  may have Maestro clone the harness for them (#366), and the landing screen
  follows the outcome of that. Inventory stays the landing for the case this ADR
  described — a local clone that already exists.
- **Point 1 — "two screens".** Still two screens, but the second is no longer
  guaranteed instant: the connect form now accepts a GitHub URL as well as a
  path, and a clone takes as long as it takes (#366).
