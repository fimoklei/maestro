# Does the public repo meet its third-party licences?

Audited 2026-09-30 at `af808748` (tag `v0.1.1` is the latest release). Upstream
licences were read through `gh api repos/<owner>/<repo>/license` and the
licence files themselves. Dependency licences come from `pnpm licenses list
--json` (309 installed packages) and `--prod --json` (73), run on darwin-arm64.
The 128 lockfile packages not installed on this machine are platform builds of
listed packages plus `@emnapi/*`, `@napi-rs/wasm-runtime` and
`@tybys/wasm-util`; `npm view <pkg> license` gives the same licence as the
parent, or MIT.

## Verdict

**Not fully compliant, and the gaps are small.** Dependencies, frameworks,
GitHub Actions and the external executables create no obligation, because
Maestro redistributes none of them. The gaps are files the repo itself
carries, since a public repo and its release source archives are
redistribution:

1. Seven copied agent-tooling files (Impeccable, agent-browser, Agentation)
   ship without their licence text or a changed-file notice.
2. The Octicons entry in `THIRD-PARTY-NOTICES.md` links to the MIT text but
   does not reproduce it, and names a file that no longer exists.

One licence needs a decision: **Agentation** (`agentation@3.0.2`) is not open
source. It carries a noncompete clause, and end users run it too.

## How Maestro is distributed

- **Source only.** Every `package.json` is `"private": true`, so nothing
  publishes to npm. GitHub Releases `v0.1.0` and `v0.1.1` have no assets (`gh
  release view -R fimoklei/maestro --json assets` → `[]`), only GitHub's
  automatic source archives. There is no Dockerfile and no binary, and `dist/`
  is gitignored (`.gitignore`).
- **The user builds and fetches everything.** `README.md` → clone the tag,
  run `node scripts/bootstrap.mjs`, which runs `pnpm install` and then
  `pnpm dev` (`scripts/bootstrap.mjs:111-118`). `pnpm install` downloads every
  dependency from npm under its own licence. `pnpm dev` starts Vite's dev
  server and `tsx` (`scripts/dev.mjs:214-225`, `packages/*/package.json`), so
  no bundle is built for the user either.
- **So** the "retain the notice in copies" clauses of MIT, ISC, BSD, Apache
  §4, OFL §2 and CC-BY §3 apply only to third-party material committed to the
  repo, not to anything that `package.json` or `pnpm-lock.yaml` names. If
  Maestro ever ships a built bundle, a binary, a Docker image or an npm
  package, that changes (see "If Maestro ever ships a build").

## Findings

