// Named deploy states for a running `pnpm smoke` cockpit, each reached through
// the cockpit's own API and real apm, then read back and checked.
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  buildFixtureHarness,
  FIXTURE_ORIGIN,
  FIXTURE_PACKAGE,
  FIXTURE_RELEASES,
  fixtureRedirectEnv,
  publishFixtureRelease,
  pushUnreleasedChange,
  releasesUpTo,
} from "./fixture-harness.mjs";

const [V1_0, V1_1, V2] = FIXTURE_RELEASES;
// Between v1.1.0 and v2.0.0 code-review changes, release-notes goes and
// test-plan arrives; commit-message stays identical.
const AT_V1 = ["code-review", "commit-message", "release-notes"];
const AT_V2 = ["code-review", "commit-message", "test-plan"];

// Each scenario is one consuming repository. `atV1` runs while v1.1.0 is the
// latest release, `atV2` once v2.0.0 is published.
const SCENARIOS = [
  { name: "empty", expect: { status: "Empty" } },
  {
    name: "in-sync",
    atV2: (s, repo) => s.deploy(repo, AT_V2),
    expect: { status: "In sync" },
  },
  {
    name: "behind",
    atV1: (s, repo) => s.deploy(repo, AT_V1),
    expect: {
      status: "Behind",
      release: "v1.1.0 → v2.0.0",
      preview: {
        changed: ["code-review"],
        removed: ["release-notes"],
        newInRelease: ["test-plan"],
      },
    },
  },
  {
    name: "mixed-releases",
    atV1: (s, repo) => s.deploy(repo, AT_V1),
    // A deployed folder apm cannot write stops the Update after the other
    // tool's copies moved.
    atV2: (s, repo) =>
      s.whileUnwritable(join(repo, ".agents/skills/code-review"), () =>
        s.update(repo),
      ),
    expect: { status: "Mixed releases", notice: "Update incomplete" },
  },
  {
    name: "local-edits",
    atV2: async (s, repo) => {
      await s.deploy(repo, AT_V2);
      appendFileSync(
        join(repo, ".claude/skills/code-review/SKILL.md"),
        "\nA line edited by hand after the deploy.\n",
      );
    },
    expect: {
      status: "Local edits",
      skills: { "code-review": "Local edits" },
    },
  },
  {
    name: "unverified",
    atV2: async (s, repo) => {
      await s.deploy(repo, AT_V2);
      forgetRecordedHashes(join(repo, "apm.lock.yaml"), "commit-message");
    },
    expect: { status: "In sync", skills: { "commit-message": "Unverified" } },
  },
  {
    name: "pinned-per-skill",
    // The cockpit no longer deploys one dependency per skill, so apm does it.
    atV1: (s, repo) => {
      s.installSkillDependency(repo, "code-review", V1_0);
      s.installSkillDependency(repo, "commit-message", V1_1);
    },
    expect: { status: "Pinned per skill" },
  },
  {
    name: "unfinished-operation",
    atV2: async (s, repo) => {
      await s.deploy(repo, ["code-review"]);
      await s.whileUnwritable(join(repo, ".agents/skills"), () =>
        s.deploy(repo, ["commit-message"], { expectRefusal: true }),
      );
    },
    expect: { notice: "Deploy incomplete" },
  },
];

// Seeds the Harness itself, not a consuming repository.
const HARNESS_SCENARIO = "harness-outcomes";
const DELETED_LOCALLY = "code-review";
const UNRELEASED = "commit-message";

export const SCENARIO_NAMES = [
  ...SCENARIOS.map((scenario) => scenario.name),
  HARNESS_SCENARIO,
];

