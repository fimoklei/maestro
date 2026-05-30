# CLAUDE.md

Thin Claude Code adapter. Canonical context lives in `AGENTS.md`.

@AGENTS.md
@.claude/rules/testing.md

## Claude Code Specific Instructions

- **TDD is BLOCKING for code.** Before any Edit/Write to code: invoke the `/tdd` skill and write the failing test first. RED → GREEN → REFACTOR. No exceptions for "too simple" or "single file". Docs-only changes are exempt.
- **Never reimplement APM.** Drive it, read its lockfiles (ADR-0001).
- **Prefer Edit over Write.** Edit existing files unless a new abstraction is genuinely required.
- **Use plan mode** for refactors spanning >3 files or changing public behavior. Get approval on the strategy before touching code.
- **Map to a subjob first.** Name the `J01`–`J09` subjob before behavior-changing work; if none fits, stop and ask.
- **Run local verification before declaring done** — once code exists. For docs: the hierarchy checks in `AGENTS.md` → Verification.