| Component | Licence (source) | How Maestro uses it | Obligation | Status |
|---|---|---|---|---|
| Maestro | MIT, `LICENSE`; `README.md`, `CONTRIBUTING.md` agree | own code | — | OK. No `license` field in any `package.json`, which is harmless for private packages |
| npm production deps (73) | 66 MIT, `lucide-react` + `yaml` ISC, `tslib` 0BSD, `@fontsource-variable/geist{,-mono}` OFL-1.1 (`pnpm licenses list --prod`) | named in `package.json`, fetched by the user | none, not redistributed | OK |
| npm dev deps (236 more) | MIT, ISC, Apache-2.0, BSD-2/3, BlueOak-1.0.0, MIT-0, CC0-1.0, `MIT OR Apache-2.0` (`@biomejs/biome`) | build and test tooling | none, not redistributed | OK |
| `typescript` 6/7 (Apache-2.0, with `NOTICE.txt`) | `node_modules/.pnpm/typescript@7.0.2/node_modules/typescript/NOTICE.txt` | typecheck only | Apache §4(d) applies only when redistributed | OK |
| `lightningcss` (MPL-2.0) | `pnpm licenses list` | Tailwind/Vite build step | file-level copyleft on distributing its files; CSS output is not covered | OK, the only copyleft in the tree |
| `caniuse-lite` (CC-BY-4.0) | `node_modules/.pnpm/caniuse-lite@*/…/LICENSE` | dev only, via Storybook → `@babel/core` → `browserslist` (`pnpm why caniuse-lite -r`) | attribution only when shared | OK |
| **`agentation@3.0.2`** | custom text titled "PolyForm Shield License 1.0.0", Copyright (c) 2026 Benji Taylor (`node_modules/.pnpm/agentation@3.0.2*/…/LICENSE`; same at `github.com/benjitaylor/agentation/blob/main/LICENSE`) | devDependency, rendered in `packages/web/src/main.tsx` when `import.meta.env.DEV`, which is how every end user runs the cockpit (`pnpm dev`) | no competing product; keep notices; include the licence when distributing | **Risk**, see below |
| GPL, AGPL, LGPL, EPL, CC-BY-SA, UNLICENSED | none in `pnpm licenses list` | — | — | none found |
| Spectrum UI → 4 files in `packages/web/src/ui/` | Apache-2.0, no copyright holder, no NOTICE (`gh api repos/arihantcodes/spectrum-ui/license`; `…/contents/NOTICE` → 404) | adapted code | §4(a) licence copy, §4(b) changed-file notice | OK. Full text in `THIRD-PARTY-NOTICES.md`, header line in each file, guarded by `packages/web/src/ui/third-party-notices.test.ts` |
| Octicons `mark-github` path | MIT, Copyright (c) 2026 GitHub Inc. (`primer/octicons/LICENSE`) | SVG path in `packages/web/src/ui/github-mark-link.tsx` | MIT: "copyright notice **and this permission notice** shall be included" | **Gap.** The notices file links to the text instead of including it, and names `github-link-cell.tsx`, which does not exist |
| GitHub mark (trademark) | `brand.github.com/foundations/logo` | a link to a repo's GitHub page | permitted: "Use a permitted GitHub logo to link to GitHub" | OK. Trademark, not licence |
| Geist, embedded in `docs/images/maestro-wordmark.svg` and `social-preview.svg` | OFL-1.1, "Copyright 2024 The Geist Project Authors", no Reserved Font Name (`vercel/geist-font/LICENSE.txt`; fontsource `LICENSE`) | base64 WOFF2, byte-identical to `@fontsource-variable/geist@5.3.0/files/geist-latin-wght-normal.woff2` | OFL FAQ 1.10/1.12: a font embedded in a document may travel without the OFL text; the font's own name table already holds the copyright (ID 0) and the OFL URL (ID 14) | OK |
| Radix Colors 3.0.0 hex values in `packages/web/src/styles/tokens.css` | MIT, Copyright (c) 2021-2022 Modulz, (c) 2022-Present WorkOS (`radix-ui/colors/LICENSE`) | 54 colour values copied unchanged (`DESIGN.md`) | colour values are unlikely to be copyrightable | OK. A courtesy entry is optional |
| **Impeccable → `.claude/agents/impeccable-*.md` (4)** | Apache-2.0, Copyright 2025 Paul Bakaus (`pbakaus/impeccable/LICENSE`); its `NOTICE.md` covers only `ios.md`/`android.md`, which are not copied | converted from the skill's `agents/*.toml` and edited (compare `.claude/agents/impeccable-documenter.md` with `~/.agents/skills/impeccable/agents/impeccable_documenter.toml`); commit `22e89601` | §4(a) licence copy, §4(b) changed-file notice | **Gap** |
| **agent-browser → `.agents/skills/agent-browser/SKILL.md`** | Apache-2.0, Copyright 2025 Vercel Inc. (`vercel-labs/agent-browser/LICENSE`) | copied skill (`skills-lock.json`); differs from today's upstream `skills/agent-browser/SKILL.md` | §4(a) licence copy | **Gap** |
| **Agentation → `.agents/skills/agentation/SKILL.md`** | the Agentation licence above | copied skill (`skills-lock.json`) | condition 3: "If you distribute the Software … you must include a copy of this license" | **Gap** |
| APM (`apm`) | MIT, Copyright (c) Microsoft Corporation (`microsoft/apm/LICENSE`) | started as a separate process; the user installs it (`README.md`); no APM code in the repo (`git grep -i microsoft/apm -- packages scripts` → nothing) | none | OK |
| `gh` | MIT, Copyright (c) 2019 GitHub Inc. (`cli/cli/LICENSE`) | separate process, optional, user-installed | none | OK |
| `git` | GPL-2.0-only (`git/git/COPYING`) | separate process with an args array (`.claude/rules/security.md`), user-installed, not linked or shipped | none. Maestro does not ship git, and per the GPL FAQ, "pipes, sockets and command-line arguments are communication mechanisms normally used between two separate programs" | OK |
| `osascript` / Windows PowerShell | part of the operating system | started by absolute path for the folder chooser (ADR-0032) | none | OK |
| GitHub Actions (`actions/checkout`, `setup-node`, `cache`) | MIT (`gh api repos/actions/<name>/license`) | run on GitHub's runners, pinned by SHA in `.github/workflows/*.yml` | none | OK |
| `renovate.json` | config for a hosted app | — | none | OK |

### Agentation's licence

- It is **not** the official PolyForm Shield 1.0.0. The file keeps that title
  but replaces the terms with a short MIT-style text plus three conditions
  (`node_modules/.pnpm/agentation@3.0.2*/node_modules/agentation/LICENSE`;
  official text at `polyformproject/polyform-licenses/PolyForm-Shield-1.0.0.md`).
  It is not OSI-approved.
- Condition 1: "You may not use the Software to provide a product or service
  that competes with the Software or any product or service offered by the
  Licensor that includes the Software." Maestro, a cockpit for agent skills,
  does not compete with a visual-feedback toolbar today. The terms are custom,
  though, and lack the official text's "New Products" safe harbour. If the
  licensor ships a product that overlaps with Maestro, Maestro could fall
  inside the clause.
