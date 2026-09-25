# Security

## Report a vulnerability

Do not open a public issue for a security problem.

Report it privately on GitHub: go to the
[Security tab](https://github.com/fimoklei/maestro/security/advisories/new)
and select **Report a vulnerability**. Include the steps to reproduce it and
the Maestro version (the git tag) you used.

You get a first reply within 7 days. Maestro is maintained by one person, so
a fix can take longer. You are credited in the advisory unless you ask not to be.

## Supported versions

Only the latest release gets security fixes. Maestro is in alpha, so there
are no backports.

## Scope

Maestro is a local app. These are in scope:

- The local server: it must listen on `127.0.0.1` only and refuse requests
  from other origins.
- Commands Maestro starts (`apm`, `git`, `gh`): input must never become part
  of a shell command.
- File paths: Maestro must not read or write outside the folders you
  registered.
- Files Maestro reads (lockfiles, `apm.yml`, command output): malformed or
  hostile content must be refused.

Out of scope: problems in APM, git or `gh` themselves. Report those to their
own projects.
