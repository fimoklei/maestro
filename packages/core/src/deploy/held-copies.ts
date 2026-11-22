import { type GlobalLayout, globalFolderPath } from "./deploy-tools";
import { type CopyFinding, worstVerdict } from "./local-copy-guard";

export type BlockingCopy = {
  name: string;
  verdict: "local-edits" | "unverified";
  folders: string[];
};

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
