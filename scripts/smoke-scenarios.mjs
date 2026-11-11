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
import { seedToolPresence } from "./seed-sandbox.mjs";
import { readCockpit } from "./smoke-cockpit-reading.mjs";

export { readCockpit };

const [V1_0, V1_1, V2] = FIXTURE_RELEASES;
// Between v1.1.0 and v2.0.0 code-review changes, release-notes goes and
// test-plan arrives; commit-message stays identical.
const AT_V1 = ["code-review", "commit-message", "release-notes"];
const AT_V2 = ["code-review", "commit-message", "test-plan"];

// Each scenario is one consuming repository. `atV1` runs while v1.1.0 is the
// latest release, `atV2` once v2.0.0 is published.
const SCENARIOS = [
  {
    name: "empty",
    summary: "A registered repo with nothing deployed.",
    expect: { status: "Empty" },
  },
  {
    name: "in-sync",
    summary: "Every skill deployed at v2.0.0, the latest release.",
    atV2: (s, repo) => s.deploy(repo, AT_V2),
    expect: { status: "In sync" },
  },
  {
    name: "behind",
    summary:
      "Deployed at v1.1.0 while v2.0.0 is out: one skill changed, one gone, one new.",
    atV1: (s, repo) => s.deploy(repo, AT_V1),
    expect: {
      status: "Behind",
      release: "v1.1.0 → v2.0.0",
      skills: {
        "code-review": "Behind",
        "commit-message": "Up to date",
        "release-notes": "No longer released",
      },
      preview: {
        changed: ["code-review"],
        removed: ["release-notes"],
        newInRelease: ["test-plan"],
      },
    },
  },
  {
    name: "mixed-releases",
    summary: "An Update to v2.0.0 that stopped after one tool's copies moved.",
    atV1: (s, repo) => s.deploy(repo, AT_V1),
    // A deployed folder apm cannot write stops the Update after the other
    // tool's copies moved.
    atV2: (s, repo) =>
      s.whileUnwritable(join(repo, ".agents/skills/code-review"), () =>
        s.update(repo),
      ),
    expect: { status: "Update incomplete", notice: "Update incomplete" },
  },
  {
    name: "local-edits",
    summary: "Deployed at v2.0.0, then code-review edited by hand.",
    atV2: async (s, repo) => {
      await s.deploy(repo, AT_V2);
      editByHand(repo, "code-review");
    },
    expect: {
      status: "Local edits",
      skills: { "code-review": "Local edits" },
    },
  },
  {
    name: "edits-in-harness",
    summary:
      "Deployed at v2.0.0, then test-plan edited by hand and imported into the Harness.",
    // test-plan, because no other scenario edits it: the Working harness is shared.
    atV2: async (s, repo) => {
      await s.deploy(repo, AT_V2);
      editByHand(repo, "test-plan");
      await s.importLocalEdits(repo, ["test-plan"]);
    },
    expect: {
      status: "Edits in the Harness",
      skills: { "test-plan": "Edits in the Harness" },
    },
  },
  {
    name: "deploy-again",
    summary:
      "Only code-review deployed and edited, so deploying commit-message offers Deploy again.",
    // A deploy that adds commit-message meets the edited code-review copy, so
    // the bulk deploy Report offers Deploy commit-message again.
    atV2: async (s, repo) => {
      await s.deploy(repo, ["code-review"]);
      editByHand(repo, "code-review");
    },
    expect: {
      status: "Local edits",
      skills: { "code-review": "Local edits" },
    },
  },
  {
    name: "unverified",
    summary:
      "In sync, but commit-message has no recorded hashes to check its copies against.",
    atV2: async (s, repo) => {
      await s.deploy(repo, AT_V2);
      forgetRecordedHashes(join(repo, "apm.lock.yaml"), "commit-message");
    },
    expect: { status: "In sync", skills: { "commit-message": "Unverified" } },
  },
  {
    name: "pinned-per-skill",
    summary:
      "Each skill installed by apm as its own dependency, at different releases.",
    // The cockpit no longer deploys one dependency per skill, so apm does it.
    atV1: (s, repo) => {
      s.installSkillDependency(repo, "code-review", V1_0);
      s.installSkillDependency(repo, "commit-message", V1_1);
    },
    expect: { status: "Pinned per skill" },
  },
  {
    name: "unfinished-operation",
    summary: "A deploy that stopped halfway, so its record stays.",
    atV2: async (s, repo) => {
      await s.deploy(repo, ["code-review"]);
      await s.whileUnwritable(join(repo, ".agents/skills"), () =>
        s.deploy(repo, ["commit-message"], { expectRefusal: true }),
      );
    },
    expect: { status: "Deploy incomplete", notice: "Deploy incomplete" },
  },
  {
    name: "import-edits",
    summary:
      "Two skills edited by hand on a v1.1.0 deploy; only code-review changed in v2.0.0.",
    // Both edited on a v1.1.0 deploy; only code-review moved in v2.0.0. Also
    // behind, so Update target shows its consent rows.
    atV1: (s, repo) => s.deploy(repo, AT_V1),
    atV2: (_s, repo) => {
      editByHand(repo, "code-review");
      editByHand(repo, "commit-message");
    },
    expect: {
      status: "Local edits",
      imports: {
        "code-review": "Undoes newer Harness changes",
        "commit-message": "Can be imported",
      },
    },
  },
  {
    name: "unreadable",
    summary: "An apm.lock.yaml that does not parse.",
    atV2: (_s, repo) =>
      writeFileSync(join(repo, "apm.lock.yaml"), "dependencies: [\n"),
    expect: { status: "Deploy-state not read." },
  },
];

