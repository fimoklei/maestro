import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gitOptions } from "./non-interactive";

const run = promisify(execFile);

const OBJECT_HEADER = /^[0-9a-f]{40,64} (\w+) (\d+)$/;

// One `git cat-file --batch` for every spec (`<rev>:<path>`). Each answer is
// the blob's bytes, or null where the spec names no blob. Rejects when git
// fails, so a broken read never passes for missing files.
export async function readBlobs(
  root: string,
  specs: readonly string[],
): Promise<(Buffer | null)[]> {
  // The protocol is line-based: a spec holding a newline cannot be asked.
  const askable = specs.filter((spec) => !spec.includes("\n"));
  if (askable.length === 0) {
    return specs.map(() => null);
  }
  const pending = run("git", ["-C", root, "cat-file", "--batch"], {
    ...gitOptions(),
    encoding: "buffer",
    maxBuffer: 256 * 1024 * 1024,
  });
  pending.child.stdin?.end(askable.map((spec) => `${spec}\n`).join(""));
  const { stdout } = await pending;

  const answers = new Map<string, Buffer | null>();
  let offset = 0;
  for (const spec of askable) {
    const end = stdout.indexOf(0x0a, offset);
    if (end === -1) {
      throw new Error("cat-file answered fewer objects than asked");
    }
    const header = stdout.subarray(offset, end).toString("utf8");
    offset = end + 1;
    const match = OBJECT_HEADER.exec(header);
    if (match === null) {
      // `<spec> missing` or `<spec> ambiguous`.
      answers.set(spec, null);
      continue;
    }
    const size = Number(match[2]);
    answers.set(
      spec,
      match[1] === "blob" ? stdout.subarray(offset, offset + size) : null,
    );
    // The content is followed by one newline.
    offset += size + 1;
  }
  return specs.map((spec) => answers.get(spec) ?? null);
}
