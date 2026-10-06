# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root — the canonical glossary.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.

New terms and decisions land there through the `/domain-modeling` skill.

## File structure

Single-context repo (this repo):

```
/
├── GLOSSARY.md
├── docs/adr/        ← one NNNN-<decision>.md per decision
└── packages/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0001 (APM is the engine, Maestro is the cockpit) — but worth reopening because…_
