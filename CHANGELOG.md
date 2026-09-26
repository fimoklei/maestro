# Changelog

## v0.1.0 — 2026-09-26

First alpha release. Alpha: skills work today; hooks and MCP servers are not supported yet, and breaking changes can land between releases.

- **See every skill in one screen.** Maestro is a local web app that shows each skill you have, where every copy is deployed and which copies are behind.
- **Deploy and update skills.** Copy one skill at one released version into a project or your global folder, and update a target when the Harness has a newer release.
- **Share skills with your team through a Harness.** A Harness is a GitHub repository of shared skills. Import a skill you wrote, propose the change as a pull request, then publish a release.
- **Built on APM.** APM does the installing, pinning and tracking; Maestro reads its lockfiles and runs its commands.
- **Runs on your machine only.** The server listens on `127.0.0.1` and stores no tokens.