/** The scenario names `--scenario` asks for, or null when it is absent. */
export function parseScenarioArg(argv) {
  const at = argv.indexOf("--scenario");
  if (at === -1) return null;
  const value = argv[at + 1];
  if (value === undefined || value.startsWith("--"))
    throw new Error(
      `--scenario names a scenario: ${SCENARIO_NAMES.join(", ")}, or all`,
    );
  if (value === "all") return [...SCENARIO_NAMES];
  const names = value.split(",").filter(Boolean);
  for (const name of names) {
    if (!SCENARIO_NAMES.includes(name))
      throw new Error(
        `unknown scenario "${name}"; valid: ${SCENARIO_NAMES.join(", ")}, or all`,
      );
  }
  return [...new Set(names)];
}

const NOTICE = {
  deploy: "Deploy incomplete",
  remove: "Removal incomplete",
  update: "Update incomplete",
};

// A copy of how the Deploy-state screen words a target, since a script cannot
// import the web's TypeScript; a web test holds the two together.
function targetStatus({ deployState, drift }) {
  const { primitives, skipped, releaseHead, pinnedPerSkill } = deployState;
  const pending = deployState.pendingOperation;
  const names = new Set(primitives.map((primitive) => primitive.name));
  const driftRead = "behind" in drift;
  const reads = (reading) =>
    driftRead &&
    drift.behind.some(
      (entry) => entry.reading === reading && names.has(entry.name),
    );

  let indicator;
  if (
    skipped.some(
      (entry) =>
        entry.reason === "unmanageable-skill" ||
        entry.reason === "invalid-package",
    )
  )
    indicator = "attention";
  else if (primitives.length === 0 && skipped.length === 0) indicator = "empty";
  else if (!driftRead) indicator = "unknown";
  else if (reads("no-longer-released")) indicator = "attention";
  else if (reads("behind")) indicator = "drift";
  else indicator = "ok";

  const localEdits = primitives.some(
    (primitive) => primitive.copy === "local-edits",
  );
  const behind =
    releaseHead !== undefined &&
    releaseHead.latestRelease !== null &&
    releaseHead.latestRelease !== releaseHead.release &&
    pending === undefined;

  if (pending?.kind === "update") return "Mixed releases";
  if (localEdits && indicator === "attention") return "Attention";
  if (localEdits) return "Local edits";
  if (pinnedPerSkill !== undefined) return "Pinned per skill";
  return {
    ok: behind ? "Behind" : "In sync",
    attention: "Attention",
    drift: "Behind",
    empty: "Empty",
    unknown: "Unknown",
  }[indicator];
}

// A skill row's one mark, first match wins.
function skillMark(primitive, drift) {
  if (primitive.copy === "local-edits") return "Local edits";
  if (primitive.copy === "unverified") return "Unverified";
  if (!("behind" in drift))
    return drift.reason === "unverified" ? "Unverified" : "Unknown";
  const reading = drift.behind.find(
    (entry) => entry.name === primitive.name,
  )?.reading;
  if (reading === "no-longer-released") return "No longer released";
  if (reading === "behind") return "Behind";
  return "Up to date";
}

function releaseColumn({ releaseHead, pinnedPerSkill }) {
  if (releaseHead === undefined) return pinnedPerSkill?.[0]?.release ?? null;
  const { release, latestRelease } = releaseHead;
  return latestRelease && latestRelease !== release
    ? `${release} → ${latestRelease}`
    : release;
}

/** What the Deploy-state screen shows for one repository, in its own words. */
export function readCockpit(read) {
  const pending = read.deployState.pendingOperation;
  return {
    status: targetStatus(read),
    release: releaseColumn(read.deployState),
    notice: pending ? NOTICE[pending.kind] : null,
    skills: Object.fromEntries(
      read.deployState.primitives.map((primitive) => [
        primitive.name,
        skillMark(primitive, read.drift),
      ]),
    ),
    ...(read.preview
      ? {
          preview: {
            changed: read.preview.changed.map((row) => row.name),
            removed: read.preview.removed,
            newInRelease: read.preview.newInRelease.map((row) => row.name),
          },
        }
      : {}),
  };
}

const shown = (value) => (value == null ? "none" : `"${value}"`);
const list = (names) => [...names].sort().join(", ") || "none";

