// Which names a deploy's blocking copies hold back, and how a held row names
// those copies.
import { type GlobalLayout, globalFolderPath } from "./deploy-tools";
import { type CopyFinding, worstVerdict } from "./local-copy-guard";

/**
 * A skill whose copy the receipt covers: its force replaces every one.
 * `folders`: the Global folders holding that copy; empty on a repo.
 */
export type BlockingCopy = {
  name: string;
  verdict: "local-edits" | "unverified";
  folders: string[];
};

/**
 * The names a blocking copy holds back: every name when the copy is already
 * deployed, since the one install rewrites it.
 */
export function heldByCopies(
  candidates: readonly string[],
  deployed: readonly string[],
  blocking: readonly CopyFinding[],
): string[] {
  if (blocking.some((f) => deployed.includes(f.name))) {
    return [...candidates];
  }
  return candidates.filter((name) => blocking.some((f) => f.name === name));
}

/** One per skill, at its worst tool's verdict, with the folders at that verdict. */
export function blockingCopies(
  blocking: readonly CopyFinding[],
  layout: GlobalLayout,
): BlockingCopy[] {
  return [...new Set(blocking.map((f) => f.name))].flatMap((name) => {
    const own = blocking.filter((f) => f.name === name);
    const verdict = worstVerdict(own);
    if (verdict !== "local-edits" && verdict !== "unverified") return [];
    const folders = own.flatMap((f) =>
      f.verdict === verdict && f.tool !== null
        ? [globalFolderPath(f.tool, layout)]
        : [],
    );
    return [{ name, verdict, folders }];
  });
}
