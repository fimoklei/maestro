import { createHash } from "node:crypto";
import {
  appendFileSync,
  cpSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";

export function editCopyByHand(skillDir) {
  appendFileSync(
    join(skillDir, "SKILL.md"),
    "\nA line edited by hand after the deploy.\n",
  );
}

export function recordHashes(lockfileText, hashes) {
  const lines = lockfileText.split("\n");
  for (const [file, hash] of Object.entries(hashes)) {
    const at = lines.findIndex((line) => line.startsWith(`    ${file}: `));
    if (at === -1) throw new Error(`the lockfile records no hash for ${file}`);
    lines[at] = `    ${file}: ${hash}`;
  }
  return lines.join("\n");
}

const fileHash = (path) =>
  `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;

export function putOlderCopy({
  root,
  lockfilePath,
  releaseTree,
  copyDir,
  skill,
}) {
  const copy = join(root, copyDir, skill);
  rmSync(copy, { recursive: true, force: true });
  cpSync(join(releaseTree, ".apm", "skills", skill), copy, { recursive: true });
  const hashes = Object.fromEntries(
    readdirSync(copy, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const path = join(entry.parentPath, entry.name);
        return [relative(root, path), fileHash(path)];
      }),
  );
  writeFileSync(
    lockfilePath,
    recordHashes(readFileSync(lockfilePath, "utf8"), hashes),
  );
}