/** Null when the cockpit shows every fact the scenario declares. */
export function scenarioMismatch(scenario, repoPath, observed) {
  const { expect } = scenario;
  const problems = [];
  for (const key of ["status", "release", "notice"]) {
    if (key in expect && expect[key] !== observed[key])
      problems.push(
        `${key} expected ${shown(expect[key])}, got ${shown(observed[key])}`,
      );
  }
  for (const [name, mark] of Object.entries(expect.skills ?? {})) {
    if (observed.skills[name] !== mark)
      problems.push(
        `${name} expected ${shown(mark)}, got ${shown(observed.skills[name])}`,
      );
  }
  for (const [section, names] of Object.entries(expect.preview ?? {})) {
    const actual = observed.preview?.[section] ?? [];
    if (list(actual) !== list(names))
      problems.push(
        `Update preview ${section} expected [${list(names)}], got [${list(actual)}]`,
      );
  }
  return problems.length === 0
    ? null
    : `scenario "${scenario.name}" (${repoPath}): ${problems.join("; ")}`;
}

// The row one stage shows for `skill`, or why there is none.
function stageRow(stage, skill) {
  if (stage.outcome !== "read")
    return { missing: `a stage read as "${stage.outcome}"` };
  const row = stage.rows.find((candidate) => candidate.skill === skill);
  return row ?? { missing: "none" };
}

/** Null when `/api/harness` shows both states the Harness scenario seeds. */
export function harnessMismatch({ releaseState, stages }) {
  const problems = [];
  const deletion = stageRow(stages.proposal, DELETED_LOCALLY);
  if (deletion.status !== "deleted-locally" || !deletion.restorable)
    problems.push(
      `${DELETED_LOCALLY} expected a restorable "deleted-locally" row in the proposal stage, got ${deletion.missing ?? `"${deletion.status}"${deletion.restorable ? "" : ", not restorable"}`}`,
    );
  const change = stageRow(stages.release, UNRELEASED);
  if (change.status !== "changed")
    problems.push(
      `${UNRELEASED} expected a "changed" row in the release stage, got ${change.missing ?? `"${change.status}"`}`,
    );
  if (releaseState !== "pending-release")
    problems.push(
      `release state expected "pending-release", got ${shown(releaseState)}`,
    );
  return problems.length === 0
    ? null
    : `scenario "${HARNESS_SCENARIO}": ${problems.join("; ")}`;
}

/** Files whose recorded hash lacks the `sha256:` prefix every copy check expects. */
export function unprefixedHashes(lockfileText) {
  const files = [];
  let inHashes = false;
  for (const line of lockfileText.split("\n")) {
    if (/^ {2}deployed_file_hashes:/.test(line)) {
      inHashes = true;
      continue;
    }
    const entry = inHashes ? /^ {4}(\S.*?): (\S+)$/.exec(line) : null;
    if (entry === null) {
      inHashes = false;
      continue;
    }
    if (!entry[2].startsWith("sha256:")) files.push(entry[1]);
  }
  return files;
}

/** Null when the clone mirrored every fixture release at its commit. */
export function releaseMirrorProblem({ expected, mirrored }) {
  if (Object.keys(mirrored).length === 0)
    return (
      "the fixture Harness clone holds no releases under refs/maestro/tags: " +
      "the GIT_CONFIG_* redirect did not reach the cockpit's git, so its fetch " +
      "went to the empty GitHub name holder. Restart `pnpm smoke` and re-run."
    );
  for (const [tag, commit] of Object.entries(expected)) {
    if (mirrored[tag] !== commit)
      return `refs/maestro/tags/${tag} is ${mirrored[tag] ?? "missing"}, expected ${commit}`;
  }
  return null;
}

// Drops one skill's lines from the record's hashes, so its copies have
// nothing to be checked against.
function forgetRecordedHashes(lockfilePath, skill) {
  const recorded = new RegExp(`^ {4}\\S+/skills/${skill}/\\S*: sha256:`);
  const text = readFileSync(lockfilePath, "utf8");
  writeFileSync(
    lockfilePath,
    text
      .split("\n")
      .filter((line) => !recorded.test(line))
      .join("\n"),
  );
}

