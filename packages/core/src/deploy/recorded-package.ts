// Reads back what apm recorded for the skill it just installed. apm exits 0 and
// prints its success marker even for a package it recorded as invalid, so this
// is the only machine-readable verdict there is (#358, apm-behavior.md).
import { parseLockfile } from "../lockfile/lockfile";
import type { FileSystemPort } from "../registry/file-system";
import type { DeployTarget, RecordedPackagePort } from "./deploy-skill";
import type { DeployedLocation } from "./deployed-location";

export class RecordedPackageAdapter implements RecordedPackagePort {
  private readonly fs: FileSystemPort;
  private readonly location: Pick<DeployedLocation, "lockfilePath">;

  constructor(deps: {
    fs: FileSystemPort;
    location: Pick<DeployedLocation, "lockfilePath">;
  }) {
    this.fs = deps.fs;
    this.location = deps.location;
  }

  async read(input: {
    target: DeployTarget;
    name: string;
  }): Promise<string | null> {
    const raw = await this.fs.readFile(
      this.location.lockfilePath(input.target),
    );
    if (raw === null) {
      return null;
    }
    const parsed = parseLockfile(raw);
    if (!parsed.ok) {
      return null;
    }
    // An entry too broken to parse leaves nothing recorded, and the install apm
    // proved stands: inventing a failure from an unreadable row would be the
    // opposite lie to the one this read exists to stop (#357, #358).
    // The exact path our own deploy writes, so a hook or a vendored lookalike
    // can never answer for the skill that was asked for (deployed-ref.ts).
    const entry = parsed.entries.find(
      (candidate) => candidate.virtual_path === `skills/${input.name}`,
    );
    return entry?.package_type ?? null;
  }
}
