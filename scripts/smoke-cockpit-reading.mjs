// How the Deploy-state screen reads one seeded repository, in its own words,
// so a smoke scenario can check the cockpit against what it seeded.

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
  // Update target removes a dropped skill from a target that follows one release.
  else if (releaseHead === undefined && reads("no-longer-released"))
    indicator = "attention";
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

  if (pending) return NOTICE[pending.kind];
  if (localEdits && indicator === "attention") return "Attention";
  if (localEdits) return "Local edits";
  const harnessEdits = primitives.some(
    (primitive) => primitive.copy === "edits-in-harness",
  );
  if (harnessEdits && indicator === "attention") return "Attention";
  if (harnessEdits) return "Edits in the Harness";
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
      status: "Deploy-state not read.",
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
