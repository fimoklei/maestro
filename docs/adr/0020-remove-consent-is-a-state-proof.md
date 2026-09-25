# ADR-0020 — A remove consent proves the state was priced, not that a human clicked

- **Status:** Accepted
- **Date:** 2026-08-02 (decision made in #458, which required this record if the
  receipt landed as shape A; written on #380, which had asked for the expiry and
  single-use enforcement this ADR declines)

## Context

Removing a deployed skill destroys files on the user's own machine, and two of
those destructions are worse than the request that names them:

- **A copy carrying local edits.** apm deletes it silently
  on a same-ref install, so the dialog's warning is the only
  thing standing between a tidy-up and lost work. #337 settled that an edited
  copy still goes — destruction is the intent — on the user's word.
- **A leftover copy of a tool this machine no longer detects.** #339 built that
  reclaim; #390 made it visible, because consent given for a named set and
  deletion performed on a larger one is the exact failure a dialog exists to
  prevent.

Both rest on the same seam. `preflight` prices the removal and the dialog states
it; `execute` acts. Nothing in the HTTP contract ties the two halves together.
The web client forwards what the dialog showed, but the server cannot see a
dialog — it sees a request, and a request can come from a retry client, a
script, a hand-built curl, or a UI regression. #458 found that `execute` refused
only an *unreadable* copy: a diverged one was deleted on the caller's word,
never checked.

The seam also drifts. An editor autosave between the check and the click changes
what the removal costs, and a tool reinstalled and removed again can make the
same leftover path reappear months later. Consent stated against the earlier
reading is not obviously consent for the later one — and #380 asked for expiry
and single-use enforcement on that basis.

#458 named two shapes. **A:** the preflight mints a token the execute must
carry, mirroring the reclaim consent #390 already built. **B:** an explicit
override flag, mirroring the deploy destination guard (ADR-0006). A landed.

## Decision

**Both remove consents are HMACs over what this server itself priced. They hold
no server-side state: no store of issued tokens, no expiry, no single-use
consumption.**

`RemoveConsentIssuer` (`packages/core/src/deploy/remove-consent.ts`) mints two,
kept apart by a `kind` in the signed payload so neither can pass as the other:

- **The reclaim token** binds target, skill name, and the sorted set of leftover
  paths a global removal would delete (#390).
- **The removal receipt** binds target, skill name, and the canonical cost the
  check found — every warning, across the detected tools *and* the reclaimable
  ones, since `runCheck` prices both (#458).

Three properties carry the statelessness, and each is bounded:

- **`execute` re-prices before it acts.** The receipt is matched against what is
  on disk when the removal runs, not against what the caller claims. A copy that
  diverged between the dialog and the click is caught by that second pricing:
  the check changes, the receipt no longer matches, and the removal stops with
  `cost-not-acknowledged` — which restates the fresh cost and a fresh receipt, so
  agreeing is one more click rather than a second round trip.
- **`grants` rebuilds the reclaim preview from the live tool probe.** A token is
  compared against the offer the current state would mint, so it can never
  authorize a set a fresh preflight would not name, and an empty set mints no
  token at all.
- **The signing secret is per-instance.** `RemoveConsentIssuer` is constructed by
  `RemoveDeployedSkill`, one secret per use-case instance. It never crosses the
  wire and is never persisted, so no proof outlives the instance that minted it —
  in the shipped server, the process.

**What the model claims, stated exactly:** a valid proof means *this instance
priced this state*. It does not mean the state still holds at the moment of
deletion, that the pricing was recent, or that a human saw a dialog. The three
gaps that follow from that are named in Consequences, and none of them is closed
by expiry or single-use — see Rejected alternatives.

## Consequences

- A removal that would destroy local work is refused unless the request carries
  the server's own proof of the cost. Nothing changes for a user going through a
  dialog: the web flows already run the preflight and forward both proofs.
- The bulk route inherits the contract unchanged. It fans out single removals, so
  one unproven target is refused as its own row and never aborts the batch.
- Consent has no session. Two dialogs open on the same unchanged target hold
  interchangeable proofs, and either can confirm what the other showed.

Three residual gaps follow, all accepted:

- **A non-dialog client.** A script can mint its own proofs by calling
  `preflight`. The guarantee is against *stale* and *forged* consent, never
  against a caller who asked no human. Closing it needs a real session, which
  Maestro has no other reason to have: a local-first single-user cockpit bound to
  `127.0.0.1`.
- **A write between the pricing and the delete.** `execute` prices, checks the
  receipt, and only then calls apm. Nothing holds the files still across that
  window — the apm write lock serialises Maestro's own operations, not an editor
  running beside it. Work saved inside it is deleted without ever having been
  priced. Narrowing the window is the only cheap move; closing it needs a content
  snapshot verified at the delete itself, which #337 has to answer first, since
  it settled that an edited copy goes anyway once warned.
- **Recreated state of equal cost.** If a skill is removed, reinstalled at the
  same paths, and removed again with the same warning categories — all within one
  use-case instance — the proofs from the first removal are byte-identical to the
  second's, and the earlier request can authorize the later deletion. The user is
  never shown something other than what is deleted, because equal proofs mean
  equal state. What is lost is the tie to the confirmation they actually clicked.
  This is the one gap single-use consumption would genuinely close; the cost is
  weighed in Rejected alternatives.
- Adding a third consent needs a new `kind` and an amendment here. Two proofs on
  one request is already the ceiling worth carrying; a third would mean the seam
  is being patched rather than designed.

## Rejected alternatives

- **Single-use consumption (#380's original ask).** It would close the
  recreated-state gap above, and nothing else: every other replay is already
  bound by re-pricing and the live rebuild to exactly what the current state
  warrants. The price is a server-side store of issued tokens, with its own
  eviction policy and its own answer for what a restart means — the first piece
  of durable state in a use case that has none. Weighed against a gap that needs
  a reinstall at identical paths with identical warnings inside one process, and
  that deletes only what the current state describes, the store costs more than
  it buys. Revisit if consent ever has to outlive the process.
- **A token lifetime.** Weaker than the above and no cheaper to reason about: it
  rejects a proof for being old rather than for being wrong, so it would refuse
  legitimate slow confirmations while still admitting a fresh proof over the same
  recreated state. The per-instance secret already caps every proof at the
  process.
- **Shape B, an override flag.** Smaller, and symmetrical with the deploy guard.
  Rejected because a client sets it without asking anyone: it documents intent
  where A proves the server did the pricing.
- **One combined proof instead of two.** Rejected on blast radius. The reclaim
  names paths outside the request; the receipt names none. Merging them would let
  a receipt for an ordinary removal carry the authority to delete a leftover
  nobody was shown.
- **Trusting the client to have shown the dialog.** The state before #458, and
  the reason it was opened.
