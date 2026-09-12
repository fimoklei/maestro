// What one release a target follows and which skills sit under it, read from
// the same deploy-state the cards show — so the Update preview and the card can
// never disagree about what is deployed (ADR-0031, #953).
import type { DeployTarget } from "../deploy/deploy-skill";
import type {
  TargetSelectionPort,
  TargetSelectionResult,
} from "../deploy/update-target";
import type { GlobalDeployStateReader } from "./deploy-state-reader";

export class TargetSelectionAdapter implements TargetSelectionPort {
  private readonly deps: {
    deployState: Pick<GlobalDeployStateReader, "read" | "readGlobal">;
    // apm's own global location, resolved server-side (J07).
    globalRoot: () => string;
  };

  constructor(deps: TargetSelectionAdapter["deps"]) {
    this.deps = deps;
  }

  async read(target: DeployTarget): Promise<TargetSelectionResult> {
    if (target.kind === "repo") {
      const state = await this.deps.deployState.read(target.repoPath);
      if (!state.ok) {
        return { ok: false, reason: "lockfile-malformed" };
      }
      // No Release head is a target on no single release: Empty, or still
      // pinned per skill. Neither has an update to preview.
      return state.releaseHead === undefined
        ? { ok: false, reason: "not-deployed" }
        : {
            ok: true,
            release: state.releaseHead.release,
            selection: state.primitives.map((primitive) => primitive.name),
          };
    }

    const state = await this.deps.deployState.readGlobal(
      this.deps.globalRoot(),
    );
    if (!state.ok) {
      return { ok: false, reason: "lockfile-malformed" };
    }
    // One Selection for the whole detected tool set: global adopts as one set,
    // like Deploy and Remove (spec story 32).
    const release = state.tools.find((group) => group.releaseHead !== undefined)
      ?.releaseHead?.release;
    if (release === undefined) {
      return { ok: false, reason: "not-deployed" };
    }
    const selection = new Set(
      state.tools.flatMap((group) =>
        group.primitives.map((primitive) => primitive.name),
      ),
    );
    return { ok: true, release, selection: [...selection] };
  }
}
