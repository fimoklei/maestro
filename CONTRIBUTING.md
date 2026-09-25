# Contributing

Issues and pull requests are welcome. Maestro is maintained by one person, so
please follow these steps. They keep your work from being wasted.

## 1. Open an issue first

Describe the bug or the change you want. Wait until the maintainer agrees to
it in the issue. A pull request without an agreed issue is closed.

Found a security problem? Do not open an issue. Follow [SECURITY.md](SECURITY.md).

## 2. Make the change

```sh
pnpm install
pnpm smoke
```

`pnpm smoke` starts Maestro against a sandbox, so it never touches your real
setup.

Your pull request must:

- **Pass `pnpm verify`.** It runs lint, typecheck and all tests.
- **Include a test** for every change in behaviour.
- **Put code in the right package:**
  - `packages/core` — the product logic. Access to files, `apm`, `git` and
    `gh` goes through an interface here.
  - `packages/server` — HTTP routes only. It checks the request and calls
    `core`.
  - `packages/web` — the screen only. It talks to the server over HTTP.

## 3. Open the pull request

- Link the agreed issue (`Closes #123`).
- If you can, use a [Conventional Commit](https://www.conventionalcommits.org/)
  title, such as `fix: show the tag of a deployed skill`. Add `!` after the
  type (`feat!: …`) when the change breaks something users rely on. This is a
  request, not a requirement: the maintainer can fix the title on merge.
- CI starts on your pull request once the maintainer approves the run.

## License

By contributing, you agree that your contribution is licensed under the
[MIT License](LICENSE). There is no CLA to sign.
