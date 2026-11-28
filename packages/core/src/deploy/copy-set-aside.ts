import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";
import type { CopyTreeFsPort } from "../filesystem/copy-tree-fs";
import type { DeployTarget } from "./deploy-ports";
import { SUPPORTED_TOOLS, type SupportedTool } from "./deploy-tools";
import type { DeployedLocation } from "./deployed-location";
import { isValidSkillSlug } from "./package-ref";
import type { PlaceReader } from "./place-reading";

export type ConsentedCopy = { name: string; tool: SupportedTool | null };

export const setAsideCopySchema = z.object({
  name: z.string().refine(isValidSkillSlug),
  tool: z.enum(SUPPORTED_TOOLS),
  token: z.string().regex(/^[0-9a-f]{16}$/),
});

export type SetAsideCopy = z.infer<typeof setAsideCopySchema>;

export class CopySetAside {
  private readonly deps: {
    fs: Pick<CopyTreeFsPort, "describe" | "movePath" | "removePath">;
    location: Pick<DeployedLocation, "treeRoot" | "toolRoots">;
    readBack: Pick<PlaceReader, "read">;
  };

  constructor(deps: CopySetAside["deps"]) {
    this.deps = deps;
  }

  plan(
    copies: readonly ConsentedCopy[],
    names: readonly string[],
  ): SetAsideCopy[] {
    const planned = new Map<string, SetAsideCopy>();
    for (const copy of copies) {
      if (!names.includes(copy.name)) continue;
      for (const tool of copy.tool === null ? SUPPORTED_TOOLS : [copy.tool]) {
        planned.set(`${copy.name}\0${tool}`, {
          name: copy.name,
          tool,
          token: randomBytes(8).toString("hex"),
        });
      }
    }
    return [...planned.values()];
  }

  async moveAside(
    target: DeployTarget,
    copies: readonly SetAsideCopy[],
  ): Promise<void> {
    for (const copy of copies) {
      const { folder, aside } = this.paths(target, copy);
      if ((await this.deps.fs.describe(folder)) !== null) {
        await this.deps.fs.movePath(folder, aside);
      }
    }
  }

  async settle(
    target: DeployTarget,
    release: string,
    copies: readonly SetAsideCopy[],
  ): Promise<void> {
    const waiting: SetAsideCopy[] = [];
    for (const copy of copies) {
      if (
        (await this.deps.fs.describe(this.paths(target, copy).aside)) !== null
      ) {
        waiting.push(copy);
      }
    }
    if (waiting.length === 0) return;
    const readings = await this.deps.readBack
      .read({
        target,
        release,
        names: [...new Set(waiting.map((copy) => copy.name))],
        tools: [...new Set(waiting.map((copy) => copy.tool))],
      })
      .catch(() => null);
    const atRelease = (copy: SetAsideCopy) =>
      readings?.places.some(
        (place) =>
          place.tool === copy.tool &&
          place.skills.some(
            (skill) =>
              skill.name === copy.name && skill.reading === "at-release",
          ),
      ) === true;
    for (const copy of waiting) {
      const { folder, aside } = this.paths(target, copy);
      if (atRelease(copy)) {
        await this.deps.fs.removePath(aside);
      } else {
        await this.deps.fs.removePath(folder);
        await this.deps.fs.movePath(aside, folder);
      }
    }
  }

  private paths(
    target: DeployTarget,
    copy: SetAsideCopy,
  ): { folder: string; aside: string } {
    const toolRoot = resolve(
      this.deps.location.treeRoot(target),
      this.deps.location.toolRoots(target)[copy.tool],
    );
    return {
      folder: resolve(toolRoot, "skills", copy.name),
      aside: resolve(toolRoot, `.maestro-set-aside-${copy.name}-${copy.token}`),
    };
  }
}