- The cockpit shows it to every end user. The comment "Dev only (bundler drops
  this branch in prod)" in `packages/web/src/main.tsx` is true for `vite
  build`, but end users never build: the bootstrap starts `pnpm dev`, so
  `import.meta.env.DEV` is true on their machines too.

## Required actions

1. **Copied agent tooling (7 files).** Pick one:
   - **(a) Stop redistributing them.** This is the smallest change and matches
     how `.agents/skills/impeccable` is already handled. Untrack
     `.agents/skills/agent-browser/`, `.agents/skills/agentation/`, the
     symlinks `.claude/skills/agent-browser` and `.claude/skills/agentation`,
     and `.claude/agents/impeccable-*.md`, then add them to `.gitignore`.
     Keep `skills-lock.json` as the install record.
   - **(b) Keep them and add notices.** In `THIRD-PARTY-NOTICES.md`, add
     **Impeccable** (source URL, commit or version 4.1.1, "Apache License
     2.0, Copyright 2025 Paul Bakaus", the four files, "converted from TOML
     and edited"), **agent-browser** ("Apache License 2.0, Copyright 2025
     Vercel Inc.", the file) and **Agentation** (the file plus its full
     licence text, which condition 3 requires). Both Apache entries can point
     to the Apache text the file already holds. Also give each
     `impeccable-*.md` an "Adapted from Impeccable (Apache-2.0), changed" line
     (Apache §4(b)).

   Either way, the copies already sit in public history. Fixing the current
   tree and the next release is the practical remedy; rewriting history is
   not worth it.
2. **Octicons entry.** Replace the path with
   `packages/web/src/ui/github-mark-link.tsx` and paste the full MIT text,
   "Copyright (c) 2026 GitHub Inc.", into the entry. Optionally extend
   `third-party-notices.test.ts` to check the Octicons header line, as it
   already does for Spectrum UI.
3. **Agentation (decision, not strictly compliance).** Either drop the
   dependency, or show the toolbar only behind a maintainer-only opt-in
   (e.g. an env var that `pnpm smoke`/`pnpm dev` sets only for the
   maintainer) and correct the "dev only" comment. That keeps a non-open
   licence out of what end users run.

Optional: add Geist (OFL-1.1) and Radix Colors (MIT) as courtesy entries, and
`"license": "MIT"` to the root `package.json` so licence scanners pick it up.

No NOTICE file needs to be generated for npm dependencies while Maestro ships
source only. `THIRD-PARTY-NOTICES.md` stays hand-kept, because it covers only
what is copied into the repo.

## If Maestro ever ships a build

A bundle, binary, Docker image or npm package would redistribute the
production dependencies. That artifact would need every MIT, ISC and 0BSD
notice for the 73 production packages, the OFL-1.1 text for the two Geist
packages (their font files land in `dist/`), and agentation's licence if it is
bundled. The list can be generated with `pnpm licenses list --prod --json`
plus each package's `LICENSE` file, or at build time with a Vite/Rollup
licence plugin.

## Commands

```sh
pnpm licenses list --json          # all installed deps, grouped by licence
pnpm licenses list --prod --json   # what a web/server build would contain
pnpm why caniuse-lite -r           # why a flagged package is present
gh api repos/<owner>/<repo>/license --jq '.license.spdx_id'
gh release view -R fimoklei/maestro --json assets
```

## Sources

- Repo: `LICENSE`, `THIRD-PARTY-NOTICES.md`, `README.md`, `CONTRIBUTING.md`,
  `package.json`, `packages/*/package.json`, `pnpm-lock.yaml`, `.gitignore`,
  `skills-lock.json`, `scripts/bootstrap.mjs`, `scripts/dev.mjs`,
  `packages/web/src/main.tsx`, `packages/web/src/ui/github-mark-link.tsx`,
  `packages/web/src/ui/third-party-notices.test.ts`,
  `packages/web/src/styles/tokens.css`, `.github/workflows/ci.yml`,
  `.github/workflows/bootstrap-windows.yml`.
- Upstream licences: https://github.com/microsoft/apm/blob/main/LICENSE,
  https://github.com/cli/cli/blob/trunk/LICENSE,
  https://github.com/git/git/blob/master/COPYING,
  https://github.com/pbakaus/impeccable/blob/main/LICENSE and `NOTICE.md`,
  https://github.com/vercel-labs/agent-browser/blob/main/LICENSE,
  https://github.com/benjitaylor/agentation/blob/main/LICENSE,
  https://github.com/primer/octicons/blob/main/LICENSE (and its README
  licence section), https://github.com/arihantcodes/spectrum-ui/blob/main/LICENSE,
  https://github.com/vercel/geist-font/blob/main/LICENSE.txt,
  https://github.com/radix-ui/colors/blob/main/LICENSE,
  https://github.com/browserslist/caniuse-lite/blob/main/LICENSE.
- PolyForm Shield 1.0.0, official text:
  https://github.com/polyformproject/polyform-licenses/blob/main/PolyForm-Shield-1.0.0.md
- OFL FAQ 1.10 and 1.12 (embedding): https://openfontlicense.org/ofl-faq/
- GPL FAQ, mere aggregation: https://www.gnu.org/licenses/gpl-faq.html#MereAggregation
- GitHub logo usage: https://brand.github.com/foundations/logo
