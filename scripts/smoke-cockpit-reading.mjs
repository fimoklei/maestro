// How the Deploy-state screen reads one seeded repository, in its own words,
// so a smoke scenario can check the cockpit against what it seeded.

const NOTICE = {
  deploy: "Deploy incomplete",
  remove: "Removal incomplete",
  update: "Update incomplete",
};

// A copy of how the Deploy-state screen words a target, since a script cannot
// import the web's TypeScript; a web test holds the two together.
function driftIndicator(
  { names, skipped, skippedCount, followsRelease },
  drift,
) {
  const driftRead = "behind" in drift;
  const reads = (reading) =>
    driftRead &&
    drift.behind.some(
      (entry) => entry.reading === reading && names.has(entry.name),
    );
  if (
    skipped.some(
      (entry) =>
        entry.reason === "unmanageable-skill" ||
        entry.reason === "invalid-package",
    )
  )
    return "attention";
  if (names.size === 0 && skippedCount === 0) return "empty";
  if (!driftRead) return "unknown";
  if (!followsRelease && reads("no-longer-released")) return "attention";
  if (reads("behind")) return "drift";
  return "ok";
}

const HELD_WORDS = [
  ["localEdits", "Local edits"],
  ["missing", "Skills missing"],
  ["notUpdated", "Not updated"],
  ["editsInHarness", "Edits in the Harness"],
];

const TARGET_WORDS = [
  ...Object.values(NOTICE),
  "Attention",
  ...HELD_WORDS.map(([, word]) => word),
  "Behind",
  "Unknown",
  "In sync",
  "Pinned per skill",
  "Other origin",
  "Empty",
];

function statusWord({ indicator, held, pinned, behind, pending }) {
  if (pending) return NOTICE[pending];
  const heldWord = HELD_WORDS.find(([key]) => held[key])?.[1];
  if (heldWord !== undefined)
    return indicator === "attention" ? "Attention" : heldWord;
  if (pinned) return "Pinned per skill";
  return {
    ok: behind ? "Behind" : "In sync",
    attention: "Attention",
    drift: "Behind",
    empty: "Empty",
    foreign: "Other origin",
    unknown: "Unknown",
  }[indicator];
}

const isBehind = (releaseHead, pending) =>
  releaseHead !== undefined &&
  releaseHead.latestRelease !== null &&
  releaseHead.latestRelease !== releaseHead.release &&
  pending === undefined;

const holdsCopy = (primitives, copy) =>
  primitives.some((primitive) => primitive.copy === copy);

function targetStatus({ deployState, drift }) {
  const { primitives, skipped, releaseHead, pinnedPerSkill } = deployState;
  const pending = deployState.pendingOperation?.kind;
  return statusWord({
    indicator: driftIndicator(
      {
        names: new Set(primitives.map((primitive) => primitive.name)),
        skipped,
        skippedCount: skipped.length,
        followsRelease: releaseHead !== undefined,
      },
      drift,
    ),
    held: {
      localEdits: holdsCopy(primitives, "local-edits"),
      editsInHarness: holdsCopy(primitives, "edits-in-harness"),
    },
    pinned: pinnedPerSkill !== undefined,
    behind: isBehind(releaseHead, pending),
    pending,
  });
}

// A skill row's one mark, first match wins.
function skillMark(primitive, drift) {
  if (primitive.copy === "local-edits") return "Local edits";
  if (primitive.copy === "unverified") return "Unverified";
  const held =
    primitive.copy === "edits-in-harness" ? "Edits in the Harness" : null;
  if (!("behind" in drift))
    return drift.reason === "unverified" ? "Unverified" : "Unknown";
  const reading = drift.behind.find(
    (entry) => entry.name === primitive.name,
  )?.reading;
  if (reading === "no-longer-released") return "No longer released";
  if (held !== null) return held;
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

// The Import local edits dialog's group for one checked skill.
function importGroup({ refusal, undoesNewerSince }) {
  if (refusal !== null) return "Cannot be imported";
  return undoesNewerSince === undefined
    ? "Can be imported"
    : "Undoes newer Harness changes";
}

/** What the Deploy-state screen shows for one repository, in its own words. */
export function readCockpit(read) {
  // A refused read shows the card's failure notice and nothing else.
  if (read.deployState === null)
    return {
      status: "Couldn't read this repository's deploy-state.",
      release: null,
      notice: null,
      skills: {},
    };
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
    ...(read.localEdits
      ? {
          imports: Object.fromEntries(
            read.localEdits.map((skill) => [skill.name, importGroup(skill)]),
          ),
        }
      : {}),
  };
}

function folderReading(folder, skill) {
  if (folder.missing?.includes(skill)) return "missing";
  const copy = folder.primitives.find((each) => each.name === skill);
  if (copy?.copy === "local-edits") return "localEdits";
  if (folder.notUpdated?.copies.some((each) => each.name === skill))
    return "notUpdated";
  return null;
}

const folderWord = (status) =>
  status === "In sync" || status === "Behind" ? "Up to date" : status;

const worstWord = (words) =>
  words.reduce(
    (worst, word) =>
      worst === null || TARGET_WORDS.indexOf(word) < TARGET_WORDS.indexOf(worst)
        ? word
        : worst,
    null,
  );

export function readGlobalCockpit({ deployState, drift }) {
  const { primitives, folders, skipped, releaseHead, pinnedPerSkill } =
    deployState;
  const pending = deployState.pendingOperation?.kind;
  const skills = primitives.map((primitive) => primitive.name);
  const behind = isBehind(releaseHead, pending);
  const pinned = pinnedPerSkill !== undefined;
  const rows = folders
    .filter((folder) => folder.detected)
    .map((folder) => {
      const counts = { missing: 0, notUpdated: 0, localEdits: 0 };
      for (const skill of skills) {
        const reading = folderReading(folder, skill);
        if (reading !== null) counts[reading] += 1;
      }
      const indicator = driftIndicator(
        {
          names: new Set(folder.primitives.map((primitive) => primitive.name)),
          skipped,
          skippedCount: 0,
          followsRelease: releaseHead !== undefined,
        },
        drift,
      );
      const status = statusWord({
        indicator:
          indicator === "empty" && deployState.otherOrigins.length > 0
            ? "foreign"
            : indicator,
        held: {
          localEdits: counts.localEdits > 0,
          missing: counts.missing > 0,
          notUpdated: counts.notUpdated > 0,
          editsInHarness: holdsCopy(folder.primitives, "edits-in-harness"),
        },
        pinned,
        behind,
        pending,
      });
      return { path: folder.path, status, counts };
    });
  const strayDiffers =
    releaseHead !== undefined &&
    folders.some(
      (folder) =>
        !folder.detected &&
        (folder.strayCopies ?? []).some((copy) => !copy.atRelease),
    );
  return {
    status: worstWord([
      ...rows.map((row) => row.status),
      ...(strayDiffers ? ["Not updated"] : []),
    ]),
    release: releaseColumn(deployState),
    notice: pending ? NOTICE[pending] : null,
    skills: {},
    folders: Object.fromEntries(
      rows.map(({ path, status, counts }) => [
        path,
        { word: folderWord(status), counts },
      ]),
    ),
  };
}