// Seed the Harness itself, not a consuming repository: one restorable Deletion
// in Pending proposal and one unreleased Edit to release. No import scenario
// edits DELETED_LOCALLY, whose copies would read as another Harness's, and
// import-edits' unmoved skill is never UNRELEASED.
const HARNESS_SCENARIO = "harness-outcomes";
const DELETED_LOCALLY = "test-plan";
const UNRELEASED = "code-review";
// One of the fixture Harness's prompts sorted into a category.
const PROMPT_CATEGORY = { prompt: "plan-feature", category: "Planning" };
// Leaves the Harness unreachable until the next `pnpm smoke` run.
const OFFLINE_SCENARIO = "harness-offline";
// Port 1 refuses every connection, so git reports "Failed to connect".
const UNREACHABLE_ORIGIN = "http://127.0.0.1:1/";

/** Every scenario `--scenario` seeds, with one line saying what it seeds. */
export const SCENARIO_CATALOG = [
  ...SCENARIOS.map(({ name, summary }) => ({ name, summary })),
  {
    name: HARNESS_SCENARIO,
    summary:
      "The Harness itself: one restorable deletion and one unreleased edit.",
  },
  {
    name: OFFLINE_SCENARIO,
    summary: "The Harness remote stops answering until the next `pnpm smoke`.",
  },
];

export const SCENARIO_NAMES = SCENARIO_CATALOG.map(({ name }) => name);

function editByHand(repo, skill) {
  appendFileSync(
    join(repo, ".claude/skills", skill, "SKILL.md"),
    "\nA line edited by hand after the deploy.\n",
  );
}

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

