# ADR-0009 — Filesystem-browse endpoint for path selection

- **Status:** Accepted — overrides roadmap `01.5`'s "paste-a-path only"
  deferral, on the owner's deliberate call.
- **Date:** 2026-06-29

## Context

Roadmap `01.5` deferred the interactive directory-browser picker: *"paste-a-path
only this step; a server-side filesystem-listing endpoint is deferred (security
surface vs. core value)."* The stated reason — a directory-listing endpoint is
the **most security-sensitive surface in MVP1**, for one of the least-core
subjobs, so paste-a-path carries the feature without it.

The owner then adopted the "First run story flow" design as direction for the
first-run experience. That design puts a **browse…** affordance next to the path
field on both inventory-connect and repo-register. The owner decided the guided
picker is worth the surface **now** — removing first-run friction and matching
the designed experience — and overrode the deferral deliberately. This ADR
records that the override was conscious, so a future reader does not "fix" it as
an accidental reversal of a security decision.

## Decision

Add a **server-side directory-listing endpoint behind a core port**, used by the
web picker for both inventory-connect and repo-register (one endpoint, the shared
connect/register form component).

- **Root ceiling:** the user's home directory. Any path resolving outside it is
  rejected.
- **Directories only** — the endpoint never returns file contents.
- **Order:** normalize → `realpath` → assert inside the root; reject `..` and
  symlink escapes (`security.md` path rules).
- **Read-only** enumeration; no writes.
- Reuses the existing localhost-bind + `Origin`/`Host` guard for CSRF /
  DNS-rebinding; that guard does **not** address info-disclosure — the root
  ceiling does.

Paste-a-path stays supported. Browse is **additive**, not a replacement.

## Consequences

- Reverses `01.5`'s paste-only deferral; the roadmap text is updated alongside.
- **New security surface:** a directory-listing endpoint. The home-root ceiling
  bounds info disclosure to the user's own home, but this is still the widest
  read surface in MVP1 — flagged for review, watch it.
- One endpoint serves both the **Inventory source** connect and repo
  registration through the shared form.
- Moderately hard to reverse once dogfooded: removing the picker (keeping paste)
  is a capability regression, not a no-op.
- **Amendment (issue #150):** the endpoint also reports per-entry facts — is a
  git repo, has a `skills/` subdirectory — computed for every child while still
  bounded by the same home-root ceiling; no new surface beyond what the picker
  already lists. The endpoint stays fact-only: it never decides what to badge.
  That decision (register mode badges `git` repos and already-registered ones;
  connect mode badges folders that look like an inventory) lives entirely on
  the client, keeping the server registry-agnostic.
- **Amendment (issue #148):** a child that is itself a symlink is now included
  in the listing — tagged `isSymlink` — when its *target* resolves inside the
  home ceiling, following the same normalize → realpath → assert-inside-root
  order applied per entry, not just to the browsed path. A symlink whose
  target is missing, is not a directory, or resolves outside the ceiling is
  dropped from the listing entirely; the endpoint never discloses that it
  exists. A symlinked entry is never probed for git/skills facts — doing so
  would mean following it a second time into a target this endpoint has not
  validated for a read that deep, reopening a fresh, unvalidated ceiling
  window one hop further than the rest of this ADR accepts; it reports no
  facts and shows only the tag. Every entry also carries `isHidden` (a
  dot-prefixed name, a pure string check — no new disk access); hidden
  filtering happens entirely client-side from that flag, so one response
  shape serves both the hidden-by-default view and the show-hidden toggle.

## Rejected alternatives

- **Keep paste-only (`01.5` as-is).** Lowest surface; the owner judged the
  first-run friction worth removing now.
- **Native OS file dialog.** A browser cannot hand the server a real
  server-side path, and the local server cannot trigger an OS dialog on the
  client — unavailable in this client/server architecture (ADR-0002).
- **Unbounded listing (no root ceiling).** Maximal info disclosure via a
  localhost endpoint; rejected.
