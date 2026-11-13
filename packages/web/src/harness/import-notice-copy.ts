import type { LocalEditsRefusal } from "@maestro/core";
import { CHANGE_LOCATION_STEP } from "../settings/settings-copy";
import { IMPORT_LOCAL_EDITS, PROPOSE_CHANGE } from "../ui/control-labels";
import { CLOSE } from "../ui/dialog-copy";

// Import local edits has no folder to pick, so where a skill import would ask
// for another folder, the way through is the manual copy or the deployed copy
// itself.
const LOCAL_EDITS_REFUSALS: Record<LocalEditsRefusal, string> = {
  "not-configured": `${CHANGE_LOCATION_STEP}, then select ${IMPORT_LOCAL_EDITS} again.`,
  "destination-unsafe": `Nothing was copied. Make the clone's skills folder a real folder inside it, then select ${IMPORT_LOCAL_EDITS} again.`,
  "source-unreadable": `Nothing was copied. Make the folder readable, then select ${IMPORT_LOCAL_EDITS} again.`,
  "outside-root":
    "Maestro reads only inside your home folder, and this copy is outside it. Copy the changed files into the Harness clone yourself.",
  "deployed-copy":
    "Deployed by another Harness. Make the change in that Harness.",
  "origin-unproven":
    "The deployment record does not name this copy's Harness. Copy the changed files into the Harness clone yourself.",
  "missing-manifest": `This copy has no SKILL.md. Put it back, then select ${IMPORT_LOCAL_EDITS} again.`,
  "invalid-frontmatter": `Fix the SKILL.md frontmatter, then select ${IMPORT_LOCAL_EDITS} again.`,
  "empty-description": `Fill in the description in SKILL.md, then select ${IMPORT_LOCAL_EDITS} again.`,
  "harness-copy-uncommitted": `The Harness clone has uncommitted changes to this skill. Undo them, or select ${PROPOSE_CHANGE}, merge on GitHub and pull first.`,
  "harness-unreadable": `Nothing was copied. Make the Harness clone readable, then select ${IMPORT_LOCAL_EDITS} again.`,
  "nothing-to-carry-back":
    "The Harness already has these changes. See the skill on the Harness screen.",
  "invalid-name":
    "The deployment record gives this skill a name the Harness cannot use. Copy the changed files into the Harness clone yourself.",
  "name-taken":
    "The Harness already contains a skill under this name. Copy the changed files into the Harness clone yourself.",
  "not-found": `Nothing was copied. The deployed folder is gone. Select ${CLOSE}, then select ${IMPORT_LOCAL_EDITS} again.`,
  "not-a-directory": `Nothing was copied. The deployed copy is no longer a folder. Select ${CLOSE}, then select ${IMPORT_LOCAL_EDITS} again.`,
  "destination-exists":
    "The Harness already contains a folder under this name. Copy the changed files into the Harness clone yourself.",
  "unsafe-link": `Nothing was copied. Replace the symbolic link in the skill folder with a real file, then select ${IMPORT_LOCAL_EDITS} again.`,
  "hard-linked-file": `Nothing was copied. Replace the hard-linked file in the skill folder with a plain copy, then select ${IMPORT_LOCAL_EDITS} again.`,
  "special-file": `Nothing was copied. Take the special file out of the skill folder, then select ${IMPORT_LOCAL_EDITS} again.`,
  "too-many-files": `Nothing was copied. This copy contains over 1,000 files. Remove the files the skill does not need, then select ${IMPORT_LOCAL_EDITS} again.`,
  "too-large": `Nothing was copied. This copy is over 50 MiB. Remove the files the skill does not need, then select ${IMPORT_LOCAL_EDITS} again.`,
  "source-changed": `The skill was not imported. Wait for the folder change to finish, then select ${IMPORT_LOCAL_EDITS} again.`,
  "copy-failed": `The skill was not imported. Free up disk space, then select ${IMPORT_LOCAL_EDITS} again.`,
  // A record may name this Harness and still not list the folder.
  "not-an-update":
    "The deployment record does not list this folder, so Maestro cannot tell which skill it updates. Copy the changed files into the Harness clone yourself.",
  unverified:
    "Maestro holds no record of this copy's deployed files. Copy the changed files into the Harness clone yourself.",
  "copy-not-selected": `The copies changed after the check and now differ, so this skill was not imported. Select ${IMPORT_LOCAL_EDITS} again to choose a copy.`,
  "copy-not-offered": `The copies changed after the check, so this skill was not imported. Select ${IMPORT_LOCAL_EDITS} again to check them.`,
  "no-local-edits": "No local edits left in this copy. Nothing was imported.",
  "undoes-newer-changes": `The Harness changed this skill after the check, so it was not imported. Select ${IMPORT_LOCAL_EDITS} again to choose whether to undo that change.`,
};

// One sentence under a skill Import local edits did not carry back.
export function localEditsRefusal({
  refusal,
}: {
  refusal: LocalEditsRefusal;
}): string {
  return LOCAL_EDITS_REFUSALS[refusal];
}