/** The fixture release `--release` asks for, or null when it is absent. */
export function parseReleaseArg(argv) {
  const at = argv.indexOf("--release");
  if (at === -1) return null;
  const value = argv[at + 1];
  const valid = FIXTURE_RELEASES.join(", ");
  if (value === undefined || value.startsWith("--"))
    throw new Error(`--release names a fixture release: ${valid}`);
  if (!FIXTURE_RELEASES.includes(value))
    throw new Error(`unknown fixture release "${value}"; valid: ${valid}`);
  return value;
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
  for (const [name, group] of Object.entries(expect.imports ?? {})) {
    if (observed.imports?.[name] !== group)
      problems.push(
        `Import local edits groups ${name} under ${shown(observed.imports?.[name])}, expected ${shown(group)}`,
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
  const row = stage.rows.find(
    (candidate) => candidate.type === "skill" && candidate.name === skill,
  );
  return row ?? { missing: "none" };
}

/** Null when `/api/harness` shows both states the Harness scenario seeds. */
export function harnessMismatch({ releaseState, stages }) {
  const problems = [];
  const deletion = stageRow(stages.proposal, DELETED_LOCALLY);
  if (deletion.change !== "deletion" || !deletion.restorable)
    problems.push(
      `${DELETED_LOCALLY} expected a restorable "deletion" row in the proposal stage, got ${deletion.missing ?? `"${deletion.change}"${deletion.restorable ? "" : ", not restorable"}`}`,
    );
  const edit = stageRow(stages.release, UNRELEASED);
  if (edit.change !== "edit")
    problems.push(
      `${UNRELEASED} expected an "edit" row in the release stage, got ${edit.missing ?? `"${edit.change}"`}`,
    );
  if (releaseState !== "pending-release")
    problems.push(
      `release state expected "pending-release", got ${shown(releaseState)}`,
    );
  return problems.length === 0
    ? null
    : `scenario "${HARNESS_SCENARIO}": ${problems.join("; ")}`;
}

/** Null when the Harness read found its remote unreachable. */
export function harnessOfflineMismatch({ freshness }) {
  return freshness?.outcome === "offline"
    ? null
    : `scenario "${OFFLINE_SCENARIO}": the Harness read expected "offline", got ${shown(freshness?.outcome)}`;
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
// records and deletes it, empties the global target, so nothing of a previous
// run shows.
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
  // The sandbox's global target.
  for (const path of [
    ".apm/apm.yml",
    ".apm/apm.lock.yaml",
    ".apm/apm_modules",
    ".claude/skills",
    ".agents/skills",
  ])
    rmSync(join(paths.home, path), { recursive: true, force: true });
  seedToolPresence(paths.home);
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
    // `repo` null deploys to the global target.
    async deploy(repo, names, { expectRefusal = false } = {}) {
      const report = await api.post("/api/deploy/bulk", {
        names,
        target: repo === null ? { kind: "global" } : target(repo),
      });
      const landed = report.deployed.length === names.length;
      if (landed === expectRefusal)
        throw new Error(
          `deploying ${names.join(", ")} to ${repo ?? "the global target"} ${expectRefusal ? "was expected to stop half-way but landed" : `did not land: ${JSON.stringify({ attention: report.attention, failed: report.failed })}`}`,
        );
    },
    async importLocalEdits(repo, names) {
      const { outcomes } = await api.post("/api/deploy/import-local-edits", {
        target: target(repo),
        names,
        undo: [],
        selected: [],
      });
      const refused = outcomes.filter((outcome) => outcome.refusal !== null);
      if (refused.length > 0)
        throw new Error(
          `importing ${names.join(", ")} from ${repo} was refused: ${JSON.stringify(refused)}`,
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
  const target = { kind: "repo", repoPath: repo };
  const state = await api.get(`/api/deploy-state${query}`, {
    allowRefusal: true,
  });
  const drift = await api.get(`/api/drift${query}`);
  const preview = scenario.expect.preview
    ? (await api.post("/api/deploy/update/preflight", { target })).preview
    : undefined;
  const localEdits = scenario.expect.imports
    ? (await api.post("/api/deploy/import-local-edits/check", { target }))
        .skills
    : undefined;
  return readCockpit({
    deployState: state.status < 300 ? state.body : null,
    drift,
    ...(preview ? { preview } : {}),
    ...(localEdits ? { localEdits } : {}),
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
  // A category lives in Maestro's config, never in the Harness.
  await api.post(
    "/api/categories",
    { name: PROMPT_CATEGORY.category },
    { allowRefusal: true },
  );
  await api.post("/api/categories/assign", {
    items: [{ type: "prompt", name: PROMPT_CATEGORY.prompt }],
    category: PROMPT_CATEGORY.category,
  });

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
  if (names.some((name) => [HARNESS_SCENARIO, OFFLINE_SCENARIO].includes(name)))
    seeded.push(paths.clone);
  // Last, so no deploy reading is taken against the changed Harness.
  if (names.includes(HARNESS_SCENARIO)) {
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
  // After every other Harness read: from here on no fetch of the clone
  // answers. The clone's own redirect names the full origin, so it outmatches
  // the shorter one the cockpit's environment carries; apm never reads it.
  if (names.includes(OFFLINE_SCENARIO)) {
    execFileSync("git", [
      "-C",
      paths.clone,
      "config",
      `url.${UNREACHABLE_ORIGIN}.insteadOf`,
      FIXTURE_ORIGIN,
    ]);
    const mismatch = harnessOfflineMismatch(
      await api.post("/api/harness/refresh", {}),
    );
    if (mismatch !== null) problems.push(mismatch);
  }
  return { repos: seeded, problems };
}

/**
 * Moves the seeded fixture Harness to `release`, forward or back, and checks
 * that the cockpit's fetch mirrors exactly the releases up to it.
 */
export async function publishRelease({ api, sandboxDir, release }) {
  const paths = scenarioPaths(realpathSync(sandboxDir));
  if (!existsSync(paths.work) || !existsSync(paths.clone))
    throw new Error(
      "no fixture Harness to move yet: seed one first with `pnpm smoke:ready --scenario <name>`",
    );
  const commits = Object.fromEntries(
    releasesUpTo(release).map((tag) => [
      tag,
      execFileSync("git", ["-C", paths.work, "rev-parse", `${tag}^{commit}`], {
        encoding: "utf8",
      }).trim(),
    ]),
  );
  publishFixtureRelease({ workDir: paths.work, bareDir: paths.bare, release });
  await refreshAndCheckMirror(api, paths, commits, release);
  return paths.clone;
}
