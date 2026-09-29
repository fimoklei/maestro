// The made-up Harness the smoke scenarios deploy from, built from committed
// release trees so every run yields the same commit ids.
import { execFileSync } from "node:child_process";
import { appendFileSync, cpSync, readdirSync, rmSync } from "node:fs";
import { devNull } from "node:os";
import { join } from "node:path";

// A real, public and empty GitHub repository: apm's install pre-flight only
// asks the API whether it exists, and a failed redirect finds no tags there.
const OWNER_REPO = "fimoklei/maestro-fixture-harness";
export const FIXTURE_ORIGIN = `https://github.com/${OWNER_REPO}.git`;
/** The package apm installs it as. */
export const FIXTURE_PACKAGE = `github.com/${OWNER_REPO}`;
const FIXTURE_URL_FORMS = [
  `https://github.com/${OWNER_REPO}`,
  `git@github.com:${OWNER_REPO}`,
];

export const FIXTURE_RELEASES = ["v1.0.0", "v1.1.0", "v2.0.0"];

export const releasesUpTo = (release) =>
  FIXTURE_RELEASES.slice(0, FIXTURE_RELEASES.indexOf(release) + 1);

// The operator's own git config (signing, hooks, default branch) must not
// reach the fixture, or its commit ids would differ per machine.
const FIXED_GIT_ENV = {
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Maestro fixture",
  GIT_AUTHOR_EMAIL: "fixture@maestro.invalid",
  GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
  GIT_COMMITTER_NAME: "Maestro fixture",
  GIT_COMMITTER_EMAIL: "fixture@maestro.invalid",
  GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
};

const git = (cwd, args) =>
  execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...FIXED_GIT_ENV },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

/**
 * Where apm and Maestro's own git are sent instead of GitHub: `bareDir`
 * without its `.git`, since git finds `<path>.git` for a local path and the
 * origin's own `.git` suffix lands on the same repository.
 */
export function fixtureRedirectEnv(bareDir, env) {
  const target = bareDir.replace(/\.git$/, "");
  const first = Number(env.GIT_CONFIG_COUNT ?? 0) || 0;
  const entries = {};
  FIXTURE_URL_FORMS.forEach((form, index) => {
    entries[`GIT_CONFIG_KEY_${first + index}`] = `url.${target}.insteadOf`;
    entries[`GIT_CONFIG_VALUE_${first + index}`] = form;
  });
  return {
    ...entries,
    GIT_CONFIG_COUNT: String(first + FIXTURE_URL_FORMS.length),
  };
}

/**
 * Commits each release tree in `fixtureDir` over the last and tags it; returns
 * each release's commit id.
 */
export function buildFixtureHarness({ fixtureDir, workDir }) {
  rmSync(workDir, { recursive: true, force: true });
  execFileSync("git", ["init", "-q", "-b", "main", workDir], {
    env: { ...process.env, ...FIXED_GIT_ENV },
  });
  const commits = {};
  for (const release of FIXTURE_RELEASES) {
    for (const entry of readdirSync(workDir)) {
      if (entry !== ".git")
        rmSync(join(workDir, entry), { recursive: true, force: true });
    }
    cpSync(join(fixtureDir, release), workDir, { recursive: true });
    git(workDir, ["add", "-A"]);
    git(workDir, ["commit", "-q", "-m", `Release ${release}`]);
    git(workDir, ["tag", release]);
    commits[release] = git(workDir, ["rev-parse", "HEAD"]);
  }
  return commits;
}

/** Makes `bareDir` hold every release up to `release`, with main at it. */
export function publishFixtureRelease({ workDir, bareDir, release }) {
  const upTo = releasesUpTo(release);
  if (upTo.length === 0) throw new Error(`no fixture release ${release}`);
  rmSync(bareDir, { recursive: true, force: true });
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", bareDir], {
    env: { ...process.env, ...FIXED_GIT_ENV },
  });
  git(workDir, [
    "push",
    "-q",
    "--force",
    bareDir,
    `${release}:refs/heads/main`,
    ...upTo.map((tag) => `refs/tags/${tag}:refs/tags/${tag}`),
  ]);
}

/**
 * Commits one edit to `skill` on top of the last release and pushes it to
 * `bareDir`'s main, untagged, so the Harness has work to release.
 */
export function pushUnreleasedChange({ workDir, bareDir, skill }) {
  appendFileSync(
    join(workDir, ".apm", "skills", skill, "SKILL.md"),
    "\nAn edit merged after the last release.\n",
  );
  git(workDir, ["commit", "-q", "-am", `Edit ${skill} after the last release`]);
  git(workDir, ["push", "-q", bareDir, "HEAD:refs/heads/main"]);
}