function mirroredReleases(clone) {
  const out = execFileSync(
    "git",
    [
      "-C",
      clone,
      "for-each-ref",
      "--format=%(refname:lstrip=3) %(objectname)",
      "refs/maestro/tags",
    ],
    { encoding: "utf8" },
  ).trim();
  return Object.fromEntries(
    out === "" ? [] : out.split("\n").map((line) => line.split(" ")),
  );
}

/** Where scenario seeding keeps its trees; a run owns every one of them. */
export function scenarioPaths(sandboxDir) {
  const projects = join(sandboxDir, "home", "Projects");
  return {
    sandboxDir,
    home: join(sandboxDir, "home"),
    work: join(sandboxDir, "fixture-harness-work"),
    bare: join(sandboxDir, "fixture-harness.git"),
    clone: join(projects, "maestro-fixture-harness"),
    repos: join(projects, "scenarios"),
  };
}

function makeWritable(dir) {
  if (existsSync(dir))
    execFileSync("chmod", ["-R", "u+w", dir], { stdio: "ignore" });
}

// Unregisters every earlier scenario repo, clears its unfinished-operation
// records and deletes it, so nothing of a previous run shows.
async function wipe(api, paths) {
  const { repos } = await api.get("/api/registry/repos");
  for (const { path } of repos ?? []) {
    if (path.startsWith(paths.repos))
      await api.del("/api/registry/repos", { path });
  }
  const configPath = join(paths.sandboxDir, "config.json");
  if (existsSync(configPath)) {
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    if (Array.isArray(config.targetOperations)) {
      config.targetOperations = config.targetOperations.filter(
        (record) => !record.key.startsWith(paths.repos),
      );
      writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    }
  }
  makeWritable(paths.repos);
  rmSync(paths.repos, { recursive: true, force: true });
  rmSync(paths.bare, { recursive: true, force: true });
  rmSync(paths.clone, { recursive: true, force: true });
}

async function refreshAndCheckMirror(api, paths, commits, release) {
  const refreshed = await api.post("/api/harness/refresh", {});
  const problem = releaseMirrorProblem({
    expected: Object.fromEntries(
      releasesUpTo(release).map((tag) => [tag, commits[tag]]),
    ),
    mirrored: mirroredReleases(paths.clone),
  });
  if (problem !== null)
    throw new Error(
      `${problem} (harness read: ${refreshed?.freshness?.outcome ?? "no outcome"})`,
    );
}

function githubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
  } catch {
    return undefined;
  }
}

function seedingSteps(api, paths) {
  const target = (repo) => ({ kind: "repo", repoPath: repo });
  const token = githubToken();
  const apmEnv = {
    ...process.env,
    HOME: paths.home,
    ...fixtureRedirectEnv(paths.bare, process.env),
    ...(token ? { GITHUB_TOKEN: token } : {}),
  };
  return {
    async deploy(repo, names, { expectRefusal = false } = {}) {
      const report = await api.post("/api/deploy/bulk", {
        names,
        target: target(repo),
      });
      const landed = report.deployed.length === names.length;
      if (landed === expectRefusal)
        throw new Error(
          `deploying ${names.join(", ")} to ${repo} ${expectRefusal ? "was expected to stop half-way but landed" : `did not land: ${JSON.stringify({ attention: report.attention, failed: report.failed })}`}`,
        );
    },
    async update(repo) {
      const { preview } = await api.post("/api/deploy/update/preflight", {
        target: target(repo),
      });
      const { status } = await api.post(
        "/api/deploy/update",
        { target: target(repo), token: preview.token },
        { allowRefusal: true },
      );
      if (status < 300)
        throw new Error(
          `the update of ${repo} was expected to stop half-way but finished`,
        );
    },
    async whileUnwritable(dir, act) {
      chmodSync(dir, 0o555);
      try {
        await act();
      } finally {
        chmodSync(dir, 0o755);
      }
    },
    installSkillDependency(repo, skill, release) {
      execFileSync(
        "apm",
        [
          "install",
          `${FIXTURE_PACKAGE}/.apm/skills/${skill}#${release}`,
          "-t",
          "claude,codex",
        ],
        { cwd: repo, env: apmEnv, stdio: "ignore" },
      );
    },
  };
}

