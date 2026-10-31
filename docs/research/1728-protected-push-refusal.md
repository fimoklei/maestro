# What does GitHub answer when a push to a protected default branch is refused? (#1728)

Input for the `refused` push-failure class of
[#1730](https://github.com/fimoklei/maestro/issues/1730). Captured
2026-10-30 against **git 2.50.1 (Apple Git-155)** on a throwaway public
repository (`fimoklei/maestro-push-refusal-probe`), deleted afterwards.

## Captured stderr

Both refusals came from the repository owner, with no bypass. A plain push
and a lease push (`git push --atomic --force-with-lease=refs/heads/main:<tip>
origin HEAD:refs/heads/main`, as Maestro pushes) gave the same text. Exit
code 1 in all four runs.

**Classic branch protection** (pull request required, `enforce_admins: true`):

```
remote: error: GH006: Protected branch update failed for refs/heads/main.
remote:
remote: - Changes must be made through a pull request.
To https://github.com/fimoklei/maestro-push-refusal-probe.git
 ! [remote rejected] HEAD -> main (protected branch hook declined)
error: failed to push some refs to 'https://github.com/fimoklei/maestro-push-refusal-probe.git'
```

**Ruleset** (pull request required, target `~DEFAULT_BRANCH`, no bypass):

```
remote: error: GH013: Repository rule violations found for refs/heads/main.
remote: Review all repository rules at https://github.com/fimoklei/maestro-push-refusal-probe/rules?ref=refs%2Fheads%2Fmain
remote:
remote: - Changes must be made through a pull request.
remote:
To https://github.com/fimoklei/maestro-push-refusal-probe.git
 ! [remote rejected] HEAD -> main (push declined due to repository rule violations)
error: failed to push some refs to 'https://github.com/fimoklei/maestro-push-refusal-probe.git'
```

GitHub pads each `remote:` line with trailing spaces; `normalizeCommandOutput`
folds them.

## Substring to match

Match **`[remote rejected]`**, after `normalizeCommandOutput`. It is git's
own marker for a ref the receiving side declined, and both protection kinds
print it. The `GH006` / `GH013` codes and the reasons in parentheses are
GitHub's and differ per protection kind, so they are no anchor.

It must not catch:

- **Offline**: `classifyFetchFailure` phrases (`could not resolve host`,
  `failed to connect to`, …). None occurs in the refusal; check offline
  first, as `classifyPushFailure` already does.
- **Stale lease**: git refuses that client-side as
  `! [rejected] main -> main (stale info)`. `[rejected]` is not a substring of
  `[remote rejected]`, and neither refusal contains `stale info`. Match the
  bracketed marker, never a bare `rejected`.
- **Tag exists**: `already exists` does not occur in either refusal.

Any other server-side decline (a pre-receive hook, a push-size limit) also
prints `[remote rejected]`. Classing it as `refused` is right: the remote
answered no, and a retry will not help.

## UNMEASURED: missing push permission

Not captured. It needs a second GitHub account without write access to the
repository, and the probe had one account, the owner. Unverified, from
memory of GitHub's HTTPS behaviour: the server refuses before any ref update,
with `remote: Permission to <owner>/<repo>.git denied to <user>.` and
`fatal: unable to access '…': The requested URL returned error: 403`. That
text holds no `[remote rejected]`, so the substring above would class it as
`push-failed`. Capture it before #1730 claims to cover "no push rights".
