// Which names a deploy's blocking copies hold back, and how a held row names
// those copies.
import { globalFolders, SUPPORTED_TOOLS } from "./deploy-tools";
import { type CopyFinding, worstVerdict } from "./local-copy-guard";

// A skill whose copy the receipt covers: its force replaces every one.
// `folders`: the home-relative Global folders holding that copy; empty on a
// repo, whose copy the guard reads whole.
export type BlockingCopy = {
  name: string;
  verdict: "local-edits" | "unverified";
  folders: string[];
};

// A blocked deployed copy holds every name, since the one install rewrites it;
// only a copy the Selection does not hold yet can be left out.
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

// One per skill, at its worst tool's verdict, with the folders at that verdict.
export function blockingCopies(
  blocking: readonly CopyFinding[],
): BlockingCopy[] {
  const paths = new Map(
    globalFolders(SUPPORTED_TOOLS).map((folder) => [folder.tool, folder.path]),
  );
  return [...new Set(blocking.map((f) => f.name))].flatMap((name) => {
    const own = blocking.filter((f) => f.name === name);
    const verdict = worstVerdict(own);
    if (verdict !== "local-edits" && verdict !== "unverified") return [];
    const folders = own.flatMap((f) =>
      f.verdict === verdict && f.tool !== null ? (paths.get(f.tool) ?? []) : [],
    );
    return [{ name, verdict, folders }];
  });
}