async function observe(api, scenario, repo) {
  const query = `?repo=${encodeURIComponent(repo)}`;
  const deployState = await api.get(`/api/deploy-state${query}`);
  const drift = await api.get(`/api/drift${query}`);
  const preview = scenario.expect.preview
    ? (
        await api.post("/api/deploy/update/preflight", {
          target: { kind: "repo", repoPath: repo },
        })
      ).preview
    : undefined;
  return readCockpit({
    deployState,
    drift,
    ...(preview ? { preview } : {}),
  });
}

/**
 * Wipes earlier scenario repos, builds the fixture Harness, connects it and
 * seeds each named scenario; returns one mismatch message per failing check.
 */
export async function seedScenarios({ api, sandboxDir, fixtureDir, names }) {
  const paths = scenarioPaths(realpathSync(sandboxDir));
  await wipe(api, paths);

  const commits = buildFixtureHarness({ fixtureDir, workDir: paths.work });
  publishFixtureRelease({
    workDir: paths.work,
    bareDir: paths.bare,
    release: V1_1,
  });
  execFileSync("git", ["clone", "-q", paths.bare, paths.clone]);
  execFileSync("git", [
    "-C",
    paths.clone,
    "remote",
    "set-url",
    "origin",
    FIXTURE_ORIGIN,
  ]);
  await api.post("/api/inventory/connect", { path: paths.clone });
  await refreshAndCheckMirror(api, paths, commits, V1_1);

  const scenarios = SCENARIOS.filter((scenario) =>
    names.includes(scenario.name),
  );
  const repoOf = (scenario) => join(paths.repos, scenario.name);
  for (const scenario of scenarios) {
    mkdirSync(repoOf(scenario), { recursive: true });
    execFileSync("git", ["init", "-q", repoOf(scenario)]);
    await api.post("/api/registry/repos", { path: repoOf(scenario) });
  }

  const steps = seedingSteps(api, paths);
  for (const scenario of scenarios)
    await scenario.atV1?.(steps, repoOf(scenario));

  publishFixtureRelease({
    workDir: paths.work,
    bareDir: paths.bare,
    release: V2,
  });
  await refreshAndCheckMirror(api, paths, commits, V2);
  for (const scenario of scenarios)
    await scenario.atV2?.(steps, repoOf(scenario));

  const problems = [];
  for (const scenario of scenarios) {
    const repo = repoOf(scenario);
    const lockfile = join(repo, "apm.lock.yaml");
    const unprefixed = existsSync(lockfile)
      ? unprefixedHashes(readFileSync(lockfile, "utf8"))
      : [];
    if (unprefixed.length > 0)
      problems.push(
        `scenario "${scenario.name}" (${repo}): recorded hashes without the sha256: prefix: ${unprefixed.join(", ")}`,
      );
    const mismatch = scenarioMismatch(
      scenario,
      repo,
      await observe(api, scenario, repo),
    );
    if (mismatch !== null) problems.push(mismatch);
  }
  const seeded = scenarios.map(repoOf);
  // Last, so no deploy reading is taken against the changed Harness.
  if (names.includes(HARNESS_SCENARIO)) {
    seeded.push(paths.clone);
    pushUnreleasedChange({
      workDir: paths.work,
      bareDir: paths.bare,
      skill: UNRELEASED,
    });
    rmSync(join(paths.clone, ".apm", "skills", DELETED_LOCALLY), {
      recursive: true,
    });
    const mismatch = harnessMismatch(
      await api.post("/api/harness/refresh", {}),
    );
    if (mismatch !== null) problems.push(mismatch);
  }
  return { repos: seeded, problems };
}
